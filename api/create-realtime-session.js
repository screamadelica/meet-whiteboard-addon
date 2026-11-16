import { createAdminClient, createBoardCredentials, getAuthenticatedUser } from '../server/realtime-auth.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const supabase = createAdminClient();
    const user = await getAuthenticatedUser(supabase, request);
    if (!user) return response.status(401).json({ error: 'Supabase sign-in required' });

    const credentials = createBoardCredentials();
    const { error } = await supabase.from('board_sessions').insert({
      id: credentials.boardId,
      channel_name: credentials.channelName,
      owner_invite_hash: credentials.ownerInviteHash,
      participant_invite_hash: credentials.participantInviteHash,
      expires_at: credentials.expiresAt,
    });

    if (error) {
      console.error('[create-realtime-session] Session insert failed:', error.message);
      return response.status(500).json({ error: 'Could not create board session' });
    }

    const { error: membershipError } = await supabase.from('board_memberships').insert({
      board_id: credentials.boardId,
      user_id: user.id,
      role: 'owner',
    });

    if (membershipError) {
      await supabase.from('board_sessions').delete().eq('id', credentials.boardId);
      console.error('[create-realtime-session] Owner membership insert failed:', membershipError.message);
      return response.status(500).json({ error: 'Could not create board session' });
    }

    return response.status(201).json({
      boardId: credentials.boardId,
      channelName: credentials.channelName,
      tutorInviteToken: credentials.ownerInviteToken,
      studentInviteToken: credentials.participantInviteToken,
      expiresAt: credentials.expiresAt,
    });
  } catch (error) {
    console.error('[create-realtime-session] Request failed:', error.message);
    return response.status(500).json({ error: 'Could not create board session' });
  }
}