export default async function handler(req, res) {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing url' });
    try {
        const response = await fetch(url, { headers: { 'User-Agent': 'XSOCIETY-HUB/1.0' } });
        let data = await response.json();

        // Format Cover & Sort Chapters
        if (data && data.data) {
            const processManga = (m) => {
                if (!m.relationships) return;
                const cover = m.relationships.find(r => r.type === 'cover_art');
                if (cover && cover.attributes && cover.attributes.fileName) {
                    m.coverUrl = `https://uploads.mangadex.org/covers/${m.id}/${cover.attributes.fileName}.512.jpg`;
                }
            };

            if (Array.isArray(data.data)) {
                data.data.forEach(processManga);
                // Sort chapters specifically for chapter feeds
                if (data.data.length > 0 && data.data[0].type === 'chapter') {
                    data.data.sort((a, b) => {
                        const numA = parseFloat(a.attributes.chapter) || 0;
                        const numB = parseFloat(b.attributes.chapter) || 0;
                        return numA - numB;
                    });
                }
            } else {
                processManga(data.data);
            }
        }
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(200).json(data);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
