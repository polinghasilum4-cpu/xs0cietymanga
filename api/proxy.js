export default async function handler(req, res) {
    const { path } = req.query;
    if (!path) return res.status(400).json({ error: 'Missing path' });

    const MANGA_DEX_BASE = 'https://api.mangadex.org';
    const url = `${MANGA_DEX_BASE}${path}`;

    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'XSOCIETY-HUB/1.0 (contact: xs0cietyHUB)' }
        });
        let data = await response.json();

        // Resolve Cover Art jika ada relationships type 'cover_art'
        if (data.data) {
            const resolveCover = async (manga) => {
                const coverRel = manga.relationships?.find(r => r.type === 'cover_art');
                if (coverRel) {
                    if (coverRel.attributes && coverRel.attributes.fileName) {
                        manga.coverUrl = `https://uploads.mangadex.org/covers/${manga.id}/${coverRel.attributes.fileName}.512.jpg`;
                    } else if (coverRel.id) {
                        // Fetch detail cover jika hanya dapat ID
                        const cRes = await fetch(`${MANGA_DEX_BASE}/cover/${coverRel.id}`, {
                            headers: { 'User-Agent': 'XSOCIETY-HUB/1.0' }
                        });
                        const cData = await cRes.json();
                        if (cData.data && cData.data.attributes) {
                            manga.coverUrl = `https://uploads.mangadex.org/covers/${manga.id}/${cData.data.attributes.fileName}.512.jpg`;
                        }
                    }
                }
            };

            if (Array.isArray(data.data)) {
                await Promise.all(data.data.map(m => resolveCover(m)));
            } else {
                await resolveCover(data.data);
            }
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET');
        res.status(response.status).json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch' });
    }
}
