import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";
import Peer, { DataConnection } from 'peerjs';
import throttle from 'lodash.throttle';
import "./whiteboard.css";

const MobileController = () => {
  const [status, setStatus] = useState("Connecting...");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const excalidrawAPI = useRef<any>(null);
  const isRemoteUpdate = useRef(false);
  const versionMap = useRef(new Map<string, number>());
  const connectionRef = useRef<DataConnection | null>(null);

  const urlParams = new URLSearchParams(window.location.search);
  const targetPeerId = urlParams.get('peerId');

  // Listen for browser-level fullscreen changes (e.g., user pressing ESC or swiping away)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement || !!(document as any).webkitFullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      // ENTER "FULLSCREEN"
      document.documentElement.style.height = '110vh';
      document.body.style.height = '110vh';
      
      // Nudge scroll to hide bars
      window.scrollTo(0, 1);
      
      setTimeout(() => {
        setIsFullscreen(true);
      }, 300);
    } else {
      // EXIT "FULLSCREEN"
      // 1. Reset the styles completely
      document.documentElement.style.removeProperty('height');
      document.body.style.removeProperty('height');
      
      // 2. Scroll back to the absolute top
      window.scrollTo(0, 0);
      
      // 3. Update state
      setIsFullscreen(false);
      
      // 4. Optional: Force a layout recount
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 100);
    }
  };

/*  
  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    try {
      const el = containerRef.current as any;
      
      if (!isFullscreen) {
        // ENTER Fullscreen
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        } else if (el.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen();
        }
        window.scrollTo(0, 1);
      } else {
        // EXIT Fullscreen
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        }
      }
    } catch (err) {
      console.error("Fullscreen toggle failed", err);
    }
  };
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
      className={`w-screen bg-white flex flex-col transition-all duration-300 ${
        isFullscreen 
          ? "h-[100dvh] fixed top-0 left-0 z-[9999]" 
          : "h-[100dvh] relative"
      }`}
    >
    
      {/* Status Badge */}
      <div className="absolute left-2 top-2 z-50 rounded bg-black/50 px-2 py-1 text-[10px] text-white backdrop-blur-md pointer-events-none">
        {status}
      </div>      

      {/* NEW: Toggle Fullscreen Button */}
      <button 
        onClick={toggleFullscreen}
        className="absolute right-4 bottom-24 z-50 p-3 rounded-full bg-blue-600 text-white shadow-lg active:scale-90 transition-transform flex items-center justify-center"
        aria-label="Toggle Fullscreen"
      >
        {isFullscreen ? (
          <span className="text-xs font-bold px-1">EXIT</span>
        ) : (
          <span className="text-xs font-bold px-1">FULLSCREEN</span>
        )}
      </button>
      
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