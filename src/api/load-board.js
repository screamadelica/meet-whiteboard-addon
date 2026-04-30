import { neon } from '@neondatabase/serverless';

export default async function handler(request, response) {
    // We use a GET request to fetch data
    if (request.method !== 'GET') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // Grab the PIN from the URL (e.g., /api/load-board?pin=1234)
        const { pin } = request.query;
        if (!pin) return response.status(400).json({ error: 'PIN required' });

        // Connect using your specific MEET_ prefix
        const sql = neon(process.env.MEET_DATABASE_URL);

        // Fetch the board from the database
        const result = await sql`SELECT lines_json FROM boards WHERE pin = ${pin}`;

        // If no board exists for this PIN, just return an empty array
        if (result.length === 0) {
            return response.status(200).json({ elements: [] });
        }

        // Return the saved elements!
        return response.status(200).json({ elements: JSON.parse(result[0].lines_json) });
        
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: "Failed to load board" });
    }
}