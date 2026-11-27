import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;

export function createAdminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured');
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function getAuthenticatedUser(supabase, request) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.authorization || '');
  if (!match) return null;

  const { data, error } = await supabase.auth.getUser(match[1]);
  if (error || !data.user) return null;
  return data.user;
}

export function isGoogleUser(user) {
  const providers = user?.app_metadata?.providers || [];
  return Boolean(
    user &&
    !user.is_anonymous &&
    user.email &&
    user.email_confirmed_at &&
    (user.app_metadata?.provider === 'google' || providers.includes('google'))
  );
}

export async function findApprovedTutor(supabase, user) {
  if (!isGoogleUser(user)) return null;

  const email = user.email.trim().toLowerCase();
  const pattern = email.replace(/[\\%_]/g, '\\$&');
  const results = await Promise.all([
    supabase.from('tutors').select('id, name, email, cal_email').ilike('email', pattern).limit(2),
    supabase.from('tutors').select('id, name, email, cal_email').ilike('cal_email', pattern).limit(2),
  ]);

  for (const result of results) {
    if (result.error) throw result.error;
  }

  const matches = new Map();
  results.flatMap((result) => result.data || []).forEach((tutor) => {
    if ([tutor.email, tutor.cal_email].some((value) => value?.trim().toLowerCase() === email)) {
      matches.set(tutor.id, tutor);
    }
  });

  return matches.size === 1 ? matches.values().next().value : null;
}

export function createInviteToken() {
  return randomBytes(32).toString('base64url');
}

export function hashInviteToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function inviteTokenMatches(token, tokenHash) {
  if (typeof token !== 'string' || typeof tokenHash !== 'string') return false;
  const suppliedHash = Buffer.from(hashInviteToken(token), 'hex');
  const storedHash = Buffer.from(tokenHash, 'hex');
  return suppliedHash.length === storedHash.length && timingSafeEqual(suppliedHash, storedHash);
}

export function createBoardCredentials() {
  const boardId = randomUUID();
  const ownerInviteToken = createInviteToken();
  const participantInviteToken = createInviteToken();
  return {
    boardId,
    channelName: `board:${boardId}`,
    ownerInviteToken,
    participantInviteToken,
    ownerInviteHash: hashInviteToken(ownerInviteToken),
    participantInviteHash: hashInviteToken(participantInviteToken),
    expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS).toISOString(),
  };
}