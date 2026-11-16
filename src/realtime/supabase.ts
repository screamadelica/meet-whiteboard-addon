import { createClient, type RealtimeChannel } from '@supabase/supabase-js';

let client: ReturnType<typeof createClient> | null = null;
let authPromise: Promise<string> | null = null;

export function getSupabaseClient() {
  if (client) return client;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !publishableKey) {
    throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be configured');
  }

  client = createClient(url, publishableKey, {
    auth: { autoRefreshToken: true, persistSession: true },
  });
  return client;
}

export async function getAnonymousAccessToken() {
  if (authPromise) return authPromise;

  authPromise = (async () => {
    const supabase = getSupabaseClient();
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (sessionData.session) return sessionData.session.access_token;

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    if (!data.session) throw new Error('Supabase did not create an anonymous session');
    return data.session.access_token;
  })();

  try {
    return await authPromise;
  } finally {
    authPromise = null;
  }
}

async function postAuthenticated(path: string, body: unknown) {
  const accessToken = await getAnonymousAccessToken();
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}

export function createRealtimeSession() {
  return postAuthenticated('/api/create-realtime-session', {});
}

export function redeemRealtimeInvite(boardId: string, inviteToken: string) {
  return postAuthenticated('/api/redeem-realtime-invite', { boardId, inviteToken });
}

export type BoardRealtimeMessage = {
  action: string;
  [key: string]: unknown;
};

export function sendPrivateBoardMessage(channel: RealtimeChannel, payload: BoardRealtimeMessage) {
  return channel.send({ type: 'broadcast', event: 'board-message', payload });
}

export function joinPrivateBoardChannel(
  channelName: string,
  onMessage?: (payload: BoardRealtimeMessage) => void,
) {
  const channel: RealtimeChannel = getSupabaseClient().channel(channelName, {
    config: { private: true },
  });
  if (onMessage) {
    channel.on('broadcast', { event: 'board-message' }, ({ payload }) => {
      if (payload && typeof payload.action === 'string') onMessage(payload as BoardRealtimeMessage);
    });
  }

  const ready = new Promise<RealtimeChannel>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      void channel.unsubscribe();
      reject(new Error('Timed out joining the private board channel'));
    }, 10000);

    channel.subscribe((status, error) => {
      if (status === 'SUBSCRIBED') {
        window.clearTimeout(timeout);
        resolve(channel);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        window.clearTimeout(timeout);
        reject(error || new Error(`Private channel subscription ${status.toLowerCase()}`));
      }
    });
  });

  return ready;
}
