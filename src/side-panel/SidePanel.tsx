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
        mainStageUrl: `${window.location.origin}/main-stage`
      });
    }
  };

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '10px' }}>
      <h3>Hello World Add-on</h3>
      <button 
        onClick={handleLaunch} 
        disabled={!client}
      >
        {client ? "Launch Main Stage" : "Initializing..."}
      </button>
    </div>
  );
};

export default SidePanel;