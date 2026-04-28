import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";
import Peer, { DataConnection } from 'peerjs';
import throttle from 'lodash.throttle';
import "./whiteboard.css";

const MobileController = () => {
  const [status, setStatus] = useState("Connecting...");
  const containerRef = useRef<HTMLDivElement>(null);
  const excalidrawAPI = useRef<any>(null);
  const isRemoteUpdate = useRef(false);
  const versionMap = useRef(new Map<string, number>());
  const connectionRef = useRef<DataConnection | null>(null);

  const urlParams = new URLSearchParams(window.location.search);
  const targetPeerId = urlParams.get('peerId');

  // Unified Fullscreen Handler
  const enableFullscreen = async () => {
    if (!containerRef.current) return;

    const el = containerRef.current as any;
    const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
    setStatus("Requesting Fullscreen...");
    try {
      await el.requestFullscreen().catch(() => {});
      setStatus("Fullscreen Standard API");
    } catch (err: any) {
      setStatus(`Error: ${err.message || "Standard API blocked by browser"}`);
    }

    try {
      await el.webkitRequestFullscreen();
      setStatus("Fullscreen: Webkit API");
    } catch (err: any) {
      setStatus(`Error: ${err.message || "Webkit API blocked by browser"}`);
    }
/*
    // 1. Chrome / Standard API
    try {
      if (isChrome) {
        await el.requestFullscreen().catch(() => {});
        setStatus("Fullscreen Standard API");
      } else if (el.webkitRequestFullscreen) {
        // Chrome Mobile / Older Safari
        await el.webkitRequestFullscreen();
        setStatus("Fullscreen: Webkit API");
      // 2. iOS Safari (Minimal UI Trick)
      } else {
        document.documentElement.style.height = '110vh';
        document.body.style.height = '110vh';
        window.scrollTo(0, 1);
        setTimeout(() => {
          document.documentElement.style.height = '100dvh';
          document.body.style.height = '100dvh';
        }, 300);
        setStatus("Fullscreen Success (Safari API)");
      }
    } catch (err: any) {
      setStatus(`Error: ${err.message || "Blocked by browser"}`);
    }
*/      
  };

/*  
  useEffect(() => {
    const handleOrientationAndScroll = () => {
      const isLandscape = window.innerWidth > window.innerHeight;

      if (isLandscape) {
        document.documentElement.style.height = '110vh';
        document.body.style.height = '110vh';

        // 2. Small delay to let Safari stabilize, then nudge scroll
        setTimeout(() => {
          window.scrollTo(0, 1);
          // 3. Reset height to fill the new "larger" viewport
          document.documentElement.style.height = '100dvh';
          document.body.style.height = '100dvh';
        }, 300);
      } else {
        // Reset for portrait
        document.documentElement.style.height = '100dvh';
        document.body.style.height = '100dvh';
        window.scrollTo(0, 0);
      }
    };

    window.addEventListener('orientationchange', handleOrientationAndScroll);
    window.addEventListener('resize', handleOrientationAndScroll);
    
    return () => {
      window.removeEventListener('orientationchange', handleOrientationAndScroll);
      window.removeEventListener('resize', handleOrientationAndScroll);
    };
  }, []);
*/

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
          }
          setTimeout(() => { isRemoteUpdate.current = false; }, 100);
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
      // We trigger fullscreen on the first touch/click inside the app
      onPointerDown={enableFullscreen} 
      className="fixed inset-0 h-[100dvh] w-screen bg-white overflow-hidden touch-none flex flex-col"
    >
    
      {/* Status Badge */}
      <div className="absolute left-2 top-2 z-50 rounded bg-black/50 px-2 py-1 text-[10px] text-white backdrop-blur-md pointer-events-none">
        {status}
      </div>      
      
      {/* Excalidraw Container */}
      <div className="whiteboard h-full w-full overflow-hidden">
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
  );
};

export default MobileController;