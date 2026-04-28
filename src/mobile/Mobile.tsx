import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";
import Peer, { DataConnection } from 'peerjs';
import throttle from 'lodash.throttle';
import "./whiteboard.css";

const MobileController = () => {
  const [status, setStatus] = useState("Connecting...");
  const [isStarted, setIsStarted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const excalidrawAPI = useRef<any>(null);
  const isRemoteUpdate = useRef(false);
  const versionMap = useRef(new Map<string, number>());
  const connectionRef = useRef<DataConnection | null>(null);

  const urlParams = new URLSearchParams(window.location.search);
  const targetPeerId = urlParams.get('peerId');

  const enterFullscreen = async () => {
    if (!containerRef.current) return;

    try {
      const el = containerRef.current as any;
      
      // Standard Fullscreen API
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        // Essential for iOS Safari
        await el.webkitRequestFullscreen();
      }

      // Nudge the browser to hide the URL bar
      window.scrollTo(0, 1);
    } catch (err) {
      console.error("Fullscreen failed", err);
    } finally {
      setIsStarted(true);
    }
  };

  // Auto-trigger fullscreen on rotation if already "started"
  useEffect(() => {
    const handleResize = () => {
      if (isStarted && window.innerWidth > window.innerHeight) {
        enterFullscreen();
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isStarted]);

  useEffect(() => {
    if (!targetPeerId) return;
    const peer = new Peer();
    peer.on('open', () => {
      const conn = peer.connect(targetPeerId);
      connectionRef.current = conn;
      conn.on('open', () => setStatus("Connected"));
      conn.on('data', (data: any) => {
        try {
          const incomingData = JSON.parse(data);
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
            nextElements.forEach((el) => versionMap.current.set(el.id, el.version));
            setTimeout(() => { isRemoteUpdate.current = false; }, 100);
          }
        } catch (e) { console.error("Mobile parse error", e); }
      });
    });
    return () => peer.destroy();
  }, [targetPeerId]);

  const onBoardChange = useMemo(() => throttle((elements: readonly ExcalidrawElement[]) => {
    if (isRemoteUpdate.current || !connectionRef.current?.open) return;
    const updates = elements.filter((el) => (versionMap.current.get(el.id) || -1) < el.version);
    if (updates.length > 0) {
      updates.forEach((el) => versionMap.current.set(el.id, el.version));
      connectionRef.current.send(JSON.stringify({ action: 'scene-update', elements: updates, isDiff: true }));
    }
  }, 50), []);

  return (
    <div 
      ref={containerRef} 
      className="fixed inset-0 h-screen w-screen bg-white overflow-hidden touch-none"
    >
      {!isStarted && (
        <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-gray-900 text-white">
          <button 
            onClick={enterFullscreen}
            className="bg-blue-600 px-8 py-4 rounded-xl font-bold text-lg shadow-2xl"
          >
            Go Fullscreen
          </button>
          <p className="mt-4 text-sm opacity-70 text-center px-6">
            Tap to hide browser bars and start drawing
          </p>
        </div>
      )}

      
      <div className="h-[100dvh] w-screen overflow-hidden flex flex-col">
        <div className="absolute left-2 top-2 z-50 rounded bg-black/50 px-2 py-1 text-[10px] text-white backdrop-blur-md">
          {status}
        </div>      
      
        <div className="flex-grow w-full">
          <Excalidraw 
            excalidrawAPI={(api) => { excalidrawAPI.current = api; }}
            onChange={onBoardChange}
            UIOptions={{ 
              welcomeScreen: false,
              canvasActions: {
                toggleTheme: false,
                export: false,
                loadScene: false,
                changeViewBackgroundColor: false,
              }
            }}
          />
        </div>
      </div>  
    </div>
  );
};

export default MobileController;