export default async function handler(req, res) {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: 'Missing url' });

    try {
        const response = await fetch(targetUrl, {
            headers: { 'User-Agent': 'XSOCIETY-HUB/1.0' }
        });
        let data = await response.json();

        if (data && data.data) {
            const processManga = async (m) => {
                if (!m.relationships) return;
                const coverRel = m.relationships.find(r => r.type === 'cover_art');
                if (coverRel) {
                    if (coverRel.attributes && coverRel.attributes.fileName) {
                        m.coverUrl = `https://uploads.mangadex.org/covers/${m.id}/${coverRel.attributes.fileName}.512.jpg`;
                    } else if (coverRel.id) {
                        try {
                            const cRes = await fetch(`https://api.mangadex.org/cover/${coverRel.id}`);
                            const cJson = await cRes.json();
                            if (cJson.data && cJson.data.attributes) {
                                m.coverUrl = `https://uploads.mangadex.org/covers/${m.id}/${cJson.data.attributes.fileName}.512.jpg`;
                            }
                        } catch (e) {}
                    }
                }
            };

            if (Array.isArray(data.data)) {
                await Promise.all(data.data.map(processManga));
                
                // Sortir Chapter Angka (Biar 1, 2, 3 bukan 10, 2)
                if (data.data.length > 0 && data.data[0].type === 'chapter') {
                    data.data.sort((a, b) => {
                        let numA = parseFloat(a.attributes.chapter);
                        let numB = parseFloat(b.attributes.chapter);
                        if (isNaN(numA)) numA = 9999;
                        if (isNaN(numB)) numB = 9999;
                        return numA - numB;
                    });
                }
            } else {
                await processManga(data.data);
            }
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
