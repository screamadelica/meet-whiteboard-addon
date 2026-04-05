import { Turnix } from 'turnix-js';

// Initialize the Turnix client.
// Make sure to set TURNIX_API_TOKEN in your Vercel Environment Variables.
const turnix = new Turnix(process.env.TURNIX_API_TOKEN);

export default async function handler(req, res) {
    try {
        // 1. Request new dynamic ICE credentials from Turnix
        const credentials = await turnix.getIceCredentials({
            ttl: 3600,                // 1 hour
            preferred_region: 'eu-central'
        });

        // 2. Return the dynamic configuration to the frontend
        res.status(200).json({ 
            config: {
                iceServers: credentials.iceServers,
                iceTransportPolicy: 'all'
            }
        });
    } catch (error) {
        console.error('Failed to fetch Turnix credentials:', error.message);
        
        // Fallback to basic STUN if the service is unavailable
        res.status(200).json({
            config: {
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
                iceTransportPolicy: 'all'
            }
        });
    }
}