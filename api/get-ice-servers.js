export default async function handler(request, response) {
    try {
        // 1. Safe attempt to import and initialize Turnix
        let turnix;
        try {
            const mod = await import('turnix-js');
            if (mod.Turnix && process.env.TURNIX_API_TOKEN) {
                turnix = new mod.Turnix(process.env.TURNIX_API_TOKEN);
            }
        } catch (e) {
            console.log("[API] Turnix setup failed or skipped. Using fallback.");
        }
        
        if (turnix) {
            const credentials = await turnix.getIceCredentials({
                ttl: 3600,
                preferred_region: 'eu-central'
            });
            return response.status(200).json({ 
                config: { iceServers: credentials.iceServers, iceTransportPolicy: 'all' }
            });
        }
        
        throw new Error('No dynamic ICE provider available');
    } catch (error) {
        console.warn('[API] get-ice-servers error:', error.message);
        
        return response.status(200).json({
            config: {
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
                iceTransportPolicy: 'all'
            }
        });
    }
}