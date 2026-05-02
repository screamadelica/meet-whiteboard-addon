export default async function handler(request, response) {
    try {
        console.log("[API] get-ice-servers called")
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
        console.error('[API] UNHANDLED ERROR:', error); // check your server terminal
        return response.status(200).json({
            config: {
                "iceServers":[
                {
                    "urls":["stun:stun.turnix.io:3478"]

                },
                {
                    "username":"7e6ffbb6-44ca-4aea-97a4-e895d4831b46",
                    "credential":"b392642eb83cf9454bb3fd1af80eedee",
                    "urls":[
                        "turn:eu-central.turnix.io:3478?transport=udp",
                        "turn:eu-central.turnix.io:3478?transport=tcp",
                        "turns:eu-central.turnix.io:443?transport=udp",
                        "turns:eu-central.turnix.io:443?transport=tcp"]
                    }
                ],
                "expiresAt":"2026-05-31T06:48:36.283Z"
            },
            iceTransportPolicy: 'all'
        });
    }
}
