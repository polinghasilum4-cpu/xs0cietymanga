export default async function handler(req, res) {
    const { path } = req.query;
    if (!path) return res.status(400).json({ error: 'Missing path' });

    const MANGA_DEX_BASE = 'https://api.mangadex.org';
    const url = `${MANGA_DEX_BASE}${path}`;

    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'XSOCIETY-HUB/1.0' }
        });
        const data = await response.json();
        
        // Biar browser lo bisa akses (CORS)
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET');
        res.status(response.status).json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch from MangaDex' });
    }
}
