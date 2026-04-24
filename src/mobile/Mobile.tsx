import React, { useEffect, useState, useRef } from 'react';
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";
import Peer, { DataConnection } from 'peerjs';
import throttle from 'lodash.throttle'; // npm install lodash.throttle

const MobileController = () => {
  const [status, setStatus] = useState("Connecting to Meet...");
  const [statusColor, setStatusColor] = useState("#fbbc04");
  
  const excalidrawAPI = useRef<any>(null);
  const isRemoteUpdate = useRef(false);
  const versionMap = useRef(new Map<string, number>());
  const connectionRef = useRef<DataConnection | null>(null);

  // Get the peerId from the URL just like your original script
  const urlParams = new URLSearchParams(window.location.search);
  const targetPeerId = urlParams.get('peerId');

  useEffect(() => {
    if (!targetPeerId) {
      setStatus("Error: No Peer ID found.");
      return;
    }

    const initPeer = async () => {
      let config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
      try {
        const res = await fetch('/api/get-ice-servers');
        if (res.ok) {
          const data = await res.json();
          config = data.config;
        }
      } catch (e) {
        console.error("Failed to fetch ICE servers, using default.");
      }

      const peer = new Peer({ config });
      
      peer.on('open', () => {
        setStatus("Linking...");
        const conn = peer.connect(targetPeerId);
        connectionRef.current = conn;

        conn.on('open', () => {
          setStatus("Connected!");
          setStatusColor("#34a853");
        });

        conn.on('data', (data: any) => {
          const msg = JSON.parse(data);
          if (msg.action === 'scene-update' && excalidrawAPI.current) {
            const currentElements = excalidrawAPI.current.getSceneElements();
            let nextElements;

            if (msg.isDiff) {
              const map = new Map<string, ExcalidrawElement>(currentElements.map((e: ExcalidrawElement) => [e.id, e]));
              msg.elements.forEach((remoteEl: ExcalidrawElement) => {
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
            excalidrawAPI.current.updateScene({ elements: nextElements });
            nextElements.forEach((el: ExcalidrawElement) => versionMap.current.set(el.id, el.version));
            setTimeout(() => { isRemoteUpdate.current = false; }, 50);
          }
        });
      });
    };

    initPeer();
  }, [targetPeerId]);

  const onBoardChange = throttle((elements: readonly ExcalidrawElement[]) => {
    if (isRemoteUpdate.current || !connectionRef.current?.open) return;

    const updates = elements.filter((el) => el.version > (versionMap.current.get(el.id) || -1));
    if (updates.length === 0) return;

    updates.forEach((el) => versionMap.current.set(el.id, el.version));
    connectionRef.current.send(JSON.stringify({ 
      action: 'scene-update', 
      elements: updates, 
      isDiff: true 
    }));
  }, 50);

  return (
    <div className="fixed inset-0 h-screen w-screen overflow-hidden bg-gray-100">
      {/* Status Indicator */}
      <div 
        className="absolute left-3 top-3 z-50 rounded-md bg-white/80 px-3 py-1 text-sm font-bold shadow-sm backdrop-blur-sm pointer-events-none"
        style={{ color: statusColor }} // Keep dynamic color here
      >
        {status}
      </div>

      {/* Excalidraw Wrapper */}
      <div className="h-full w-full">
        <Excalidraw 
          excalidrawAPI={(api) => { excalidrawAPI.current = api; }}
          onChange={onBoardChange}
          theme="light"
          UIOptions={{
            canvasActions: {
              toggleTheme: false,
              export: false,
              loadScene: false,
              saveToActiveFile: false,
              changeViewBackgroundColor: false
            },
            welcomeScreen: false
          }}
        />
      </div>
    </div>
  );
};

export default MobileController;