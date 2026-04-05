export default function handler(req, res) {
    // It is recommended to store these in environment variables on Vercel
    const iceServers = [
        {   
            urls: 'stun:stun.l.google.com:19302' 
        },
        {   
            urls: 'stun:stun1.l.google.com:19302' 
        },
        {
            urls: 'turn:eu-central.turnix.io:3478?transport=udp',
            username: process.env.TURN_USERNAME || 'cede4d01-899b-4a29-9cae-d15c8bba1f48',
            credential: process.env.TURN_CREDENTIAL || '6289edb5424e87d0cbc16175f0115ce4'
        },
        {
            urls: 'turn:eu-central.turnix.io:3478?transport=tcp',
            username: process.env.TURN_USERNAME || 'cede4d01-899b-4a29-9cae-d15c8bba1f48',
            credential: process.env.TURN_CREDENTIAL || '6289edb5424e87d0cbc16175f0115ce4'
        },
        {
            urls: 'turns:eu-central.turnix.io:443?transport=udp',
            username: process.env.TURN_USERNAME || 'cede4d01-899b-4a29-9cae-d15c8bba1f48',
            credential: process.env.TURN_CREDENTIAL || '6289edb5424e87d0cbc16175f0115ce4'
        },
        {
            urls: 'turns:eu-central.turnix.io:443?transport=tcp',
            username: process.env.TURN_USERNAME || 'cede4d01-899b-4a29-9cae-d15c8bba1f48',
            credential: process.env.TURN_CREDENTIAL || '6289edb5424e87d0cbc16175f0115ce4'
        }
    ];

    res.status(200).json({ 
        config: {
            iceServers: iceServers,
            iceTransportPolicy: 'all'
        }
    });
}