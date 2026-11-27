import React, { useEffect, useState } from 'react';
import { meet } from '@googleworkspace/meet-addons';
import { checkTutorAccess, createRealtimeSession, getSupabaseClient } from '../realtime/supabase';

type TutorAuthStatus = 'checking' | 'signed-out' | 'checking-approval' | 'approved' | 'not-approved' | 'error';
type TutorCheckResult = 'approved' | 'signed-out' | 'not-approved' | 'error';

const SidePanel = () => {
  const [client, setClient] = useState<any>(null);
  const [pin, setPin] = useState<string | null>(null);
  const [tutorAuthStatus, setTutorAuthStatus] = useState<TutorAuthStatus>('checking');
  const [tutorEmail, setTutorEmail] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState('');
  const [launchMessage, setLaunchMessage] = useState('');
  const [isLaunching, setIsLaunching] = useState(false);
  const [authCallbackStatus, setAuthCallbackStatus] = useState<TutorCheckResult | 'checking' | null>(null);
  const [authCallbackMessage, setAuthCallbackMessage] = useState('');
  const tutorAuthPopup = React.useRef<Window | null>(null);
  const isTutorAuthCallback = new URLSearchParams(window.location.search).get('tutor_auth_complete') === '1';

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

    const refreshTutorAccess = async (session?: any): Promise<TutorCheckResult> => {
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
          return 'signed-out';
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
        return 'approved';
      } catch (error) {
        const status = (error as Error & { status?: number }).status;
        if (active) {
          if (status === 401) {
            setTutorEmail(null);
            setTutorAuthStatus('signed-out');
            setAuthMessage('No Google sign-in session was found.');
            return 'signed-out';
          } else if (status === 403) {
            setTutorAuthStatus('not-approved');
            setAuthMessage('This Google account is not listed as an approved tutor.');
            return 'not-approved';
          } else {
            setTutorAuthStatus('error');
            setAuthMessage((error as Error).message || 'Could not verify tutor access.');
            return 'error';
          }
        }
        return 'error';
      }
    };

    if (isTutorAuthCallback) {
      setAuthCallbackStatus('checking');
      void refreshTutorAccess().then(async (result) => {
        if (!active) return;
        const message = result === 'approved'
          ? 'Google sign-in succeeded and this account is approved as a tutor.'
          : result === 'not-approved'
            ? 'Google sign-in succeeded, but this account is not approved as a tutor.'
            : result === 'signed-out'
              ? 'No Supabase session was found after Google sign-in. Try signing in again.'
              : 'Tutor verification failed. Read the error below, then close this window when ready.';
        setAuthCallbackStatus(result);
        setAuthCallbackMessage(message);
        if (window.opener && !window.opener.closed) {
          const { data: sessionData } = await supabase.auth.getSession();
          window.opener.postMessage({
            type: 'meet-tutor-auth-complete',
            status: result,
            message,
            session: sessionData.session ? {
              access_token: sessionData.session.access_token,
              refresh_token: sessionData.session.refresh_token,
            } : null,
          }, window.location.origin);
        }
      });
    } else {
      void refreshTutorAccess();
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isTutorAuthCallback) void refreshTutorAccess(session);
    });
    const onPopupMessage = async (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== tutorAuthPopup.current ||
        event.data?.type !== 'meet-tutor-auth-complete'
      ) return;

      if (event.data.status === 'approved' && event.data.session?.access_token && event.data.session?.refresh_token) {
        setTutorAuthStatus('checking-approval');
        const { data, error } = await supabase.auth.setSession(event.data.session);
        if (error || !data.session) {
          setTutorAuthStatus('error');
          setAuthMessage(error?.message || 'Could not transfer the Google sign-in session to Meet.');
          return;
        }
        await refreshTutorAccess(data.session);
      } else if (event.data.status === 'not-approved') {
        setTutorAuthStatus('not-approved');
        setAuthMessage(event.data.message || 'This Google account is not listed as an approved tutor.');
      } else if (event.data.status === 'error') {
        setTutorAuthStatus('error');
        setAuthMessage(event.data.message || 'Tutor verification failed.');
      } else {
        void refreshTutorAccess();
      }
    };
    window.addEventListener('message', onPopupMessage);

    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener('message', onPopupMessage);
    };
  }, [isTutorAuthCallback]);

  const handleTutorSignIn = async () => {
    const popup = window.open('about:blank', 'meet-tutor-google-signin', 'popup,width=520,height=680');
    if (!popup) {
      setAuthMessage('Allow pop-ups for this site, then try signing in again.');
      return;
    }
    tutorAuthPopup.current = popup;

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
    if (!client || tutorAuthStatus !== 'approved' || isLaunching) return;
    setIsLaunching(true);
    setLaunchMessage('');
    try {
      const { data: sessionData, error: sessionError } = await getSupabaseClient().auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData.session || sessionData.session.user.is_anonymous) {
        setTutorAuthStatus('signed-out');
        throw new Error('Tutor sign-in expired. Sign in with Google again.');
      }

      const board = await createRealtimeSession(sessionData.session.access_token);
      await client.startActivity({
        mainStageUrl: `${window.location.origin}/main-stage.html`,
        additionalData: JSON.stringify({
          boardId: board.boardId,
          studentInviteToken: board.studentInviteToken,
          expiresAt: board.expiresAt,
        }),
      });
    } catch (error) {
      console.error('[SidePanel] Could not launch Meet board:', error);
      setLaunchMessage((error as Error).message || 'Meet could not start the board. Try reopening the add-on.');
    } finally {
      setIsLaunching(false);
    }
  };

  if (isTutorAuthCallback) {
    const callbackTitle = authCallbackStatus === 'approved'
      ? 'Tutor sign-in complete'
      : authCallbackStatus === 'not-approved'
        ? 'Tutor account not approved'
        : authCallbackStatus === 'signed-out'
          ? 'Sign-in session missing'
          : authCallbackStatus === 'error'
            ? 'Could not verify tutor access'
            : 'Checking tutor access...';

    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-6 font-sans text-[#3c4043]">
        <h1 className="m-0 text-xl font-semibold">{callbackTitle}</h1>
        <p className="m-0 text-sm leading-5 text-slate-600">{authCallbackMessage || 'Waiting for Supabase to confirm your Google session.'}</p>
        {authMessage && <pre className="m-0 whitespace-pre-wrap break-words rounded border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{authMessage}</pre>}
        <button
          type="button"
          onClick={() => window.close()}
          className="cursor-pointer rounded bg-[#1a73e8] px-4 py-3 text-sm font-semibold text-white hover:bg-[#1557b0]"
        >
          Close this window
        </button>
      </main>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-3 text-[#3c4043] font-sans">
      <h2 className="text-[18px] font-medium m-0">Tudraw Whiteboard Add-on</h2>
      <section className="flex flex-col gap-3">
          <p className="m-0 text-sm leading-5">Launch the shared board in the Meet main stage.</p>
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
            disabled={!client || tutorAuthStatus !== 'approved' || isLaunching}
            className={`w-full rounded px-4 py-3 text-sm font-semibold text-white transition-colors ${
              client && tutorAuthStatus === 'approved' && !isLaunching ? 'cursor-pointer bg-[#1a73e8] hover:bg-[#1557b0]' : 'cursor-not-allowed bg-[#dadce0]'
            }`}
          >
            {!client ? 'Initializing Meet...' : isLaunching ? 'Preparing board...' : tutorAuthStatus === 'approved' ? 'Launch Main Stage' : 'Tutor sign-in required'}
          </button>
          {launchMessage && <p role="alert" className="m-0 text-xs text-rose-700">{launchMessage}</p>}
          {pin && (
            <div className="flex items-center justify-between border-t border-slate-200 pt-3">
              <span className="text-xs font-medium text-slate-500">Session PIN</span>
              <span className="font-mono text-lg font-bold tracking-[0.16em] text-[#1a73e8]">{pin}</span>
            </div>
          )}
      </section>
    </div>
  );
};
export default SidePanel;