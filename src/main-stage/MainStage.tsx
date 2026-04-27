import React, { useEffect, useState, useRef, useMemo } from 'react';
import { meet } from '@googleworkspace/meet-addons';
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";
import Peer, { DataConnection } from 'peerjs';
import throttle from 'lodash.throttle';
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
  const [activeConnections, setActiveConnections] = useState<DataConnection[]>([]);
  const [showStyles, setShowStyles] = useState(false);
  const [isDrawTool, setIsDrawTool] = useState(false);  

  const excalidrawAPI = useRef<any>(null);
  const peerInstance = useRef<Peer | null>(null);
  const mainStageClient = useRef<any>(null);
  const isRemoteUpdate = useRef(false);
  const lastSentVersionMap = useRef(new Map<string, number>());

  // --- 1. Meet SDK Init ---
  useEffect(() => {
    const initMeet = async () => {
      try {
        const session = await meet.addon.createAddonSession({ cloudProjectNumber: "547958960288" });
        mainStageClient.current = await session.createMainStageClient();
      } catch (e) {
        console.error("Meet SDK Handshake Failed:", e);
      }
    };
    initMeet();
  }, []);

  // --- 2. Throttled Broadcast ---
  // useMemo ensures we don't recreate the throttle on every render, 
  // but we pass activeConnections as a dependency or use a ref.
  const throttledBroadcast = useMemo(() => throttle((elements: readonly ExcalidrawElement[]) => {
    if (isRemoteUpdate.current || activeConnections.length === 0) return;
    
    // Only send what changed
    const updates = elements.filter(el => el.version > (lastSentVersionMap.current.get(el.id) || -1));
    if (updates.length === 0) return;

    const message = JSON.stringify({ action: 'scene-update', elements: updates, isDiff: true });
    
    activeConnections.forEach(conn => {
      if (conn.open) {
        conn.send(message);
      }
    });

    updates.forEach(el => lastSentVersionMap.current.set(el.id, el.version));
  }, 50), [activeConnections]);

  // --- 3. Connection Logic ---
  const setupConnection = (conn: DataConnection) => {
    conn.on('open', () => {
      setActiveConnections(prev => [...prev, conn]);
      
      // Send full snapshot to new peer
      if (excalidrawAPI.current) {
        conn.send(JSON.stringify({ 
          action: 'scene-update', 
          elements: excalidrawAPI.current.getSceneElements(),
          isDiff: false 
        }));
      }
    });

    conn.on('data', (data: any) => {
      try {
        // 1. Parse the incoming string
        const incomingData = JSON.parse(data);

        if (incomingData.action === 'scene-update' && excalidrawAPI.current) {
          const currentElements = excalidrawAPI.current.getSceneElements() as ExcalidrawElement[];
          let nextElements: ExcalidrawElement[];

          if (incomingData.isDiff) {
            // MERGE LOGIC: Use the Map with explicit types
            const map = new Map<string, ExcalidrawElement>(
              currentElements.map((e) => [e.id, e])
            );

            // Cast incoming elements to ExcalidrawElement[] to access .version
            (incomingData.elements as ExcalidrawElement[]).forEach((remoteEl) => {
              const localEl = map.get(remoteEl.id);
              if (!localEl || remoteEl.version > localEl.version) {
                map.set(remoteEl.id, remoteEl);
              }
            });
            nextElements = Array.from(map.values());
          } else {
            nextElements = incomingData.elements;
          }

          // 2. Update the scene
          isRemoteUpdate.current = true;
          excalidrawAPI.current.updateScene({ elements: nextElements });
          
          // Update our local version tracker so we don't bounce this back
          nextElements.forEach((el) => lastSentVersionMap.current.set(el.id, el.version));

          // 3. Relay to other connected mobile devices (Bridge mode)
          activeConnections.forEach(otherConn => {
            if (otherConn.open && otherConn.peer !== conn.peer) {
              otherConn.send(data);
            }
          });

          setTimeout(() => { isRemoteUpdate.current = false; }, 100);
        }
      } catch (e) {
        console.error("Data parse error", e);
      }
    });

    conn.on('close', () => {
      setActiveConnections(prev => prev.filter(c => c.peer !== conn.peer));
    });
  };

  const handleCreateBoard = async () => {
    const newPin = Math.floor(1000 + Math.random() * 9000).toString();
    setPin(newPin);
    let message = {
      action: "pin",
      prefix: PREFIX,
      value: newPin,
    };
    if (mainStageClient.current) {
      await mainStageClient.current.notifySidePanel(JSON.stringify(message))
    }
    const peer = new Peer(PREFIX + newPin);
    peerInstance.current = peer;
    peer.on('open', () => setIsLobby(false));
    peer.on('connection', setupConnection);
  };

  if (isLobby) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-gray-100">
        <button onClick={handleCreateBoard} className="rounded bg-blue-600 px-6 py-2 text-white">
          Create New Board
        </button>
      </div>  
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="relative flex-1" >
        <div className={`whiteboard h-full ${showStyles ? "" : "hide-style-panel"}`}>
          <Excalidraw 
            excalidrawAPI={(api) => (excalidrawAPI.current = api)}
            onChange={(elements, appState) => {
              setIsDrawTool(appState.activeTool.type === "freedraw");
              throttledBroadcast;
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