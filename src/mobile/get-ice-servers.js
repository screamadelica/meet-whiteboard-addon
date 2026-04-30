export default async function handler(req, res) {
  // This function provides the ICE configuration for WebRTC.
  // Standard Google STUN servers are usually enough for simple NAT traversal,
  // but for production, you should integrate a TURN provider (e.g., Twilio, Xirsys, or Cloudflare).
  
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ];

  // Check for environment variables if you eventually add a TURN provider
  if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_PASSWORD) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_PASSWORD,
    });
  }

  // Ensure CORS is handled and provide a cache hint to prevent redundant calls
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');

  res.status(200).json({
    config: { iceServers }
  });
}