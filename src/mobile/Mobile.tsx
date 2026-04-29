import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";
import { FullScreen, useFullScreenHandle } from "react-full-screen";
import Peer, { DataConnection } from 'peerjs';
import throttle from 'lodash.throttle';
import "./whiteboard.css";

const MobileController = () => {
  const [status, setStatus] = useState("Connecting...");
  const [isStarted, setIsStarted] = useState(false);
  const excalidrawAPI = useRef<any>(null);
  const isRemoteUpdate = useRef(false);
  const versionMap = useRef(new Map<string, number>());
  const connectionRef = useRef<DataConnection | null>(null);

  const handle = useFullScreenHandle();

  const urlParams = new URLSearchParams(window.location.search);
  const targetPeerId = urlParams.get('peerId');

  const handleStart = useCallback(() => {
    // ✅ FIX 1: Set isStarted immediately — don't wait for async fullscreen
    setIsStarted(true);

    // ✅ FIX 2: Fullscreen in its own isolated try/catch
    handle.enter().catch((err) => {
      console.warn("Fullscreen API failed", err);
    });

    // iOS Safari Minimal-UI nudge fallback
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
      document.documentElement.style.height = '110vh';
      document.body.style.height = '110vh';
      window.scrollTo(0, 1);
      setTimeout(() => {
        document.documentElement.style.height = '100dvh';
        document.body.style.height = '100dvh';
      }, 300);
    }
  }, [handle]);

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
              const map = new Map(currentElements.map((e) => [e.id, e]));
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
    <>
      {/* ✅ FIX 3: Overlay lives OUTSIDE FullScreen — can't be remounted by the library */}
      {!isStarted && (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-gray-900/90 text-white backdrop-blur-sm">
          <button
            onClick={handleStart}
            className="bg-blue-600 px-10 py-5 rounded-2xl font-bold text-xl shadow-2xl active:scale-95 transition-transform"
          >
            Start Drawing
          </button>
          <p className="mt-4 text-sm opacity-70 text-center px-6">
            Tap to enable full screen mode
          </p>
        </div>
      )}

      <FullScreen handle={handle}>
        <div className="relative h-[100dvh] w-screen bg-white overflow-hidden touch-none flex flex-col">
          <div className="absolute left-2 top-2 z-50 rounded bg-black/50 px-2 py-1 text-[10px] text-white backdrop-blur-md pointer-events-none">
            {status}
          </div>
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
      </FullScreen>
    </>
  );
};

export default MobileController;
