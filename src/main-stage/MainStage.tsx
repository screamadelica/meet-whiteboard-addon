import React, { useEffect, useState, useRef } from 'react';
import './MainStage.css';
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
      <div className="lobby-container">
        <div className="card">
          <h2>Collaborative Whiteboard</h2>
          <button onClick={handleCreateBoard}>Create New Board</button>
          {/* Add Join logic here similarly */}
        </div>
      </div>
    );
  }

  return (
    <div className="canvas-screen">
      <div className="header">
        <h2>Room PIN: <span style={{color: '#0F9D58'}}>{pin}</span></h2>
        <p>{status}</p>
      </div>
      
      <div style={{ height: '500px', width: '800px', border: '1px solid #ccc' }}>
        <Excalidraw 
          excalidrawAPI={(api) => (excalidrawAPI.current = api)}
          onChange={throttledBroadcast}
        />
      </div>
    </div>
  );
};

export default MainStage;