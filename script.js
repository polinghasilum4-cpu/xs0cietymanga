const PROXY = '/api/proxy';
const MDX = 'https://api.mangadex.org';
const PAGE_SIZE = 24;
const RATINGS = '&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica';

// Jenis karya -> originalLanguage MangaDex
const TYPE_LANGS = { all: [], manga: ['ja'], manhwa: ['ko'], manhua: ['zh', 'zh-hk'] };
const TYPE_LABEL = { ja: 'Manga', ko: 'Manhwa', zh: 'Manhua', 'zh-hk': 'Manhua' };
const STATUS_ID = { ongoing: 'Berjalan', completed: 'Tamat', hiatus: 'Hiatus', cancelled: 'Dibatalkan' };

let currentManga = null;
let chapterFeed = [];          // urut naik (kecil -> besar)
let currentChapterIndex = -1;
let chapterDesc = false;       // urutan tampilan daftar chapter
let currentType = 'all';
let popularOffset = 0;
let popularTotal = 0;
let currentLang = localStorage.getItem('lang') || 'any'; // any = semua bahasa (ID > EN > lainnya) | all = ID+EN | id | en
if (!['any', 'id', 'en', 'all'].includes(currentLang)) currentLang = 'any';

// token untuk membatalkan respon basi (user klik cepat / ganti bahasa)
let popularToken = 0, chapterToken = 0, readToken = 0, searchToken = 0;

const $ = (id) => document.getElementById(id);
const grid = $('mangaGrid');
const searchGrid = $('searchGrid');
const searchInputs = [$('searchInput'), $('searchInputMobile')].filter(Boolean);
const langSelect = $('langSelect');
const heroBg = $('heroBg');
const heroTitle = $('heroTitle');
const heroSynopsis = $('heroSynopsis');
const heroReadBtn = $('heroReadBtn');
const modal = $('modal');
const closeModal = $('closeModal');
const modalImg = $('modalImg');
const modalTitle = $('modalTitle');
const modalSynopsis = $('modalSynopsis');
const chapterList = $('chapterList');
const chapterCount = $('chapterCount');
const sortBtn = $('sortBtn');
const reader = $('reader');
const closeReader = $('closeReader');
const readerTitle = $('readerTitle');
const readerImages = $('readerImages');
const readerNext = $('readerNext');
const nextChapterBtn = $('nextChapterBtn');
const prevChapterBtn = $('prevChapterBtn');
const loadMoreBtn = $('loadMoreBtn');
const typeTabs = $('typeTabs');

const bgm = $('bgm');
const bgmToggle = $('bgmToggle');
const iconPlay = $('icon-play');
const iconPause = $('icon-pause');

const fallbackImg = 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="256" height="384"%3E%3Crect width="100%25" height="100%25" fill="%23141414"/%3E%3Ctext x="50%25" y="50%25" fill="%23e50914" font-family="sans-serif" font-weight="bold" font-size="24" text-anchor="middle" dy=".3em"%3EXSOCIETY%3C/text%3E%3C/svg%3E';

/* ---------- util ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const proxied = (url) => `${PROXY}?url=${encodeURIComponent(url)}`;
const getProxiedImage = (url) => url ? proxied(url) : fallbackImg;

// fetch JSON via proxy, dengan retry untuk 429 / 5xx
async function proxyFetch(endpoint, tries = 3) {
    let lastErr;
    for (let i = 0; i < tries; i++) {
        try {
            const r = await fetch(proxied(MDX + endpoint));
            if (r.ok) return await r.json();
            lastErr = new Error('HTTP ' + r.status);
            if (r.status !== 429 && r.status < 500) break;   // 4xx lain: jangan diulang
        } catch (e) { lastErr = e; }
        await sleep(600 * (i + 1));
    }
    throw lastErr || new Error('Request gagal');
}

const pickTitle = (m) => {
    const t = m.attributes.title || {};
    return t.en || t.id || Object.values(t)[0] || 'Untitled';
};
const pickDesc = (m) => {
    const d = m.attributes.description || {};
    return d.id || d.en || Object.values(d)[0] || 'Sinopsis tidak tersedia.';
};
const langList = () => currentLang === 'any' ? [] : currentLang === 'all' ? ['id', 'en'] : [currentLang];
const langQuery = (key) => langList().map(l => `&${key}[]=${l}`).join('');

/* ---------- BGM ---------- */
bgmToggle.onclick = async () => {
    try {
        if (bgm.paused) { await bgm.play(); iconPlay.style.display = 'none'; iconPause.style.display = 'block'; }
        else { bgm.pause(); iconPlay.style.display = 'block'; iconPause.style.display = 'none'; }
    } catch (e) { /* autoplay diblokir / sumber audio gagal */ }
};

