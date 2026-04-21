export default async function handler(req, res) {
    try {
        // Dynamically import or check for Turnix to prevent top-level crashes
        // if the package is missing or failing to initialize.
        const { Turnix } = await import('turnix-js').catch(() => ({ Turnix: null }));
        
        if (!Turnix || !process.env.TURNIX_API_TOKEN) {
            throw new Error('Turnix not configured');
        }

        // Initialize inside the handler to ensure errors are caught by the try/catch block
        const turnix = new Turnix(process.env.TURNIX_API_TOKEN);

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
        console.warn('ICE Fetch Warning (using fallback):', error.message);
        
        // Fallback to basic STUN if the service is unavailable
        return res.status(200).json({
            config: {
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
                iceTransportPolicy: 'all'
            }
        });
    }
}