export default async function handler(req, res) {
    // Menerima URL target utuh (encoded) dari frontend
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: 'Missing url' });

    try {
        const response = await fetch(targetUrl, {
            headers: { 'User-Agent': 'XSOCIETY-HUB/1.0' }
        });
        let data = await response.json();

        // 1. SUNTIK COVER URL & SORTIR CHAPTER
        if (data && data.data) {
            const processManga = (m) => {
                if (!m.relationships) return;
                const coverRel = m.relationships.find(r => r.type === 'cover_art');
                if (coverRel && coverRel.attributes && coverRel.attributes.fileName) {
                    m.coverUrl = `https://uploads.mangadex.org/covers/${m.id}/${coverRel.attributes.fileName}.512.jpg`;
                }
            };

            if (Array.isArray(data.data)) {
                data.data.forEach(processManga);
                
                // Paksa urutkan chapter dari kecil ke besar (Ch 1, 2, 3...)
                if (data.data.length > 0 && data.data[0].type === 'chapter') {
                    data.data.sort((a, b) => {
                        let numA = parseFloat(a.attributes.chapter) || 0;
                        let numB = parseFloat(b.attributes.chapter) || 0;
                        return numA - numB;
                    });
                }
            } else {
                processManga(data.data);
            }
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET');
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch from MangaDex' });
    }
}