/* ---------- bahasa ---------- */
langSelect.value = currentLang;
langSelect.addEventListener('change', (e) => {
    currentLang = e.target.value;
    localStorage.setItem('lang', currentLang);
    loadPopular(true);                                  // daftar ikut bahasa terpilih
    if (currentManga && modal.classList.contains('active')) loadChapters(currentManga.id);
});

/* ---------- tab Manga / Manhwa / Manhua ---------- */
typeTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-type]');
    if (!btn || btn.dataset.type === currentType) return;
    currentType = btn.dataset.type;
    typeTabs.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
    loadPopular(true);
});

/* ---------- daftar populer ---------- */
async function loadPopular(reset) {
    const token = ++popularToken;
    if (reset) {
        popularOffset = 0;
        grid.innerHTML = '<p class="muted-msg">Memuat...</p>';
        loadMoreBtn.style.display = 'none';
    }
    loadMoreBtn.disabled = true;

    const type = TYPE_LANGS[currentType].map(l => `&originalLanguage[]=${l}`).join('');
    const q = `/manga?limit=${PAGE_SIZE}&offset=${popularOffset}&includes[]=cover_art&order[followedCount]=desc`
        + RATINGS + langQuery('availableTranslatedLanguage') + type;

    try {
        const json = await proxyFetch(q);
        if (token !== popularToken) return;
        const list = json.data || [];
        popularTotal = json.total || 0;

        if (reset) {
            if (!list.length) { grid.innerHTML = '<p class="muted-msg">Belum ada judul untuk filter ini.</p>'; return; }
            setHero(list[0]);
            grid.innerHTML = '';
        }
        grid.insertAdjacentHTML('beforeend', cardsHtml(list));
        popularOffset += list.length;
        loadMoreBtn.style.display = (list.length && popularOffset < popularTotal && popularOffset < 9900) ? 'inline-flex' : 'none';
    } catch (e) {
        if (token !== popularToken) return;
        if (reset) grid.innerHTML = '<p class="muted-msg">Gagal memuat daftar. <a href="#" onclick="loadPopular(true);return false;">Coba lagi</a></p>';
    } finally {
        if (token === popularToken) loadMoreBtn.disabled = false;
    }
}
window.loadPopular = loadPopular;
loadMoreBtn.addEventListener('click', () => loadPopular(false));

function setHero(top) {
    heroBg.style.backgroundImage = top.coverUrl ? `url('${getProxiedImage(top.coverUrl)}')` : 'none';
    heroTitle.textContent = pickTitle(top);
    heroSynopsis.textContent = pickDesc(top);
    heroReadBtn.onclick = () => window._openManga(top.id);
}

function cardsHtml(list) {
    return list.map(m => {
        const title = esc(pickTitle(m));
        const kind = TYPE_LABEL[m.attributes.originalLanguage] || '';
        const status = STATUS_ID[m.attributes.status] || m.attributes.status || '';
        return `
            <div class="card" onclick="window._openManga('${esc(m.id)}')">
                <div class="img-wrapper">
                    ${kind ? `<span class="type-badge">${kind}</span>` : ''}
                    <img src="${getProxiedImage(m.coverUrl)}" alt="${title}" loading="lazy" onerror="this.onerror=null; this.src='${fallbackImg}'">
                </div>
                <div class="card-info">
                    <h4>${title}</h4>
                    <span>${esc(status)}</span>
                </div>
            </div>`;
    }).join('');
}

function renderGrid(list, container) { container.innerHTML = cardsHtml(list); }

/* ---------- detail judul ---------- */
window._openManga = async (id) => {
    try {
        const json = await proxyFetch(`/manga/${id}?includes[]=cover_art`);
        const manga = json.data;
        if (!manga) return;

        currentManga = manga;
        modalImg.onerror = function () { this.onerror = null; this.src = fallbackImg; };
        modalImg.src = getProxiedImage(manga.coverUrl);
        modalTitle.textContent = pickTitle(manga);
        modalSynopsis.textContent = pickDesc(manga);

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        loadChapters(id);
    } catch (e) {
        alert('Gagal membuka judul. Coba lagi.');
    }
};

