import React, { useEffect, useState, useRef, useMemo } from 'react';
import { meet } from '@googleworkspace/meet-addons';
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";
import Peer, { DataConnection } from 'peerjs';
import type { RealtimeChannel } from '@supabase/supabase-js';
import throttle from 'lodash.throttle';
import { createRealtimeSession, joinPrivateBoardChannel, sendPrivateBoardMessage } from '../realtime/supabase';
import "./whiteboard.css";

const PREFIX = "meetboard-xyz-";

const MainStage = () => {
  const themeOverrides = {
    "--color-primary": "#d494aa",
    "--color-primary-darker": "#d64c7e",
    "--color-primary-darkest": "#e86e99",
    "--color-primary-light": "#dcbec9",
    "--default-bg-color": "#7cec13",
    "--canvas-background-color": "#7cec13",
  } as React.CSSProperties;
  
  const [pin, setPin] = useState<string>('');
  const [isLobby, setIsLobby] = useState(true);
  const [peerReady, setPeerReady] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [activeConnections, setActiveConnections] = useState<DataConnection[]>([]);
  const [showStyles, setShowStyles] = useState(false);
  const [isDrawTool, setIsDrawTool] = useState(false);  

  const excalidrawAPI = useRef<any>(null);
  const peerInstance = useRef<Peer | null>(null);
  const mainStageClient = useRef<any>(null);
  const isRemoteUpdate = useRef(false);
  const lastSentVersionMap = useRef(new Map<string, number>());
  const remotePointers = useRef(new Map<string, any>());
  const realtimeChannel = useRef<RealtimeChannel | null>(null);
  const realtimeReady = useRef(false);
  const activeConnectionsRef = useRef<DataConnection[]>([]);

  // If peer opens before SDK is ready, store the notification here and flush it when SDK is ready
  const pendingNotification = useRef<{
    peerId: string;
    pinValue: string;
    realtimeInvite?: { boardId: string; inviteToken: string };
  } | null>(null);

  // --- 1. Meet SDK Init ---
  useEffect(() => {
    let cancelled = false;
    console.log('[MainStage] Starting Meet SDK init...');

    const initMeet = async () => {
      try {
        console.log('[MainStage] Calling createAddonSession...');
        const session = await meet.addon.createAddonSession({ 
          cloudProjectNumber: "109641982239" 
        });
        if (cancelled) return;
        console.log('[MainStage] Session created, calling createMainStageClient...');
        mainStageClient.current = await session.createMainStageClient();
        console.log('[MainStage] ✓ mainStageClient ready');
        setSdkReady(true);
      } catch (e) {
        console.error('[MainStage] ✗ Meet SDK init failed:', e);
      }
    };
    initMeet();
    return () => { cancelled = true; };
  }, []);

  // --- Notify side panel helper ---
  const notifySidePanel = async (
    peerId: string,
    pinValue: string,
    realtimeInvite?: { boardId: string; inviteToken: string },
  ) => {
    if (!mainStageClient.current) {
      console.warn('[MainStage] notifySidePanel: mainStageClient not ready yet — queuing for when SDK is ready');
      pendingNotification.current = { peerId, pinValue, realtimeInvite };
      return;
    }
    const message = { action: "pin", prefix: PREFIX, value: pinValue, peerId, ...realtimeInvite };
    console.log('[MainStage] Calling notifySidePanel with message:', message);
    try {
      await mainStageClient.current.notifySidePanel(JSON.stringify(message));
      console.log('[MainStage] ✓ notifySidePanel sent successfully');
    } catch (e) {
      console.error('[MainStage] ✗ notifySidePanel threw an error:', e);
    }
  };

  // Flush pending notification once SDK becomes ready
  useEffect(() => {
    if (sdkReady && pendingNotification.current) {
      console.log('[MainStage] SDK now ready — flushing pending notifySidePanel');
      const { peerId, pinValue, realtimeInvite } = pendingNotification.current;
      pendingNotification.current = null;
      notifySidePanel(peerId, pinValue, realtimeInvite);
    }
  }, [sdkReady]);

  // --- 2. Throttled Broadcast ---
  const sendStageMessage = (message: any) => {
    const connections = activeConnectionsRef.current;
    const channel = realtimeChannel.current;
    if (realtimeReady.current && channel) {
      void sendPrivateBoardMessage(channel, message).then((status) => {
        if (status === 'ok') return;
        console.warn('[MainStage] Realtime send failed; switching back to PeerJS:', status);
        realtimeReady.current = false;
        const serialized = JSON.stringify(message);
        connections.forEach((conn) => { if (conn.open) conn.send(serialized); });
      }).catch((error) => {
        console.warn('[MainStage] Realtime send failed; switching back to PeerJS:', error);
        realtimeReady.current = false;
        const serialized = JSON.stringify(message);
        connections.forEach((conn) => { if (conn.open) conn.send(serialized); });
      });
      return;
    }

    const serialized = JSON.stringify(message);
    connections.forEach((conn) => { if (conn.open) conn.send(serialized); });
  };

  const throttledBroadcast = useMemo(() => throttle((elements: readonly ExcalidrawElement[]) => {
    if (isRemoteUpdate.current || (activeConnections.length === 0 && !realtimeReady.current)) return;
    const updates = elements.filter(el => el.version > (lastSentVersionMap.current.get(el.id) || -1));
    if (updates.length === 0) return;
    sendStageMessage({ action: 'scene-update', elements: updates, isDiff: true });
    updates.forEach(el => lastSentVersionMap.current.set(el.id, el.version));
  }, 50), [activeConnections]);

  // --- 3. Connection Logic ---
  const viewMessage = (app: any) => ({
    action: 'stage-view',
    rect: { x: -app.scrollX, y: -app.scrollY, width: app.width / app.zoom.value, height: app.height / app.zoom.value },
  });

  const throttledViewBroadcast = useMemo(() => throttle((app: any) => {
    if (activeConnections.length > 0 || realtimeReady.current) sendStageMessage(viewMessage(app));
  }, 100), [activeConnections]);

  const handleRealtimeMessage = (message: any) => {
    if (message.action === 'laser' && excalidrawAPI.current) {
      if (message.pointer) {
        remotePointers.current.set('mobile-realtime', {
          pointer: message.pointer,
          button: message.button,
          username: null,
          color: { background: '#ff0000', stroke: '#ff0000' },
        });
      } else {
        remotePointers.current.delete('mobile-realtime');
      }
      excalidrawAPI.current.updateScene({ collaborators: new Map(remotePointers.current) });
      return;
    }

    if (message.action === 'show-area' && excalidrawAPI.current) {
      const { x, y, width, height } = message.rect;
      const app = excalidrawAPI.current.getAppState();
      const zoom = Math.min(app.width / width, app.height / height);
      excalidrawAPI.current.updateScene({
        appState: {
          zoom: { value: zoom },
          scrollX: -x + (app.width / zoom - width) / 2,
          scrollY: -y + (app.height / zoom - height) / 2,
        },
      });
      return;
    }

    if (message.action === 'scene-update' && excalidrawAPI.current) {
      const currentElements = excalidrawAPI.current.getSceneElements() as ExcalidrawElement[];
      let nextElements: ExcalidrawElement[];
      if (message.isDiff) {
        const map = new Map<string, ExcalidrawElement>(currentElements.map((element) => [element.id, element]));
        (message.elements as ExcalidrawElement[]).forEach((remoteElement) => {
          const localElement = map.get(remoteElement.id);
          if (!localElement || remoteElement.version > localElement.version) map.set(remoteElement.id, remoteElement);
        });
        nextElements = Array.from(map.values());
      } else {
        nextElements = message.elements;
      }
      isRemoteUpdate.current = true;
      excalidrawAPI.current.updateScene({ elements: nextElements });
      nextElements.forEach((element) => lastSentVersionMap.current.set(element.id, element.version));
      window.setTimeout(() => { isRemoteUpdate.current = false; }, 100);
    }
  };

  const setupConnection = (conn: DataConnection) => {
    console.log('[MainStage] Incoming connection from peer:', conn.peer);
    conn.on('open', () => {
      console.log('[MainStage] ✓ Connection opened with:', conn.peer);
      setActiveConnections((prev) => {
        const next = [...prev, conn];
        activeConnectionsRef.current = next;
        return next;
      });
      if (excalidrawAPI.current && !realtimeReady.current) {
        conn.send(viewMessage(excalidrawAPI.current.getAppState()));
        conn.send(JSON.stringify({ 
          action: 'scene-update', 
          elements: excalidrawAPI.current.getSceneElements(),
          isDiff: false 
        }));
      }
    });

    conn.on('data', (data: any) => {
      try {
        const incomingData = JSON.parse(data);
        if (incomingData.action === 'transport-fallback') {
          realtimeReady.current = false;
          remotePointers.current.delete('mobile-realtime');
          excalidrawAPI.current?.updateScene({ collaborators: new Map(remotePointers.current) });
          return;
        }
        if (incomingData.action === 'laser' && excalidrawAPI.current) {
          if (incomingData.pointer) {
            remotePointers.current.set(conn.peer, {
              pointer: incomingData.pointer,
              button: incomingData.button,
              username: null,
              color: { background: '#ff0000', stroke: '#ff0000' },
            });
          } else {
            remotePointers.current.delete(conn.peer);
          }
          excalidrawAPI.current.updateScene({ collaborators: new Map(remotePointers.current) });
          return;
        }
        if (incomingData.action === 'show-area' && excalidrawAPI.current) {
          const { x, y, width, height } = incomingData.rect;
          const app = excalidrawAPI.current.getAppState();
          const zoom = Math.min(app.width / width, app.height / height);
          excalidrawAPI.current.updateScene({
            appState: {
              zoom: { value: zoom },
              scrollX: -x + (app.width / zoom - width) / 2,
              scrollY: -y + (app.height / zoom - height) / 2,
            },
          });
          return;
        }
        if (incomingData.action === 'scene-update' && excalidrawAPI.current) {
          const currentElements = excalidrawAPI.current.getSceneElements() as ExcalidrawElement[];
          let nextElements: ExcalidrawElement[];
          if (incomingData.isDiff) {
            const map = new Map<string, ExcalidrawElement>(currentElements.map((e) => [e.id, e]));
            (incomingData.elements as ExcalidrawElement[]).forEach((remoteEl) => {
              const localEl = map.get(remoteEl.id);
              if (!localEl || remoteEl.version > localEl.version) map.set(remoteEl.id, remoteEl);
            });
            nextElements = Array.from(map.values());
          } else {
            nextElements = incomingData.elements;
          }
          isRemoteUpdate.current = true;
          excalidrawAPI.current.updateScene({ elements: nextElements });
          nextElements.forEach((el) => lastSentVersionMap.current.set(el.id, el.version));
          activeConnections.forEach(otherConn => {
            if (otherConn.open && otherConn.peer !== conn.peer) otherConn.send(data);
          });
          setTimeout(() => { isRemoteUpdate.current = false; }, 100);
        }
      } catch (e) {
        console.error('[MainStage] Data parse error:', e);
      }
    });

    conn.on('close', () => {
      console.log('[MainStage] Connection closed:', conn.peer);
      setActiveConnections((prev) => {
        const next = prev.filter((connection) => connection.peer !== conn.peer);
        activeConnectionsRef.current = next;
        return next;
      });
      remotePointers.current.delete(conn.peer);
      excalidrawAPI.current?.updateScene({ collaborators: new Map(remotePointers.current) });
    });

    conn.on('error', (err) => {
      console.error('[MainStage] Connection error:', err);
    });
  };

  const handleCreateBoard = async () => {
    if (peerInstance.current) {
      peerInstance.current.destroy();
      peerInstance.current = null;
    }

    setPeerReady(false);
    setIsLobby(false);

    const newPin = Math.floor(1000 + Math.random() * 9000).toString();
    setPin(newPin);

    const peerId = PREFIX + newPin + '-' + Date.now();
    console.log('[MainStage] Creating peer with ID:', peerId);
    console.log('[MainStage] SDK ready at this moment?', !!mainStageClient.current);

    let realtimeInvite: { boardId: string; inviteToken: string } | undefined;
    try {
      await realtimeChannel.current?.unsubscribe();
      realtimeChannel.current = null;
      realtimeReady.current = false;
      const session = await createRealtimeSession();
      realtimeChannel.current = await joinPrivateBoardChannel(session.channelName, (message) => {
        if (message.action === 'realtime-probe') {
          void sendPrivateBoardMessage(realtimeChannel.current!, { action: 'realtime-probe-ack' })
            .then((status) => {
              if (status !== 'ok') {
                console.error('[MainStage] Realtime probe acknowledgment failed:', status);
                return;
              }
              realtimeReady.current = true;
              console.log('[MainStage] Supabase Realtime transport selected');
              if (excalidrawAPI.current) {
                sendStageMessage(viewMessage(excalidrawAPI.current.getAppState()));
                sendStageMessage({
                  action: 'scene-update',
                  elements: excalidrawAPI.current.getSceneElements(),
                  isDiff: false,
                });
              }
            });
        } else {
          handleRealtimeMessage(message);
        }
      });
      realtimeInvite = { boardId: session.boardId, inviteToken: session.participantInviteToken };
      console.log('[MainStage] Private Supabase channel ready');
    } catch (error) {
      console.error('[MainStage] Private Supabase setup failed; PeerJS remains available:', error);
    }

    let iceServers = [];
    try {
      const iceResponse = await fetch('/api/get-ice-servers');
      const iceData = await iceResponse.json();
      console.log('iceData', iceData)
      iceServers = iceData.config?.iceServers || [];
    } catch (e) {
      console.warn('[MainStage] Could not fetch ICE servers, falling back to defaults:', e);
      iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
    }

    console.log('[Main Stage] IceServers', iceServers)

    const peer = new Peer(peerId, {
      config: { iceServers }
    });
    peerInstance.current = peer;

    console.log('[Main Stage] Peer created')

    peer.on('open', async (id) => {
      console.log('[MainStage] ✓ Peer open with ID:', id);
      console.log('[MainStage] mainStageClient available now?', !!mainStageClient.current);
      setPeerReady(true);
      await notifySidePanel(id, newPin, realtimeInvite);
    });

    peer.on('connection', setupConnection);

    peer.on('error', (err) => {
      console.error('[MainStage] ✗ Peer error type:', err.type, err);
      if (err.type === 'unavailable-id') {
        console.warn('[MainStage] Peer ID already taken, retrying with new ID...');
        handleCreateBoard();
      }
    });
  };

  useEffect(() => {
    return () => {
      peerInstance.current?.destroy();
      void realtimeChannel.current?.unsubscribe();
    };
  }, []);

  if (isLobby) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-gray-100 gap-2">
        <button onClick={handleCreateBoard} className="rounded bg-blue-600 px-6 py-2 text-white">
          Create New Board
        </button>
        <p className="text-xs text-gray-400">SDK: {sdkReady ? '✓ ready' : '⏳ initializing...'}</p>
      </div>  
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {!peerReady && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80">
          <p className="text-gray-500 text-sm">Starting board...</p>
        </div>
      )}
      <div className="relative flex-1">
        <div className={`whiteboard h-full ${showStyles ? "" : "hide-style-panel"}`}>
          <Excalidraw 
            excalidrawAPI={(api) => (excalidrawAPI.current = api)}
            onChange={(elements, appState) => {
              setIsDrawTool(appState.activeTool.type === "freedraw");
              throttledBroadcast(elements);
              throttledViewBroadcast(appState);
            }}
            renderTopRightUI={() =>
              isDrawTool ? (
                <button
                  className="ToolIcon_type_button"
                  title="Toggle style panel"
                  onClick={() => setShowStyles(v => !v)}
                >
                  🎨
                </button>
              ) : null
            }
          />
        </div>        
      </div>
    </div>
  );
};

export default MainStage;
