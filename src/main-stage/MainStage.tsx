import React, { useEffect, useState, useRef } from 'react';
import { meet } from '@googleworkspace/meet-addons';
import { Excalidraw } from "@excalidraw/excalidraw";
import Peer, { DataConnection } from 'peerjs';
import throttle from 'lodash.throttle'; // Run: npm install lodash.throttle

const PREFIX = "meetboard-xyz-";

const MainStage = () => {
  // --- State ---
  const [pin, setPin] = useState<string>('');
  const [isLobby, setIsLobby] = useState(true);
  const [status, setStatus] = useState('Waiting for peers...');
  const [activeConnections, setActiveConnections] = useState<DataConnection[]>([]);
  
  // --- Refs for non-reactive logic ---
  const excalidrawAPI = useRef<any>(null);
  const peerInstance = useRef<Peer | null>(null);
  const isRemoteUpdate = useRef(false);
  const lastSentVersionMap = useRef(new Map());

  const mobileUrl = `${window.location.origin}/mobile.html?peerId=${PREFIX + pin}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(mobileUrl)}`;
  
  // --- 1. Init Meet SDK ---
  useEffect(() => {
    const initMeet = async () => {
      try {
        const session = await meet.addon.createAddonSession({
          cloudProjectNumber: "547958960288"
        });
        await session.createMainStageClient();

        console.log("Main Stage Handshake Complete");
      } catch (e) {
        console.error("Meet SDK Handshake Failed:", e);
      }
    };
    initMeet();
  }, []);

  // --- 2. PeerJS Logic ---
  const setupConnection = (conn: DataConnection) => {
    conn.on('open', () => {
      setActiveConnections(prev => [...prev, conn]);
      setStatus(`Connected to peers!`);
      
      // Sync initial state
      if (excalidrawAPI.current) {
        conn.send(JSON.stringify({ 
          action: 'scene-update', 
          elements: excalidrawAPI.current.getSceneElements() 
        }));
      }
    });

    conn.on('data', (data: any) => {
      const drawData = JSON.parse(data);
      if (drawData.action === 'scene-update' && excalidrawAPI.current) {
        isRemoteUpdate.current = true;
        excalidrawAPI.current.updateScene({ elements: drawData.elements });
        setTimeout(() => { isRemoteUpdate.current = false; }, 50);
      }
    });
  };

  const handleCreateBoard = async () => {
    const newPin = Math.floor(1000 + Math.random() * 9000).toString();
    setPin(newPin);
    
    peerInstance.current = new Peer(PREFIX + newPin);
    peerInstance.current.on('open', () => setIsLobby(false));
    peerInstance.current.on('connection', setupConnection);
  };

  // --- 3. Excalidraw Broadcasting ---
  const throttledBroadcast = throttle((elements) => {
    if (isRemoteUpdate.current || activeConnections.length === 0) return;
    
    activeConnections.forEach(conn => {
      if (conn.open) {
        conn.send(JSON.stringify({ action: 'scene-update', elements }));
      }
    });
  }, 50);

  // --- Render ---
  if (isLobby) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-gray-100 text-gray-900">
        <div className="w-full max-w-md rounded-lg bg-white p-8 text-center shadow-lg">
          <h2 className="mb-6 text-2xl font-bold">Collaborative Whiteboard</h2>
          <button 
            onClick={handleCreateBoard}
            className="rounded bg-blue-600 px-6 py-2 text-white transition-colors hover:bg-blue-700 active:bg-blue-800"
          >
            Create New Board
          </button>
        </div>
      </div>  
    );
  }

  return (
  <div className="flex h-screen flex-col bg-gray-50 overflow-hidden">
      {/* Header with Room Info */}
      <div className="flex items-center justify-between bg-white p-4 shadow-sm border-b border-gray-200">
        <div className="flex items-center gap-6">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Room PIN</h2>
            <p className="text-2xl font-black text-blue-600">{pin}</p>
          </div>
          
          {/* QR Code Section */}
          <div className="flex items-center gap-3 bg-gray-50 p-2 rounded-lg border border-gray-200 shadow-inner">
            <img 
              src={qrCodeUrl} 
              alt="Scan to join" 
              className="h-16 w-16 rounded border border-white shadow-sm bg-white"
            />
            <div>
              <p className="text-xs font-bold text-gray-700">Draw from Phone!</p>
              <p className="text-[10px] text-gray-400">Scan to collaborate</p>
            </div>
          </div>
        </div>
      </div>

      {/* Excalidraw Canvas Area */}
      <div className="relative flex-1 bg-white">
        <Excalidraw 
          excalidrawAPI={(api) => (excalidrawAPI.current = api)}
          onChange={throttledBroadcast}
          theme="light"
        />
      </div>
    </div>
  );
};

export default MainStage;