import { Turnix } from 'turnix-js';

export default async function handler(req, res) {
    try {
        // Initialize inside the handler to ensure errors are caught by the try/catch block
        // and prevent the lambda from crashing on boot if the token is missing.
        const turnix = new Turnix(process.env.TURNIX_API_TOKEN || '');

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