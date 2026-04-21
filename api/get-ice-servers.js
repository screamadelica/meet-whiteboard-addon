export default async function handler(request, response) {
    try {
        // 1. Defensive check for the Turnix library and Token
        let TurnixClass;
        try {
            const mod = await import('turnix-js');
            TurnixClass = mod.Turnix;
        } catch (e) {
            console.warn("Turnix library not found, using fallback.");
        }
        
        if (!TurnixClass || !process.env.TURNIX_API_TOKEN) {
            throw new Error('Turnix not configured');
        }

        // 2. Initialize Turnix
        const turnix = new TurnixClass(process.env.TURNIX_API_TOKEN);

        const credentials = await turnix.getIceCredentials({
            ttl: 3600,                // 1 hour
            preferred_region: 'eu-central'
        });

        return response.status(200).json({ 
            config: {
                iceServers: credentials.iceServers,
                iceTransportPolicy: 'all'
            }
        });
    } catch (error) {
        console.log('Using STUN fallback:', error.message);
        
        return response.status(200).json({
            config: {
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
                iceTransportPolicy: 'all'
            }
        });
    }
}