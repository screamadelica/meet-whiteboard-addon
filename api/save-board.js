import { neon } from '@neondatabase/serverless';

export default async function handler(request, response) {
    // Only allow POST requests
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // Grab the Room PIN and the drawing data sent from the frontend
        const { pin, elements } = request.body;
        
        // Connect to the Neon database securely using Vercel's hidden variables
        const sql = neon(process.env.MEET_DATABASE_URL);

        // Create the table if it doesn't exist yet
        await sql`
            CREATE TABLE IF NOT EXISTS boards (
                pin VARCHAR(10) UNIQUE PRIMARY KEY,
                lines_json TEXT
            );
        `;

        // Insert or Update the board data
        await sql`
            INSERT INTO boards (pin, lines_json) 
            VALUES (${pin}, ${JSON.stringify(elements)})
            ON CONFLICT (pin) DO UPDATE SET lines_json = ${JSON.stringify(elements)};
        `;

        return response.status(200).json({ success: true, message: "Board Saved!" });
        
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: "Failed to save board" });
    }
}