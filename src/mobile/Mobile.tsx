import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";
import Peer, { DataConnection } from 'peerjs';
import throttle from 'lodash.throttle';
import "./whiteboard.css";

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;

const MobileController = () => {
  const [status, setStatus] = useState("Connecting...");
  const [isStarted, setIsStarted] = useState(false);
  const excalidrawAPI = useRef<any>(null);
  const isRemoteUpdate = useRef(false);
  const versionMap = useRef(new Map<string, number>());
  const connectionRef = useRef<DataConnection | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const retryCount = useRef(0);
  const peerRef = useRef<Peer | null>(null);

  const urlParams = new URLSearchParams(window.location.search);
  const targetPeerId = urlParams.get('peerId');

  console.log('[Mobile] Page loaded. targetPeerId from URL:', targetPeerId);

  const handleStart = useCallback(() => {
    setIsStarted(true);
    
    // Add a tiny haptic pulse to make the button feel responsive on mobile
    if (window.navigator.vibrate) {
      window.navigator.vibrate(10);
    }

    const el = containerRef.current || document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    } else if ((el as any).webkitRequestFullscreen) {
      (el as any).webkitRequestFullscreen();
    }
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

  const [isLandscape, setIsLandscape] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [fsError, setFsError] = useState('');
  const fsPending = useRef(false);
  const canFullscreen = !!((document.documentElement as any).requestFullscreen || (document.documentElement as any).webkitRequestFullscreen);
  const isStandalone = (navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches;

  const enterFullscreen = useCallback(() => {
    // touchend, pointerup and click fire together; overlapping requests make Chrome reject the real one.
    if (document.fullscreenElement || fsPending.current) return;
    const el: any = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) { setFsError('Browser has no fullscreen API. Use "Add to Home Screen" and open from there.'); return; }
    fsPending.current = true;
    Promise.resolve(req.call(el))
      .then(() => {
        setFsError('');
        (screen.orientation as any)?.lock?.('landscape')?.catch(() => {});
      })
      .catch((e: any) => setFsError(String(e?.message || e)))
      .finally(() => { fsPending.current = false; });
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape)');
    // Chrome refuses fullscreen without a user gesture, so retry on any touch/click while landscape.
    const onGesture = () => { if (mq.matches) enterFullscreen(); };
    const onChange = () => {
      setIsLandscape(mq.matches);
      if (mq.matches) enterFullscreen();
    };
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    setIsLandscape(mq.matches);
    mq.addEventListener('change', onChange);
    document.addEventListener('fullscreenchange', onFsChange);
    const events = ['touchend', 'click', 'pointerup'];
    events.forEach((e) => document.addEventListener(e, onGesture, true));
    return () => {
      mq.removeEventListener('change', onChange);
      document.removeEventListener('fullscreenchange', onFsChange);
      events.forEach((e) => document.removeEventListener(e, onGesture, true));
    };
  }, [enterFullscreen]);

  useEffect(() => {
    // The page must be scrollable for iOS Chrome to collapse its toolbars on swipe.
    document.documentElement.style.overflowY = 'auto';
    document.body.style.minHeight = 'calc(100dvh + 200px)';
    document.body.style.overscrollBehavior = 'none';
    return () => {
      document.body.style.minHeight = '';
    };
  }, []);

  const connectToPeer = useCallback((peer: Peer, peerId: string) => {
    console.log(`[Mobile] Attempting connection to: "${peerId}" (attempt ${retryCount.current + 1}/${MAX_RETRIES})`);
    setStatus(`Connecting... (${retryCount.current + 1}/${MAX_RETRIES})`);

    const conn = peer.connect(peerId, { reliable: true });
    connectionRef.current = conn;

    const timeout = setTimeout(() => {
      if (conn.open) return;
      console.warn(`[Mobile] Connection to "${peerId}" timed out after 5s`);
      conn.close();
      retryCount.current += 1;
      if (retryCount.current < MAX_RETRIES) {
        setStatus(`Timeout — retrying (${retryCount.current}/${MAX_RETRIES})...`);
        setTimeout(() => connectToPeer(peer, peerId), RETRY_DELAY_MS);
      } else {
        console.error('[Mobile] Max retries reached. Could not connect to:', peerId);
        setStatus("❌ Could not connect. Please rescan the QR code.");
      }
    }, 5000);

    conn.on('open', () => {
      clearTimeout(timeout);
      retryCount.current = 0;
      console.log('[Mobile] ✓ Connection opened with:', peerId);
      setStatus("Connected ✓");
    });

    conn.on('data', (data: any) => {
      console.log('[Mobile] Data received, length:', String(data).length);
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
          setTimeout(() => { isRemoteUpdate.current = false; }, 100);
        }
      } catch (e) { console.error('[Mobile] Parse error:', e); }
    });

    conn.on('close', () => {
      console.warn('[Mobile] Connection closed unexpectedly, will retry...');
      setStatus("Disconnected — retrying...");
      setTimeout(() => connectToPeer(peer, peerId), RETRY_DELAY_MS);
    });

    conn.on('error', (err) => {
      clearTimeout(timeout);
      console.error('[Mobile] Connection error:', err);
      retryCount.current += 1;
      if (retryCount.current < MAX_RETRIES) {
        setTimeout(() => connectToPeer(peer, peerId), RETRY_DELAY_MS);
      } else {
        setStatus("❌ Connection failed. Please rescan the QR code.");
      }
    });
  }, []);

  useEffect(() => {
    if (!targetPeerId) {
      console.error('[Mobile] No peerId in URL params. Full URL:', window.location.href);
      setStatus("❌ No peer ID in URL");
      return;
    }

    const initPeer = async () => {
      try {
        console.log('[Mobile] Fetching ICE servers...');
        const iceResponse = await fetch('/api/get-ice-servers').catch(() => null);
        
        if (!iceResponse || !iceResponse.ok) {
          throw new Error("Failed to fetch ICE config");
        }

        const iceData = await iceResponse.json();
        const iceServers = iceData.config?.iceServers || [];

        console.log('[Mobile] Initialising PeerJS with config...');
        const peer = new Peer({ config: { iceServers } });
        peerRef.current = peer;

        peer.on('open', (myId) => {
          console.log('[Mobile] ✓ My peer ID assigned:', myId);
          console.log('[Mobile] Now connecting to MainStage peer:', targetPeerId);
          connectToPeer(peer, targetPeerId);
        });

        peer.on('error', (err) => {
          console.error('[Mobile] Peer-level error:', err.type, err);
          setStatus(`❌ Peer error: ${err.type}`);
        });

        peer.on('disconnected', () => {
          console.warn('[Mobile] Peer disconnected from broker, attempting reconnect...');
          peer.reconnect();
        });
      } catch (e) {
        console.error('[Mobile] Initialization failed:', e);
        setStatus("❌ Initialization failed");
      }
    };

    initPeer();

    return () => {
      console.log('[Mobile] Cleaning up peer');
      peerRef.current?.destroy();
    };
  }, [targetPeerId, connectToPeer]);

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
      style={{ position: 'fixed', inset: 0, width: '100vw', height: '100dvh', overflow: 'hidden', background: 'white', pointerEvents: 'none' }}
    >
      {!isStarted && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'auto',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(17, 24, 39, 0.92)', backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)', touchAction: 'manipulation',
        }}>
          <button
            onPointerUp={handleStart}
            style={{
              background: '#2563eb', color: 'white', border: 'none', borderRadius: '16px',
              padding: '20px 40px', fontSize: '20px', fontWeight: 700,
              boxShadow: '0 8px 32px rgba(37,99,235,0.4)', cursor: 'pointer',
              touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent', userSelect: 'none',
            }}
          >
            Start Drawing
          </button>
          <p style={{ marginTop: 16, fontSize: 13, color: 'rgba(255,255,255,0.6)', textAlign: 'center', padding: '0 24px' }}>
            Tap to enable full screen mode
          </p>
          {/* Show peerId in UI for debugging */}
          <p style={{ marginTop: 8, fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', padding: '0 24px', textAlign: 'center', wordBreak: 'break-all' }}>
            Target: {targetPeerId ?? 'none'}
          </p>
        </div>
      )}

      <div style={{
        display: isLandscape ? 'none' : 'block',
        position: 'absolute', top: 8, left: 8, zIndex: 50,
        background: status.includes('✓') ? 'rgba(22,101,52,0.8)' : status.includes('❌') ? 'rgba(153,27,27,0.8)' : 'rgba(0,0,0,0.5)',
        color: 'white', borderRadius: 4, padding: '2px 8px', fontSize: 10,
        backdropFilter: 'blur(4px)', pointerEvents: 'none', transition: 'background 0.3s',
      }}>
        {status}
      </div>

      {isStarted && isLandscape && !isFullscreen && !isStandalone && (
        <button
          onClick={canFullscreen ? enterFullscreen : undefined}
          style={{
            position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 60,
            background: '#2563eb', color: 'white', border: 'none', borderRadius: 999,
            padding: '8px 18px', fontSize: 14, fontWeight: 600, opacity: 0.9,
            pointerEvents: canFullscreen ? 'auto' : 'none',
          }}
        >
          {!canFullscreen
            ? 'For full screen: Share > Add to Home Screen'
            : fsError ? `Full screen failed: ${fsError}` : 'Tap for full screen'}
        </button>
      )}

      <div style={{
        position: 'absolute', top: 0, bottom: 0, right: 0, width: 36, background: '#e5e7eb',
        display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
      }}>
        <div style={{ width: 4, height: 48, borderRadius: 2, background: '#9ca3af' }} />
      </div>

      <div className="whiteboard" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 36, width: 'auto', height: 'auto', pointerEvents: 'auto' }}>
        <Excalidraw
          excalidrawAPI={(api) => { excalidrawAPI.current = api; }}
          onChange={onBoardChange}
          UIOptions={{
            welcomeScreen: false,
            canvasActions: { toggleTheme: false, export: false, loadScene: false, changeViewBackgroundColor: false }
          }}
        />
      </div>
    </div>
  );
};

export default MobileController;
