import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";
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
  const containerRef = useRef<HTMLDivElement>(null);

  const urlParams = new URLSearchParams(window.location.search);
  const targetPeerId = urlParams.get('peerId');

  const handleStart = useCallback(() => {
    setIsStarted(true);

    // Try native Fullscreen API (works on Android Chrome)
    const el = containerRef.current || document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    } else if ((el as any).webkitRequestFullscreen) {
      (el as any).webkitRequestFullscreen();
    }

    // iOS Safari fallback — minimal-ui trick
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
      document.documentElement.style.height = '110vh';
      document.body.style.height = '110vh';
      window.scrollTo(0, 1);
      setTimeout(() => {
        document.documentElement.style.height = '100dvh';
        document.body.style.height = '100dvh';
      }, 300);
    }
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
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
        overflow: 'hidden',
        background: 'white',
      }}
    >
      {/* Start overlay — pointer-events only when visible */}
      {!isStarted && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(17, 24, 39, 0.92)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            touchAction: 'manipulation',
          }}
        >
          <button
            onPointerUp={handleStart}  // onPointerUp is more reliable than onClick on mobile
            style={{
              background: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '16px',
              padding: '20px 40px',
              fontSize: '20px',
              fontWeight: 700,
              boxShadow: '0 8px 32px rgba(37,99,235,0.4)',
              cursor: 'pointer',
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent',
              userSelect: 'none',
            }}
          >
            Start Drawing 2
          </button>
          <p style={{ marginTop: 16, fontSize: 13, color: 'rgba(255,255,255,0.6)', textAlign: 'center', padding: '0 24px' }}>
            Tap to enable full screen mode
          </p>
        </div>
      )}

      {/* Status badge */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: 50,
          background: 'rgba(0,0,0,0.5)',
          color: 'white',
          borderRadius: 4,
          padding: '2px 8px',
          fontSize: 10,
          backdropFilter: 'blur(4px)',
          pointerEvents: 'none',
        }}
      >
        {status}
      </div>

      {/* Excalidraw canvas */}
      <div style={{ width: '100%', height: '100%' }}>
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
