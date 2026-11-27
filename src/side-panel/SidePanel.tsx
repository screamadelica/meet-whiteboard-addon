import React, { useEffect, useState } from 'react';
import { meet } from '@googleworkspace/meet-addons';
import { QRCodeSVG } from 'qrcode.react';
import { checkTutorAccess, getSupabaseClient } from '../realtime/supabase';

type TutorAuthStatus = 'checking' | 'signed-out' | 'checking-approval' | 'approved' | 'not-approved' | 'error';

const SidePanel = () => {
  const APP_VERSION = '{{VITE_APP_VERSION}}';
  const [client, setClient] = useState<any>(null);
  const [pin, setPin] = useState<string | null>(null);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [tutorInviteToken, setTutorInviteToken] = useState<string | null>(null);
  const [studentInviteToken, setStudentInviteToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'launch' | 'tutor' | 'student'>('launch');
  const [tutorAuthStatus, setTutorAuthStatus] = useState<TutorAuthStatus>('checking');
  const [tutorEmail, setTutorEmail] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState('');

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

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseClient();

    const refreshTutorAccess = async (session?: any) => {
      try {
        let currentSession = session;
        if (currentSession === undefined) {
          const result = await supabase.auth.getSession();
          if (result.error) throw result.error;
          currentSession = result.data.session;
        }

        if (!currentSession?.user || currentSession.user.is_anonymous) {
          if (active) {
            setTutorEmail(null);
            setTutorAuthStatus('signed-out');
          }
          return;
        }

        if (active) {
          setTutorEmail(currentSession.user.email ?? null);
          setTutorAuthStatus('checking-approval');
        }
        await checkTutorAccess(currentSession.access_token);
        if (active) {
          setTutorAuthStatus('approved');
          setAuthMessage('');
        }
      } catch (error) {
        const status = (error as Error & { status?: number }).status;
        if (active) {
          if (status === 401) {
            setTutorEmail(null);
            setTutorAuthStatus('signed-out');
          } else if (status === 403) {
            setTutorAuthStatus('not-approved');
            setAuthMessage('This Google account is not listed as an approved tutor.');
          } else {
            setTutorAuthStatus('error');
            setAuthMessage('Could not verify tutor access. Check your connection and try again.');
          }
        }
      }
    };

    void refreshTutorAccess();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void refreshTutorAccess(session);
    });
    const onPopupMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.data?.type === 'meet-tutor-auth-complete') {
        void refreshTutorAccess();
      }
    };
    window.addEventListener('message', onPopupMessage);

    const query = new URLSearchParams(window.location.search);
    if (query.get('tutor_auth_complete') === '1' && window.opener) {
      void refreshTutorAccess().finally(() => {
        window.opener?.postMessage({ type: 'meet-tutor-auth-complete' }, window.location.origin);
        window.close();
      });
    }

    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener('message', onPopupMessage);
    };
  }, []);

  const handleTutorSignIn = async () => {
    const popup = window.open('about:blank', 'meet-tutor-google-signin', 'popup,width=520,height=680');
    if (!popup) {
      setAuthMessage('Allow pop-ups for this site, then try signing in again.');
      return;
    }

    setTutorAuthStatus('checking');
    setAuthMessage('');
    try {
      const { data, error } = await getSupabaseClient().auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/side-panel.html?tutor_auth_complete=1`,
          skipBrowserRedirect: true,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error || !data.url) throw error || new Error('Supabase did not return a Google sign-in URL');
      popup.location.href = data.url;
    } catch (error) {
      popup.close();
      setTutorAuthStatus('error');
      setAuthMessage((error as Error).message || 'Could not start Google sign-in.');
    }
  };

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
          {tutorAuthStatus === 'approved' ? (
            <p className="m-0 text-xs text-emerald-700">Tutor verified{tutorEmail ? `: ${tutorEmail}` : ''}</p>
          ) : (
            <div className="flex flex-col gap-2 rounded border border-slate-200 p-3">
              <p className="m-0 text-xs leading-4 text-slate-600">
                {tutorAuthStatus === 'checking' || tutorAuthStatus === 'checking-approval'
                  ? 'Checking tutor access...'
                  : 'Sign in with an approved tutor Google account to create a board.'}
              </p>
              {tutorAuthStatus !== 'checking' && tutorAuthStatus !== 'checking-approval' && (
                <button
                  type="button"
                  onClick={handleTutorSignIn}
                  className="cursor-pointer rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Sign in with Google
                </button>
              )}
              {authMessage && <p role="status" className="m-0 text-xs text-rose-700">{authMessage}</p>}
            </div>
          )}
          <button
            onClick={handleLaunch}
            disabled={!client || tutorAuthStatus !== 'approved'}
            className={`w-full rounded px-4 py-3 text-sm font-semibold text-white transition-colors ${
              client && tutorAuthStatus === 'approved' ? 'cursor-pointer bg-[#1a73e8] hover:bg-[#1557b0]' : 'cursor-not-allowed bg-[#dadce0]'
            }`}
          >
            {!client ? 'Initializing Meet...' : tutorAuthStatus === 'approved' ? 'Launch Main Stage' : 'Tutor sign-in required'}
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