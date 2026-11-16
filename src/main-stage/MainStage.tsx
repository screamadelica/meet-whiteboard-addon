import React, { useEffect, useState, useRef, useMemo } from 'react';
import { meet } from '@googleworkspace/meet-addons';
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";
import Peer, { DataConnection } from 'peerjs';
import type { RealtimeChannel } from '@supabase/supabase-js';
import throttle from 'lodash.throttle';
import { createRealtimeSession, joinPrivateBoardChannel, sendPrivateBoardMessage } from '../realtime/supabase';
import { createBoardMessage, createClientId, MessageDeduplicator, normalizeBoardMessage, type BoardMessage } from '../realtime/protocol';
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
  const [peerReady, setPeerReady] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [activeConnections, setActiveConnections] = useState<DataConnection[]>([]);
  const [showStyles, setShowStyles] = useState(false);
  const [isDrawTool, setIsDrawTool] = useState(false);  
  const [isLaserTool, setIsLaserTool] = useState(false);

  const excalidrawAPI = useRef<any>(null);
  const peerInstance = useRef<Peer | null>(null);
  const mainStageClient = useRef<any>(null);
  const isRemoteUpdate = useRef(false);
  const lastSentVersionMap = useRef(new Map<string, number>());
  const remotePointers = useRef(new Map<string, any>());
  const realtimeChannel = useRef<RealtimeChannel | null>(null);
  const activeConnectionsRef = useRef<DataConnection[]>([]);
  const realtimeClients = useRef(new Set<string>());
  const stageClientId = useRef(createClientId());
  const seenMessages = useRef(new MessageDeduplicator());
  const boardStarted = useRef(false);

  // If peer opens before SDK is ready, store the notification here and flush it when SDK is ready
  const pendingNotification = useRef<{
    peerId: string;
    pinValue: string;
    realtimeInvite?: { boardId: string; tutorInviteToken: string; studentInviteToken: string };
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
    realtimeInvite?: { boardId: string; tutorInviteToken: string; studentInviteToken: string },
  ) => {
    if (!mainStageClient.current) {
      console.warn('[MainStage] notifySidePanel: mainStageClient not ready yet — queuing for when SDK is ready');
      pendingNotification.current = { peerId, pinValue, realtimeInvite };
      return;
    }
    const message = { action: "pin", prefix: PREFIX, value: pinValue, peerId, ...realtimeInvite };
    console.log('[MainStage] Sending board invite details to side panel');
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
  const sendStageMessage = (payload: Record<string, unknown>, targetClientId?: string) => {
    const message = createBoardMessage(stageClientId.current, { ...payload, ...(targetClientId ? { targetClientId } : {}) });
    seenMessages.current.accept(message.messageId);
    const connections = activeConnectionsRef.current;
    const channel = realtimeChannel.current;
    const serialized = JSON.stringify(message);
    connections.forEach((conn) => { if (conn.open) conn.send(serialized); });
    if (channel && realtimeClients.current.size > 0) {
      void sendPrivateBoardMessage(channel, message).then((status) => {
        if (status !== 'ok') console.warn('[MainStage] Realtime fallback broadcast failed:', status);
      }).catch((error) => console.warn('[MainStage] Realtime fallback broadcast failed:', error));
    }
  };

  const throttledBroadcast = useMemo(() => throttle((elements: readonly ExcalidrawElement[]) => {
    if (isRemoteUpdate.current || (activeConnections.length === 0 && realtimeClients.current.size === 0)) return;
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
    if (activeConnections.length > 0 || realtimeClients.current.size > 0) sendStageMessage(viewMessage(app));
  }, 100), [activeConnections]);

  const applyStageMessage = (message: BoardMessage) => {
    if (message.action === 'laser' && excalidrawAPI.current) {
      if (message.pointer) {
        remotePointers.current.set(message.senderId, {
          pointer: message.pointer,
          button: message.button,
          username: null,
          color: { background: '#ff0000', stroke: '#ff0000' },
        });
      } else {
        remotePointers.current.delete(message.senderId);
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

  const handleRealtimeMessage = (rawMessage: Record<string, unknown>) => {
    const payload = normalizeBoardMessage(rawMessage, 'realtime:legacy');
    if (!payload) return;
    if (!seenMessages.current.accept(payload.messageId)) return;
    if (payload.action === 'transport-fallback') {
      realtimeClients.current.add(payload.senderId);
      if (excalidrawAPI.current && realtimeChannel.current) {
        sendStageMessage(viewMessage(excalidrawAPI.current.getAppState()), payload.senderId);
        sendStageMessage({
          action: 'scene-update',
          elements: excalidrawAPI.current.getSceneElements(),
          isDiff: false,
        }, payload.senderId);
      }
      console.log('[MainStage] Mobile using Realtime fallback:', payload.senderId);
      return;
    }

    if (payload.action === 'transport-peerjs') {
      realtimeClients.current.delete(payload.senderId);
      console.log('[MainStage] Mobile using PeerJS:', payload.senderId);
      return;
    }

    applyStageMessage(payload);
    const serialized = JSON.stringify(payload);
    activeConnectionsRef.current.forEach((conn) => { if (conn.open) conn.send(serialized); });
  };

  const handlePeerMessage = (rawMessage: Record<string, unknown>, conn: DataConnection) => {
    const message = normalizeBoardMessage(rawMessage, `peer:${conn.peer}`);
    if (!message || !seenMessages.current.accept(message.messageId)) return;

    if (message.action === 'transport-peerjs') {
      realtimeClients.current.delete(message.senderId);
      if (excalidrawAPI.current) {
        sendStageMessage(viewMessage(excalidrawAPI.current.getAppState()), message.senderId);
        sendStageMessage({
          action: 'scene-update',
          elements: excalidrawAPI.current.getSceneElements(),
          isDiff: false,
        }, message.senderId);
      }
      return;
    }

    if (message.action === 'transport-fallback') {
      realtimeClients.current.add(message.senderId);
      return;
    }

    applyStageMessage(message);
    const serialized = JSON.stringify(message);
    activeConnectionsRef.current.forEach((otherConn) => {
      if (otherConn.open && otherConn !== conn) otherConn.send(serialized);
    });
    if (realtimeChannel.current && realtimeClients.current.size > 0) {
      void sendPrivateBoardMessage(realtimeChannel.current, message).then((status) => {
        if (status !== 'ok') console.warn('[MainStage] Realtime relay failed:', status);
      });
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
    });

    conn.on('data', (data: any) => {
      try {
        handlePeerMessage(JSON.parse(data), conn);
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

    const newPin = Math.floor(1000 + Math.random() * 9000).toString();
    setPin(newPin);

    const peerId = PREFIX + newPin + '-' + Date.now();
    console.log('[MainStage] Creating peer with ID:', peerId);
    console.log('[MainStage] SDK ready at this moment?', !!mainStageClient.current);

    let realtimeInvite: { boardId: string; tutorInviteToken: string; studentInviteToken: string } | undefined;
    try {
      await realtimeChannel.current?.unsubscribe();
      realtimeChannel.current = null;
      realtimeClients.current.clear();
      const session = await createRealtimeSession();
      realtimeChannel.current = await joinPrivateBoardChannel(session.channelName, (message) => {
        if (message.action === 'realtime-probe') {
          void sendPrivateBoardMessage(realtimeChannel.current!, { action: 'realtime-probe-ack' })
            .then((status) => {
              if (status !== 'ok') {
                console.error('[MainStage] Realtime probe acknowledgment failed:', status);
              }
              console.log('[MainStage] Supabase Realtime fallback verified');
            });
        } else {
          handleRealtimeMessage(message);
        }
      });
      realtimeInvite = {
        boardId: session.boardId,
        tutorInviteToken: session.tutorInviteToken,
        studentInviteToken: session.studentInviteToken,
      };
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
      excalidrawAPI.current?.setActiveTool({ type: 'freedraw' });
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
    if (boardStarted.current) return;
    boardStarted.current = true;
    void handleCreateBoard();
  }, []);

  useEffect(() => {
    return () => {
      peerInstance.current?.destroy();
      void realtimeChannel.current?.unsubscribe();
    };
  }, []);

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
            excalidrawAPI={(api) => {
              excalidrawAPI.current = api;
              api.setActiveTool({ type: 'freedraw' });
            }}
            onChange={(elements, appState) => {
              setIsDrawTool(appState.activeTool.type === "freedraw");
              setIsLaserTool(appState.activeTool.type === "laser");
              throttledBroadcast(elements);
              throttledViewBroadcast(appState);
            }}
            renderTopRightUI={() => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isDrawTool && (
                  <button
                    className="ToolIcon_type_button"
                    title="Toggle style panel"
                    aria-label="Toggle style panel"
                    onClick={() => setShowStyles(v => !v)}
                  >
                    🎨
                  </button>
                )}
                <button
                  type="button"
                  className={`ToolIcon ToolIcon_type_button main-stage-laser-button${isLaserTool ? ' ToolIcon--selected' : ''}`}
                  title="Laser pointer"
                  aria-label="Laser pointer"
                  aria-pressed={isLaserTool}
                  onClick={() => excalidrawAPI.current?.setActiveTool({ type: isLaserTool ? 'freedraw' : 'laser' })}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m5 3 14 10-7 1-3 7L5 3Z" />
                    <path d="M14 4V2M19 7l2-1M17 3l1-2" />
                  </svg>
                </button>
              </div>
            )}
          />
        </div>        
      </div>
    </div>
  );
};

export default MainStage;
