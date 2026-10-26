export default async function handler(req, res) {
    const { path } = req.query;
    if (!path) return res.status(400).json({ error: 'Missing path' });

    const MANGA_DEX_BASE = 'https://api.mangadex.org';
    const url = `${MANGA_DEX_BASE}${path}`;

    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'XSOCIETY-HUB/1.0' }
        });
        let data = await response.json();

        // 1. FIX COVER ART (MangaDex naruh cover di relationships)
        const resolveCover = (manga) => {
            if (!manga.relationships) return;
            const coverRel = manga.relationships.find(r => r.type === 'cover_art');
            if (coverRel && coverRel.attributes && coverRel.attributes.fileName) {
                manga.coverUrl = `https://uploads.mangadex.org/covers/${manga.id}/${coverRel.attributes.fileName}.512.jpg`;
            } else {
                // Fallback cover keren (SVG) kalau emang ga ada
                manga.coverUrl = `data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='256' height='384'%3E%3Crect width='100%25' height='100%25' fill='%23141414'/%3E%3Ctext x='50%25' y='50%25' fill='%23e50914' font-family='sans-serif' font-weight='bold' font-size='20' text-anchor='middle' dy='.3em'%3EXSOCIETY%3C/text%3E%3C/svg%3E`;
            }
        };

        // 2. FIX CHAPTER SORTING (Paksa urut numerik)
        if (data.data) {
            if (Array.isArray(data.data)) {
                // Kalau ini list manga
                data.data.forEach(m => resolveCover(m));
                
                // Cek apakah ini response feed chapter
                if (data.data.length > 0 && data.data[0].type === 'chapter') {
                    data.data.sort((a, b) => {
                        let numA = parseFloat(a.attributes.chapter) || 0;
                        let numB = parseFloat(b.attributes.chapter) || 0;
                        return numA - numB; // Ascending (Ch 1, 2, 3...)
                    });
                }
            } else {
                // Kalau single manga object
                resolveCover(data.data);
            }
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET');
        res.status(response.status).json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch' });
    }
}
