import React, { useEffect, useState } from 'react';
import { meet } from '@googleworkspace/meet-addons';
import { QRCodeSVG } from 'qrcode.react';

const SidePanel = () => {
  const APP_VERSION = '{{VITE_APP_VERSION}}';
  const [client, setClient] = useState<any>(null);
  const [pin, setPin] = useState<string | null>(null);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [tutorInviteToken, setTutorInviteToken] = useState<string | null>(null);
  const [studentInviteToken, setStudentInviteToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'launch' | 'tutor' | 'student'>('launch');

  useEffect(() => {
    let cancelled = false;

    const initMeet = async () => {
      try {
        const session = await meet.addon.createAddonSession({
          cloudProjectNumber: "109641982239"           
        });
        
        if (cancelled) return;

        const sidePanelClient = await session.createSidePanelClient();
        
        if (cancelled) return;

        setClient(sidePanelClient);

        sidePanelClient.on('frameToFrameMessage', (arg) => {
          const receivedMessage = JSON.parse(arg.payload);
          if (receivedMessage.action === 'pin') {
            setPin(receivedMessage.value);
            setPeerId(receivedMessage.peerId);
            setBoardId(receivedMessage.boardId ?? null);
            setTutorInviteToken(receivedMessage.tutorInviteToken ?? null);
            setStudentInviteToken(receivedMessage.studentInviteToken ?? null);
          }
        });

      } catch (error) {
        console.error("SDK Initialization FAILED:", error);
      }
    };

    initMeet();

    return () => {
      cancelled = true; // cleanup on unmount/remount
    };

  }, []);

  const handleLaunch = async () => {
    if (client) {
      await client.startActivity({
        mainStageUrl: `${window.location.origin}/main-stage.html`
      });
    }
  };

  const boardReady = !!(peerId && boardId && tutorInviteToken && studentInviteToken);
  const inviteToken = activeTab === 'tutor' ? tutorInviteToken : studentInviteToken;
  const mobileUrl = boardReady && inviteToken
    ? `${window.location.origin}/mobile.html?${new URLSearchParams({ v: APP_VERSION, peerId: peerId!, boardId: boardId! })}#${new URLSearchParams({ inviteToken })}`
    : '';

  const tabs = [
    { id: 'launch' as const, label: 'Launch' },
    { id: 'tutor' as const, label: 'Tutor QR' },
    { id: 'student' as const, label: 'Student QR' },
  ];

  return (
    <div className="p-4 flex flex-col gap-3 text-[#3c4043] font-sans">
      <h2 className="text-[18px] font-medium m-0">Tudraw Whiteboard Add-on</h2>
      <div role="tablist" aria-label="Board setup" className="grid grid-cols-3 border-b border-slate-200">
        {tabs.map((tab) => {
          const disabled = tab.id !== 'launch' && !boardReady;
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`board-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`board-panel-${tab.id}`}
              disabled={disabled}
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 px-2 py-2 text-xs font-medium transition-colors ${
                selected ? 'border-[#1a73e8] text-[#1a73e8]' : 'border-transparent text-slate-600'
              } ${disabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-slate-50'}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'launch' && (
        <section id="board-panel-launch" role="tabpanel" aria-labelledby="board-tab-launch" className="flex flex-col gap-3">
          <p className="m-0 text-sm leading-5">Start the shared board, then open a role tab to pair each mobile device.</p>
          <button
            onClick={handleLaunch}
            disabled={!client}
            className={`w-full rounded px-4 py-3 text-sm font-semibold text-white transition-colors ${
              client ? 'bg-[#1a73e8] hover:bg-[#1557b0]' : 'cursor-not-allowed bg-[#dadce0]'
            }`}
          >
            {client ? 'Launch Main Stage' : 'Initializing...'}
          </button>
          {pin && (
            <div className="flex items-center justify-between border-t border-slate-200 pt-3">
              <span className="text-xs font-medium text-slate-500">Session PIN</span>
              <span className="font-mono text-lg font-bold tracking-[0.16em] text-[#1a73e8]">{pin}</span>
            </div>
          )}
          {pin && !boardReady && <p className="m-0 text-xs text-amber-700">Role QR codes are not available for this session.</p>}
        </section>
      )}

      {(activeTab === 'tutor' || activeTab === 'student') && (
        <section
          id={`board-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`board-tab-${activeTab}`}
          className="flex flex-col items-center gap-3 py-2 text-center"
        >
          <p className="m-0 text-sm font-medium">Scan with the {activeTab === 'tutor' ? 'tutor' : 'student'}'s mobile device</p>
          {mobileUrl && (
            <div className="rounded border border-slate-200 bg-white p-3">
              <QRCodeSVG
                value={mobileUrl}
                size={180}
                level="M"
                marginSize={2}
                aria-label={`${activeTab === 'tutor' ? 'Tutor' : 'Student'} mobile board invite`}
              />
            </div>
          )}
          {pin && <span className="font-mono text-sm font-bold tracking-[0.16em] text-[#1a73e8]">PIN {pin}</span>}
        </section>
      )}
    </div>
  );
};
export default SidePanel;