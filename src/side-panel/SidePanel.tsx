import React, { useEffect, useState } from 'react';
import { meet } from '@googleworkspace/meet-addons';

const SidePanel = () => {
  const [client, setClient] = useState<any>(null);
  const [pin, setPin] = useState<string | null>(null);
  const [prefix, setPrefix] = useState<string | null>(null);

  useEffect(() => {
    const initMeet = async () => {
      try {
        // Initialize session using the imported 'meet' object
        const session = await meet.addon.createAddonSession({
          cloudProjectNumber: "547958960288" 
        });
        
        const sidePanelClient = await session.createSidePanelClient();
        setClient(sidePanelClient);

        sidePanelClient.on('frameToFrameMessage', (arg) => {
          const receivedMessage = JSON.parse(arg.payload);
          if (receivedMessage.action === 'pin') {
            setPin(receivedMessage.value);
            setPrefix(receivedMessage.prefix);
          }
        });

      } catch (error) {
        console.error("SDK Initialization FAILED:", error);
      }
    };

    initMeet();
  }, []);

  const handleLaunch = async () => {
    if (client) {
      await client.startActivity({
        mainStageUrl: `${window.location.origin}/main-stage.html`
      });
    }
  };

  return (
    <div className="p-6 flex flex-col gap-3 text-[#3c4043] font-sans">
      <h2 className="text-[18px] font-medium m-0">Whiteboard Add-on</h2>
      <p className="text-sm leading-5 mb-2">
        Collaborate with your team by launching the whiteboard on the main stage.
      </p>
      
      <button
        onClick={handleLaunch}
        disabled={!client}
        className={`rounded text-white text-sm font-medium py-[10px] px-6 w-fit transition-colors ${
          client ? 'bg-[#1a73e8] hover:bg-[#1557b0] cursor-pointer' : 'bg-[#dadce0] cursor-not-allowed'
        }`}
      >
        {client ? "Launch Main Stage" : "Initializing..."}
      </button>
      
      {pin && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center my-2 flex flex-col items-center gap-3">
          <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Session PIN</span>
          <div className="bg-white p-2 rounded-md shadow-sm border border-slate-100">
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(`${window.location.origin}/mobile.html?peerId=${prefix + pin}`)}`} alt="QR" className="h-30 w-30" />
          </div>
          <span className="text-2xl font-mono font-bold text-[#1a73e8] tracking-[0.2em]">{pin}</span>
        </div>
      )}
    </div>
  );
};
export default SidePanel;