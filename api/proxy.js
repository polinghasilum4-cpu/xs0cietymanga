// Proxy khusus MangaDex: JSON API + gambar cover / halaman.
// Hanya host MangaDex yang boleh diakses (mencegah proxy dipakai untuk URL sembarang).

const ALLOWED_SUFFIXES = ['mangadex.org', 'mangadex.network'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function isAllowed(u) {
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    return ALLOWED_SUFFIXES.some(s => h === s || h.endsWith('.' + s));
}

async function fetchWithTimeout(url, opts = {}, ms = 8000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
        return await fetch(url, { ...opts, signal: ctrl.signal });
    } finally {
        clearTimeout(t);
    }
}

async function attachCover(m) {
    if (!m || !Array.isArray(m.relationships)) return;
    const rel = m.relationships.find(r => r.type === 'cover_art');
    if (!rel) return;
    let file = rel.attributes && rel.attributes.fileName;
    if (!file && rel.id) {
        try {
            const r = await fetchWithTimeout(`https://api.mangadex.org/cover/${rel.id}`, { headers: { 'User-Agent': UA } }, 5000);
            const j = await r.json();
            file = j.data && j.data.attributes && j.data.attributes.fileName;
        } catch (e) { /* abaikan, pakai fallback cover di client */ }
    }
    if (file) m.coverUrl = `https://uploads.mangadex.org/covers/${m.id}/${file}.512.jpg`;
}

export default async function handler(req, res) {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: 'Missing url' });

    let parsed;
    try { parsed = new URL(targetUrl); } catch { return res.status(400).json({ error: 'Invalid url' }); }
    if (!isAllowed(parsed)) return res.status(403).json({ error: 'Host not allowed' });

    try {
        const response = await fetchWithTimeout(parsed.toString(), {
            headers: {
                'User-Agent': UA,
                'Accept': 'application/json, image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                'Referer': 'https://mangadex.org/'
            }
        }, 9000);

        const contentType = response.headers.get('content-type') || '';

        if (!response.ok) {
            res.setHeader('Cache-Control', 'no-store');
            // teruskan status asli (mis. 429) supaya client bisa retry
            if (contentType.includes('application/json')) {
                return res.status(response.status).json(await response.json().catch(() => ({ error: response.statusText })));
            }
            return res.status(response.status).send(response.statusText);
        }

        if (contentType.startsWith('image/')) {
            const buffer = Buffer.from(await response.arrayBuffer());
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            return res.send(buffer);
        }

        if (contentType.includes('application/json')) {
            const data = await response.json();

            if (data && data.data) {
                if (Array.isArray(data.data)) {
                    if (data.data.length && data.data[0].type === 'manga') {
                        await Promise.all(data.data.map(attachCover));
                    }
                } else if (data.data.type === 'manga') {
                    await attachCover(data.data);
                }
            }

            // at-home/server tidak boleh di-cache lama (URL node berubah)
            const isAtHome = parsed.pathname.startsWith('/at-home/');
            res.setHeader('Cache-Control', isAtHome ? 'no-store' : 'public, s-maxage=120, stale-while-revalidate=600');
            return res.status(200).json(data);
        }

        return res.status(415).send('Unsupported content type');
    } catch (error) {
        const timeout = error && error.name === 'AbortError';
        return res.status(timeout ? 504 : 500).json({ error: timeout ? 'Upstream timeout' : error.message });
    }
}
