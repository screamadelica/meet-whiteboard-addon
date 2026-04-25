import React, { useEffect, useState } from 'react';
import { meet } from '@googleworkspace/meet-addons';

const SidePanel = () => {
  const [client, setClient] = useState<any>(null);

  useEffect(() => {
    const initMeet = async () => {
      try {
        // Initialize session using the imported 'meet' object
        const session = await meet.addon.createAddonSession({
          cloudProjectNumber: "547958960288" 
        });
        
        const sidePanelClient = await session.createSidePanelClient();
        setClient(sidePanelClient);
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
    </div>
  );
};
export default SidePanel;