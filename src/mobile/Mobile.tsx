import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";
import Peer, { DataConnection } from 'peerjs';
import throttle from 'lodash.throttle';
import "./whiteboard.css";

const MobileController = () => {
  const [status, setStatus] = useState("Connecting...");
  const excalidrawAPI = useRef<any>(null);
  const isRemoteUpdate = useRef(false);
  const versionMap = useRef(new Map<string, number>());
  const connectionRef = useRef<DataConnection | null>(null);

  const urlParams = new URLSearchParams(window.location.search);
  const targetPeerId = urlParams.get('peerId');

  // Helper to trigger fullscreen with cross-browser support
  const toggleFullscreen = async (enter: boolean) => {
    const docElm = document.documentElement as any;
    try {
      if (enter) {
        if (docElm.requestFullscreen) {
          await docElm.requestFullscreen();
        } else if (docElm.webkitRequestFullscreen) {
          await docElm.webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        }
      }
    } catch (err) {
      console.warn("Fullscreen toggle blocked or failed:", err);
    }
  };

  useEffect(() => {
    const handleOrientation = () => {
      const isLandscape = window.innerWidth > window.innerHeight;
      // We attempt to toggle, but this may fail without a prior user gesture
      toggleFullscreen(isLandscape);
    };

    window.addEventListener("resize", handleOrientation);
    window.addEventListener("orientationchange", handleOrientation);

    return () => {
      window.removeEventListener("resize", handleOrientation);
      window.removeEventListener("orientationchange", handleOrientation);
    };
  }, []);

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
                if (!localEl || remoteEl.version > localEl.version) {
                  map.set(remoteEl.id, remoteEl);
                }
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
        } catch (e) {
          console.error("Mobile parse error", e);
        }
      });
    });
    return () => { peer.destroy(); };
  }, [targetPeerId]);

  const onBoardChange = useMemo(() => throttle((elements: readonly ExcalidrawElement[]) => {
    // TRIGGER FULLSCREEN ON FIRST INTERACTION
    // This bypasses the gesture requirement. If user is drawing in landscape, make it fullscreen.
    if (window.innerWidth > window.innerHeight && !document.fullscreenElement && !(document as any).webkitFullscreenElement) {
      toggleFullscreen(true);
    }

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
    <div className="fixed inset-0 h-dvh w-screen bg-gray-100 overflow-hidden">
      <div className="absolute left-3 top-3 z-50 rounded bg-white/80 px-2 py-1 text-xs font-bold shadow">
        {status}
      </div>      
      <div className="whiteboard h-full">
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