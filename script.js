const PROXY = '/api/proxy';
const MDX = 'https://api.mangadex.org';

let currentManga = null;
let chapterFeed = []; 
let currentChapterIndex = -1;

const grid = document.getElementById('mangaGrid');
const searchGrid = document.getElementById('searchGrid');
const searchInput = document.getElementById('searchInput');
const heroBg = document.getElementById('heroBg');
const heroTitle = document.getElementById('heroTitle');
const heroSynopsis = document.getElementById('heroSynopsis');
const heroReadBtn = document.getElementById('heroReadBtn');
const modal = document.getElementById('modal');
const closeModal = document.getElementById('closeModal');
const modalImg = document.getElementById('modalImg');
const modalTitle = document.getElementById('modalTitle');
const modalSynopsis = document.getElementById('modalSynopsis');
const chapterList = document.getElementById('chapterList');
const reader = document.getElementById('reader');
const closeReader = document.getElementById('closeReader');
const readerImages = document.getElementById('readerImages');
const readerNext = document.getElementById('readerNext');
const nextChapterBtn = document.getElementById('nextChapterBtn');

const fallbackImg = 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="256" height="384"%3E%3Crect width="100%25" height="100%25" fill="%23141414"/%3E%3Ctext x="50%25" y="50%25" fill="%23e50914" font-family="sans-serif" font-weight="bold" font-size="24" text-anchor="middle" dy=".3em"%3EXSOCIETY%3C/text%3E%3C/svg%3E';
const proxyFetch = (endpoint) => fetch(`${PROXY}?url=${encodeURIComponent(MDX + endpoint)}`).then(r => r.json());
const getProxiedImage = (url) => url ? `${PROXY}?url=${encodeURIComponent(url)}` : fallbackImg;

async function loadPopular() {
    grid.innerHTML = '<p style="color:#888; padding:20px;">Memuat...</p>';
    const json = await proxyFetch('/manga?limit=12&includes[]=cover_art&order[followedCount]=desc');
    const list = json.data || [];
    
    if (list.length > 0) {
        const top = list[0];
        heroBg.style.backgroundImage = `url('${getProxiedImage(top.coverUrl)}')`;
        heroTitle.textContent = top.attributes.title.en || Object.values(top.attributes.title)[0] || 'Untitled';
        heroSynopsis.textContent = top.attributes.description?.en || 'Sinopsis tidak tersedia.';
        heroReadBtn.onclick = () => window._openManga(top.id);
        renderGrid(list, grid);
    }
}

function renderGrid(list, container) {
    container.innerHTML = list.map(m => {
        const title = m.attributes.title.en || Object.values(m.attributes.title)[0] || 'Untitled';
        return `
            <div class="card" onclick="window._openManga('${m.id}')">
                <div class="img-wrapper">
                    <img src="${getProxiedImage(m.coverUrl)}" alt="${title}" loading="lazy" onerror="this.onerror=null; this.src='${fallbackImg}'">
                </div>
                <div class="card-info">
                    <h4>${title}</h4>
                    <span>${m.attributes.status || 'Unknown'}</span>
                </div>
            </div>
        `;
    }).join('');
}

window._openManga = async (id) => {
    const json = await proxyFetch(`/manga/${id}?includes[]=cover_art`);
    const manga = json.data;
    if (!manga) return;
    
    currentManga = manga;
    modalImg.src = getProxiedImage(manga.coverUrl);
    modalImg.onerror = function() { this.onerror=null; this.src = fallbackImg; };
    modalTitle.textContent = manga.attributes.title.en || Object.values(manga.attributes.title)[0] || 'Untitled';
    modalSynopsis.textContent = manga.attributes.description?.en || 'Sinopsis tidak tersedia.';
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    loadChapters(id);
};

// FUNGSI PAGINATION: NGAMBIL SEMUA CHAPTER SAMPAI HABIS
async function fetchAllChapters(mangaId, lang) {
    let offset = 0;
    let allData = [];
    let hasMore = true;
    
    while (hasMore) {
        const json = await proxyFetch(`/manga/${mangaId}/feed?limit=500&offset=${offset}&translatedLanguage[]=${lang}`);
        if (json.data && json.data.length > 0) {
            allData = allData.concat(json.data);
            offset += 500;
            if (json.data.length < 500) hasMore = false;
        } else {
            hasMore = false;
        }
    }
    return allData;
}