/* ---------- chapter lengkap ---------- */
// ambil SEMUA halaman feed (limit API 500/halaman, total dibaca dari respon)
async function fetchAllChapters(mangaId) {
    const base = `/manga/${mangaId}/feed?limit=500&order[volume]=asc&order[chapter]=asc&includeFutureUpdates=0`
        + RATINGS + '&contentRating[]=pornographic' + langQuery('translatedLanguage');
    let offset = 0, all = [], total = Infinity;
    while (offset < total && offset < 9500) {              // batas API: offset+limit <= 10000
        const json = await proxyFetch(`${base}&offset=${offset}`);
        const data = json.data || [];
        total = json.total ?? (data.length < 500 ? offset + data.length : Infinity);
        if (!data.length) break;
        all = all.concat(data);
        offset += data.length;
    }
    return all;
}

// pilih versi terbaik kalau satu chapter diunggah beberapa grup / bahasa
function chapterScore(ch) {
    const a = ch.attributes;
    const readable = !a.externalUrl && (a.pages || 0) > 0;
    const langPref = a.translatedLanguage === 'id' ? 2 : a.translatedLanguage === 'en' ? 1 : 0;
    return [readable ? 1 : 0, langPref, a.pages || 0, Date.parse(a.publishAt) || 0];
}
function better(a, b) {
    const sa = chapterScore(a), sb = chapterScore(b);
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i] > sb[i];
    return false;
}

function buildChapterFeed(chaps) {
    const byNum = new Map();       // nomor chapter -> { volume -> chapter terbaik }
    const extras = [];             // chapter tanpa nomor (oneshot / special)

    chaps.forEach(ch => {
        const num = ch.attributes.chapter;
        if (num === null || num === undefined || num === '') { extras.push(ch); return; }
        const vol = ch.attributes.volume || '';
        if (!byNum.has(num)) byNum.set(num, new Map());
        const vols = byNum.get(num);
        if (!vols.has(vol) || better(ch, vols.get(vol))) vols.set(vol, ch);
    });

    const result = [];
    byNum.forEach((vols) => {
        const entries = [...vols.entries()];
        const named = entries.filter(([v]) => v !== '');
        if (named.length <= 1) {
            // satu volume (atau tidak ada info volume): ambil satu terbaik saja
            let best = null;
            entries.forEach(([, c]) => { if (!best || better(c, best)) best = c; });
            result.push(best);
        } else {
            // nomor sama di volume berbeda (season reset): pertahankan keduanya
            named.forEach(([, c]) => result.push(c));
        }
    });

    const num = (c) => parseFloat(c.attributes.chapter);
    result.sort((a, b) => (num(a) - num(b)) || ((parseFloat(a.attributes.volume) || 0) - (parseFloat(b.attributes.volume) || 0)));

    // oneshot dedup per id, taruh di akhir
    const seenTitle = new Set();
    extras.sort((a, b) => (Date.parse(a.attributes.publishAt) || 0) - (Date.parse(b.attributes.publishAt) || 0))
        .forEach(c => {
            const k = (c.attributes.title || '') + '|' + c.attributes.translatedLanguage;
            if (seenTitle.has(k)) return;
            seenTitle.add(k);
            result.push(c);
        });
    return result;
}

async function loadChapters(mangaId) {
    const token = ++chapterToken;
    chapterCount.textContent = '';
    chapterList.innerHTML = `<p class="muted-msg">Memuat semua chapter...</p>`;

    try {
        const chaps = await fetchAllChapters(mangaId);
        if (token !== chapterToken) return;
        chapterFeed = buildChapterFeed(chaps);
        renderChapterList();
    } catch (e) {
        if (token !== chapterToken) return;
        chapterFeed = [];
        chapterList.innerHTML = `<p class="muted-msg">Gagal memuat chapter. <a href="#" onclick="loadChapters('${esc(mangaId)}');return false;">Coba lagi</a></p>`;
    }
}
window.loadChapters = loadChapters;

