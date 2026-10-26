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
                    // Jika API ngasih fileName langsung
                    if (coverRel.attributes && coverRel.attributes.fileName) {
                        m.coverUrl = `https://uploads.mangadex.org/covers/${m.id}/${coverRel.attributes.fileName}.512.jpg`;
                    } 
                    // Jika cuma ngasih ID, kita fetch manual (Jaminan 100% muncul)
                    else if (coverRel.id) {
                        const cRes = await fetch(`https://api.mangadex.org/cover/${coverRel.id}`);
                        const cJson = await cRes.json();
                        if (cJson.data && cJson.data.attributes) {
                            m.coverUrl = `https://uploads.mangadex.org/covers/${m.id}/${cJson.data.attributes.fileName}.512.jpg`;
                        }
                    }
                }
            };

            if (Array.isArray(data.data)) {
                await Promise.all(data.data.map(processManga));
                
                // JIKA INI LIST CHAPTER, SORTIR BERDASARKAN ANGKA
                if (data.data.length > 0 && data.data[0].type === 'chapter') {
                    data.data.sort((a, b) => {
                        let numA = parseFloat(a.attributes.chapter) || 0;
                        let numB = parseFloat(b.attributes.chapter) || 0;
                        return numA - numB; // 1, 2, 3, 4...
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