async function loadChapters(mangaId) {
    chapterList.innerHTML = '<p style="color:#888; padding:10px;">Memuat chapter (mohon tunggu)...</p>';
    
    // Tarik semua data ID & EN (dengan pagination)
    const [idChaps, enChaps] = await Promise.all([
        fetchAllChapters(mangaId, 'id'),
        fetchAllChapters(mangaId, 'en')
    ]);
    
    let rawChapters = [...idChaps, ...enChaps];
    let uniqueChapters = {};
    
    // Gabungin biar ga duplikat, prioritas ID
    rawChapters.forEach(ch => {
        let num = ch.attributes.chapter;
        if (!num) return;
        if (!uniqueChapters[num] || ch.attributes.translatedLanguage === 'id') {
            uniqueChapters[num] = ch;
        }
    });

    // Sortir pakai desimal (1, 2, 10, 10.5, 11)
    chapterFeed = Object.values(uniqueChapters).sort((a, b) => {
        let numA = parseFloat(a.attributes.chapter);
        let numB = parseFloat(b.attributes.chapter);
        if (isNaN(numA)) numA = 999999;
        if (isNaN(numB)) numB = 999999;
        return numA - numB;
    });

    if (chapterFeed.length > 0) {
        chapterList.innerHTML = chapterFeed.map((ch, idx) => `
            <button class="chapter-btn" onclick="window._readChapter(${idx})">
                Ch. ${ch.attributes.chapter} ${ch.attributes.title ? '- ' + ch.attributes.title : ''} 
                <span style="font-size:0.7rem; color:#888;">(${ch.attributes.translatedLanguage.toUpperCase()})</span>
            </button>
        `).join('');
    } else {
        chapterList.innerHTML = '<p style="color:#888; padding:10px;">Chapter belum tersedia.</p>';
    }
}

window._readChapter = async (index) => {
    if (index < 0 || index >= chapterFeed.length) return;
    currentChapterIndex = index;
    const ch = chapterFeed[index];
    
    readerImages.innerHTML = '<p style="color:white; text-align:center; margin-top:50px;">Memuat halaman...</p>';
    readerNext.style.display = 'none';
    reader.classList.add('active');
    modal.classList.remove('active');
    reader.scrollTop = 0;
    
    const json = await proxyFetch(`/at-home/server/${ch.id}`);
    const baseUrl = json.baseUrl;
    const hash = json.chapter.hash;
    
    // FIX LEMOT: Pakai Data Saver (Gambar kompresi, load 5x lebih cepat)
    const pages = json.chapter.dataSaver || json.chapter.data;
    const qualityPath = json.chapter.dataSaver ? 'data-saver' : 'data';
    
    readerImages.innerHTML = pages.map(page => {
        const rawUrl = `${baseUrl}/${qualityPath}/${hash}/${page}`;
        const proxiedUrl = `${PROXY}?url=${encodeURIComponent(rawUrl)}`;
        // Tambahkan loading="lazy" biar gambar ke-10 ga nge-block gambar ke-1
        return `<img src="${proxiedUrl}" alt="Page" loading="lazy">`;
    }).join('');
    
    if (currentChapterIndex < chapterFeed.length - 1) {
        readerNext.style.display = 'flex';
        nextChapterBtn.onclick = () => window._readChapter(currentChapterIndex + 1);
    }
};

window.addEventListener('scroll', () => {
    if (!reader.classList.contains('active')) return;
    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 100) {
        if (currentChapterIndex < chapterFeed.length - 1) readerNext.style.display = 'flex';
    }
});

let searchTimeout;
searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const q = e.target.value.trim();
    if (q.length < 3) return;
    searchTimeout = setTimeout(async () => {
        searchGrid.innerHTML = '<p style="color:#888;">Mencari...</p>';
        const json = await proxyFetch(`/manga?title=${encodeURIComponent(q)}&limit=20&includes[]=cover_art`);
        if (json.data) renderGrid(json.data, searchGrid);
    }, 600);
});

window.switchView = (view) => {
    document.getElementById('dashboardView').style.display = view === 'dashboard' ? 'block' : 'none';
    document.getElementById('searchView').style.display = view === 'search' ? 'block' : 'none';
    document.getElementById('devView').style.display = view === 'dev' ? 'block' : 'none';
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    if (view === 'dashboard') document.querySelectorAll('.nav-btn')[0].classList.add('active');
    if (view === 'search') document.querySelectorAll('.nav-btn')[1].classList.add('active');
    if (view === 'dev') document.querySelectorAll('.nav-btn')[2].classList.add('active');
    window.scrollTo(0, 0);
};

closeModal.onclick = () => { modal.classList.remove('active'); document.body.style.overflow = ''; };
closeReader.onclick = () => { reader.classList.remove('active'); document.body.style.overflow = ''; };
loadPopular();