function renderChapterList() {
    if (!chapterFeed.length) {
        const where = { any: '', all: ' ID/EN', id: ' ID', en: ' EN' }[currentLang];
        chapterCount.textContent = '';
        chapterList.innerHTML = `<p class="muted-msg">Chapter${where} belum tersedia.</p>`;
        return;
    }
    const readable = chapterFeed.filter(c => !c.attributes.externalUrl).length;
    chapterCount.textContent = `${chapterFeed.length} chapter · ${readable} bisa dibaca di sini`;
    const order = chapterFeed.map((_, i) => i);
    if (chapterDesc) order.reverse();

    chapterList.innerHTML = order.map(idx => {
        const a = chapterFeed[idx].attributes;
        const isExternal = !!a.externalUrl;
        const label = isExternal ? 'Hanya di situs resmi' : a.translatedLanguage.toUpperCase();
        const color = isExternal ? '#e50914' : '#888';
        const numText = (a.chapter !== null && a.chapter !== undefined && a.chapter !== '') ? `Ch. ${esc(a.chapter)}` : 'Oneshot';
        return `
            <button class="chapter-btn${isExternal ? ' disabled' : ''}" ${isExternal ? 'disabled' : `onclick="window._readChapter(${idx})"`}>
                <span>${numText}${a.title ? ' - ' + esc(a.title) : ''}</span>
                <span style="font-size:0.7rem; color:${color}; flex-shrink:0; margin-left:10px;">${esc(label)}</span>
            </button>`;
    }).join('');
}

sortBtn.addEventListener('click', () => {
    chapterDesc = !chapterDesc;
    sortBtn.textContent = chapterDesc ? 'Terbaru ↓' : 'Terlama ↑';
    renderChapterList();
});

/* ---------- reader ---------- */
function chapterLabel(ch) {
    const a = ch.attributes;
    const n = (a.chapter !== null && a.chapter !== undefined && a.chapter !== '') ? `Ch. ${a.chapter}` : 'Oneshot';
    return a.title ? `${n} - ${a.title}` : n;
}

const isReadable = (i) => chapterFeed[i] && !chapterFeed[i].attributes.externalUrl;
function adjacentReadable(from, dir) {
    for (let i = from + dir; i >= 0 && i < chapterFeed.length; i += dir) if (isReadable(i)) return i;
    return -1;
}

function updateReaderNav() {
    const prevIdx = adjacentReadable(currentChapterIndex, -1);
    const nextIdx = adjacentReadable(currentChapterIndex, 1);
    const hasPrev = prevIdx !== -1;
    const hasNext = nextIdx !== -1;
    prevChapterBtn.style.display = hasPrev ? 'inline-flex' : 'none';
    nextChapterBtn.style.display = hasNext ? 'inline-flex' : 'none';
    prevChapterBtn.onclick = () => window._readChapter(prevIdx);
    nextChapterBtn.onclick = () => window._readChapter(nextIdx);
    readerNext.style.display = (hasPrev || hasNext) ? 'flex' : 'none';
}

const readerMsg = (txt, retry) =>
    `<p style="color:#e50914; text-align:center; margin-top:50px; padding:20px; font-weight:bold;">${txt}${retry ? ` <a href="#" style="color:#fff" onclick="window._readChapter(${currentChapterIndex});return false;">Coba lagi</a>` : ''}</p>`;

window._readChapter = async (index) => {
    if (index < 0 || index >= chapterFeed.length) return;
    currentChapterIndex = index;
    const ch = chapterFeed[index];
    const token = ++readToken;

    // chapter eksternal tidak punya gambar di MangaDex -> tidak bisa dibaca di sini, tidak ada redirect
    if (ch.attributes.externalUrl) return;

    readerTitle.textContent = `${currentManga ? pickTitle(currentManga) : ''} — ${chapterLabel(ch)}`;
    readerImages.innerHTML = '<p style="color:white; text-align:center; margin-top:50px;">Memuat halaman...</p>';
    readerNext.style.display = 'none';
    reader.classList.add('active');
    modal.classList.remove('active');
    reader.scrollTop = 0;
    document.body.style.overflow = 'hidden';

    try {
        const json = await proxyFetch(`/at-home/server/${ch.id}`);
        if (token !== readToken) return;
        if (!json || !json.baseUrl || !json.chapter || !json.chapter.hash) {
            readerImages.innerHTML = readerMsg('Gambar chapter ini kosong. Silakan pilih chapter lain.');
            updateReaderNav();
            return;
        }

        const { baseUrl, chapter } = json;
        const useSaver = Array.isArray(chapter.dataSaver) && chapter.dataSaver.length > 0;
        const pages = useSaver ? chapter.dataSaver : chapter.data;
        const quality = useSaver ? 'data-saver' : 'data';
        if (!pages || !pages.length) {
            readerImages.innerHTML = readerMsg('Gambar tidak ditemukan.');
            updateReaderNav();
            return;
        }

        // muat langsung dari node MangaDex@Home (cepat, hemat kuota Vercel);
        // kalau gagal, otomatis dicoba lewat proxy
        readerImages.innerHTML = pages.map(p => {
            const raw = `${baseUrl}/${quality}/${chapter.hash}/${p}`;
            return `<img src="${esc(raw)}" data-raw="${esc(raw)}" alt="Halaman" loading="lazy">`;
        }).join('');
        updateReaderNav();
    } catch (err) {
        if (token !== readToken) return;
        readerImages.innerHTML = readerMsg('Gagal memuat gambar.', true);
    }
};

