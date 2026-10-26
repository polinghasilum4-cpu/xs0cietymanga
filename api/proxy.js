export default async function handler(req, res) {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: 'Missing url' });

    try {
        const response = await fetch(targetUrl, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Referer': 'https://mangadex.org/'
            }
        });
        
        if (!response.ok) return res.status(response.status).send(response.statusText);

        const contentType = response.headers.get('content-type');

        if (contentType && contentType.startsWith('image/')) {
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            return res.send(buffer);
        }

        if (contentType && contentType.includes('application/json')) {
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
                    if (data.data.length > 0 && data.data[0].type === 'chapter') {
                        data.data.sort((a, b) => {
                            let numA = parseFloat(a.attributes.chapter);
                            let numB = parseFloat(b.attributes.chapter);
                            if (isNaN(numA)) numA = 999999;
                            if (isNaN(numB)) numB = 999999;
                            return numA - numB;
                        });
                    }
                } else {
                    await processManga(data.data);
                }
            }

            res.setHeader('Access-Control-Allow-Origin', '*');
            return res.status(200).json(data);
        }

        return res.status(400).send('Unsupported content type');
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
