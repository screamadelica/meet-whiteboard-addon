import { createAdminClient, getAuthenticatedUser, inviteTokenMatches } from '../server/realtime-auth.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const supabase = createAdminClient();
    const user = await getAuthenticatedUser(supabase, request);
    if (!user) return response.status(401).json({ error: 'Supabase sign-in required' });

    const { boardId, inviteToken } = request.body || {};
    if (typeof boardId !== 'string' || typeof inviteToken !== 'string' || inviteToken.length > 128) {
      return response.status(400).json({ error: 'Valid boardId and inviteToken are required' });
    }

    const { data: board, error: boardError } = await supabase
      .from('board_sessions')
      .select('id, channel_name, owner_invite_hash, participant_invite_hash, expires_at')
      .eq('id', boardId)
      .maybeSingle();

    if (boardError) {
      console.error('[redeem-realtime-invite] Session lookup failed:', boardError.message);
      return response.status(500).json({ error: 'Could not validate board invite' });
    }
    if (!board || Date.parse(board.expires_at) <= Date.now()) {
      return response.status(403).json({ error: 'Board invite is invalid or expired' });
    }

    const isOwner = inviteTokenMatches(inviteToken, board.owner_invite_hash);
    const isParticipant = inviteTokenMatches(inviteToken, board.participant_invite_hash);
    if (!isOwner && !isParticipant) {
      return response.status(403).json({ error: 'Board invite is invalid or expired' });
    }

    const role = isOwner ? 'owner' : 'participant';
    const { error: membershipError } = await supabase.from('board_memberships').upsert({
      board_id: board.id,
      user_id: user.id,
      role,
    }, { onConflict: 'board_id,user_id' });

    if (membershipError) {
      console.error('[redeem-realtime-invite] Membership insert failed:', membershipError.message);
      return response.status(500).json({ error: 'Could not join board' });
    }

    return response.status(200).json({
      boardId: board.id,
      channelName: board.channel_name,
      role,
      expiresAt: board.expires_at,
    });
  } catch (error) {
    console.error('[redeem-realtime-invite] Request failed:', error.message);
    return response.status(500).json({ error: 'Could not validate board invite' });
  }
}