// fallback gambar halaman: direct -> proxy -> placeholder
readerImages.addEventListener('error', (e) => {
    const img = e.target;
    if (img.tagName !== 'IMG') return;
    if (!img.dataset.tried) {
        img.dataset.tried = '1';
        img.src = proxied(img.dataset.raw);
    } else if (img.dataset.tried === '1') {
        img.dataset.tried = '2';
        img.src = fallbackImg;
    }
}, true);

/* ---------- pencarian ---------- */
let searchTimeout;
function onSearchInput(e) {
    const q = e.target.value.trim();
    searchInputs.forEach(i => { if (i !== e.target) i.value = e.target.value; });   // sinkron desktop & mobile
    clearTimeout(searchTimeout);
    window.switchView('search', true);
    if (q.length < 2) { searchGrid.innerHTML = '<p class="muted-msg">Ketik minimal 2 huruf.</p>'; return; }

    searchTimeout = setTimeout(async () => {
        const token = ++searchToken;
        searchGrid.innerHTML = '<p class="muted-msg">Mencari...</p>';
        try {
            const json = await proxyFetch(`/manga?title=${encodeURIComponent(q)}&limit=30&includes[]=cover_art&order[relevance]=desc` + RATINGS);
            if (token !== searchToken) return;
            if (json.data && json.data.length) renderGrid(json.data, searchGrid);
            else searchGrid.innerHTML = '<p class="muted-msg">Tidak ada hasil.</p>';
        } catch (err) {
            if (token === searchToken) searchGrid.innerHTML = '<p class="muted-msg">Gagal mencari. Coba lagi.</p>';
        }
    }, 500);
}
searchInputs.forEach(i => i.addEventListener('input', onSearchInput));

/* ---------- navigasi ---------- */
window.switchView = (view, keepScroll) => {
    $('dashboardView').style.display = view === 'dashboard' ? 'block' : 'none';
    $('searchView').style.display = view === 'search' ? 'block' : 'none';
    $('devView').style.display = view === 'dev' ? 'block' : 'none';
    const btns = document.querySelectorAll('.nav-btn');
    btns.forEach(b => b.classList.remove('active'));
    const i = { dashboard: 0, search: 1, dev: 2 }[view];
    if (btns[i]) btns[i].classList.add('active');
    if (!keepScroll) window.scrollTo(0, 0);
    if (view === 'search' && !keepScroll && searchInputs[1]) searchInputs[1].focus();
};

closeModal.onclick = () => { modal.classList.remove('active'); document.body.style.overflow = ''; };
closeReader.onclick = () => {
    reader.classList.remove('active');
    readerImages.innerHTML = '';
    // balik ke daftar chapter supaya bisa lanjut pilih chapter lain
    if (currentManga) { modal.classList.add('active'); document.body.style.overflow = 'hidden'; }
    else document.body.style.overflow = '';
};
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal.onclick(); });

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (reader.classList.contains('active')) closeReader.onclick();
        else if (modal.classList.contains('active')) closeModal.onclick();
        return;
    }
    if (!reader.classList.contains('active')) return;
    if (e.key === 'ArrowRight') { const n = adjacentReadable(currentChapterIndex, 1); if (n !== -1) window._readChapter(n); }
    if (e.key === 'ArrowLeft') { const n = adjacentReadable(currentChapterIndex, -1); if (n !== -1) window._readChapter(n); }
});

loadPopular(true);
