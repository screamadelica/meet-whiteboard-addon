import { createAdminClient, findApprovedTutor, getAuthenticatedUser } from '../server/realtime-auth.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const supabase = createAdminClient();
    const user = await getAuthenticatedUser(supabase, request);
    if (!user) return response.status(401).json({ error: 'Google sign-in required' });

    const tutor = await findApprovedTutor(supabase, user);
    if (!tutor) return response.status(403).json({ error: 'This Google account is not approved as a tutor' });

    return response.status(200).json({ approved: true, tutorName: tutor.name });
  } catch (error) {
    console.error('[check-tutor-access] Request failed:', error.message);
    return response.status(500).json({ error: 'Could not verify tutor access' });
  }
}