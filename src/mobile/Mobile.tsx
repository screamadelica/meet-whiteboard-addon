import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";
import Peer, { DataConnection } from 'peerjs';
import throttle from 'lodash.throttle';

const MobileController = () => {
  const [status, setStatus] = useState("Connecting...");
  const excalidrawAPI = useRef<any>(null);
  const isRemoteUpdate = useRef(false);
  const versionMap = useRef(new Map<string, number>());
  const connectionRef = useRef<DataConnection | null>(null);

  const urlParams = new URLSearchParams(window.location.search);
  const targetPeerId = urlParams.get('peerId');

  useEffect(() => {
    if (!targetPeerId) return;

    const peer = new Peer();
    peer.on('open', () => {
      const conn = peer.connect(targetPeerId);
      connectionRef.current = conn;

      conn.on('open', () => setStatus("Connected"));
      conn.on('data', (data: any) => {
        const msg = JSON.parse(data);
        if (msg.action === 'scene-update' && excalidrawAPI.current) {
          // Optimization: Don't interrupt user if they are drawing
          const appState = excalidrawAPI.current.getAppState();
          if (appState.draggingElement || appState.resizingElement || appState.editingElement) return;

          const currentElements = excalidrawAPI.current.getSceneElements();
          let nextElements;

          if (msg.isDiff) {
            const map = new Map(currentElements.map((e: any) => [e.id, e]));
            msg.elements.forEach((remoteEl: any) => {
              const localEl = map.get(remoteEl.id);
              if (!localEl || remoteEl.version > localEl.version) {
                map.set(remoteEl.id, remoteEl);
              }
            });
            nextElements = Array.from(map.values());
          } else {
            nextElements = msg.elements;
          }

          isRemoteUpdate.current = true;
          excalidrawAPI.current.updateScene({ 
            elements: nextElements,
            commitToHistory: false 
          });
          
          nextElements.forEach((el: any) => versionMap.current.set(el.id, el.version));
          setTimeout(() => { isRemoteUpdate.current = false; }, 100);
        }
      });
    });

    return () => { peer.destroy(); };
  }, [targetPeerId]);

  const onBoardChange = useMemo(() => throttle((elements: readonly ExcalidrawElement[]) => {
    if (isRemoteUpdate.current || !connectionRef.current?.open) return;

    const updates = elements.filter((el) => {
      const lastVersion = versionMap.current.get(el.id) || -1;
      return el.version > lastVersion;
    });
    
    if (updates.length > 0) {
      updates.forEach((el) => versionMap.current.set(el.id, el.version));
      connectionRef.current.send(JSON.stringify({ 
        action: 'scene-update', 
        elements: updates, 
        isDiff: true 
      }));
    }
  }, 50), []);

  return (
    <div className="fixed inset-0 h-screen w-screen bg-gray-100">
      <div className="absolute left-3 top-3 z-50 rounded bg-white/80 px-2 py-1 text-xs font-bold shadow">
        {status}
      </div>
      <Excalidraw 
        excalidrawAPI={(api) => { excalidrawAPI.current = api; }}
        onChange={onBoardChange}
        UIOptions={{ welcomeScreen: false }}
      />
    </div>
  );
};

export default MobileController;