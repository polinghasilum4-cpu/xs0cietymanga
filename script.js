const PROXY = '/api/manga';

// DOM
const grid = document.getElementById('mangaGrid');
const heroBg = document.getElementById('heroBg');
const heroTitle = document.getElementById('heroTitle');
const heroSynopsis = document.getElementById('heroSynopsis');
const heroReadBtn = document.getElementById('heroReadBtn');
const searchInput = document.getElementById('searchInput');
const navbar = document.getElementById('navbar');

// Modal
const modal = document.getElementById('modal');
const closeModal = document.getElementById('closeModal');
const modalImg = document.getElementById('modalImg');
const modalTitle = document.getElementById('modalTitle');
const modalSynopsis = document.getElementById('modalSynopsis');
const chapterList = document.getElementById('chapterList');

// Reader
const reader = document.getElementById('reader');
const closeReader = document.getElementById('closeReader');
const readerImages = document.getElementById('readerImages');

let currentManga = null;

// Helper: Ambil gambar dari MangaDex
function getCoverUrl(manga) {
    const cover = manga.relationships?.find(r => r.type === 'cover_art');
    if (cover && cover.attributes?.fileName) {
        return `https://uploads.mangadex.org/covers/${manga.id}/${cover.attributes.fileName}.256.jpg`;
    }
    return 'https://via.placeholder.com/256x384/141414/e50914?text=No+Cover';
}

// 1. Load Populer
async function loadPopular() {
    try {
        const res = await fetch(`${PROXY}?path=/manga?limit=10&includes[]=cover_art&order[followedCount]=desc`);
        const json = await res.json();
        const mangaList = json.data || [];
        
        if (mangaList.length > 0) {
            // Set Hero
            const top = mangaList[0];
            heroBg.style.backgroundImage = `url('${getCoverUrl(top)}')`;
            heroTitle.textContent = top.attributes.title.en || Object.values(top.attributes.title)[0] || 'Untitled';
            heroSynopsis.textContent = top.attributes.description?.en || 'Sinopsis tidak tersedia.';
            heroReadBtn.onclick = () => openModal(top);
            
            // Render Grid
            renderGrid(mangaList);
        }
    } catch (err) {
        console.error('Error:', err);
        grid.innerHTML = '<p style="color:#888;">Gagal memuat data. Pastikan server Vercel lo jalan.</p>';
    }
}

// 2. Render Grid
function renderGrid(list) {
    grid.innerHTML = list.map(m => {
        const title = m.attributes.title.en || Object.values(m.attributes.title)[0] || 'Untitled';
        return `
            <div class="card" onclick="window._openManga('${m.id}')">
                <img src="${getCoverUrl(m)}" alt="${title}" loading="lazy">
                <div class="card-info">
                    <h4>${title}</h4>
                    <span>${m.attributes.status || 'Unknown'}</span>
                </div>
            </div>
        `;
    }).join('');
}

// 3. Open Modal & Load Chapter
window._openManga = async (id) => {
    try {
        const res = await fetch(`${PROXY}?path=/manga/${id}?includes[]=cover_art`);
        const json = await res.json();
        const manga = json.data;
        if (!manga) return;
        
        currentManga = manga;
        const title = manga.attributes.title.en || Object.values(manga.attributes.title)[0] || 'Untitled';
        
        modalImg.src = getCoverUrl(manga);
        modalTitle.textContent = title;
        modalSynopsis.textContent = manga.attributes.description?.en || 'Sinopsis tidak tersedia.';
        
        // Load Chapter
        chapterList.innerHTML = '<p style="color:#888;">Memuat chapter...</p>';
        const chapRes = await fetch(`${PROXY}?path=/manga/${id}/feed?limit=100&translatedLanguage[]=en&order[chapter]=desc`);
        const chapJson = await chapRes.json();
        
        if (chapJson.data && chapJson.data.length > 0) {
            chapterList.innerHTML = chapJson.data.map(ch => `
                <button class="chapter-btn" onclick="window._readChapter('${ch.id}')">
                    Chapter ${ch.attributes.chapter || '?'} ${ch.attributes.title ? '- ' + ch.attributes.title : ''}
                </button>
            `).join('');
        } else {
            chapterList.innerHTML = '<p style="color:#888;">Chapter belum tersedia.</p>';
        }
        
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    } catch (err) {
        console.error(err);
    }
};

// 4. Read Chapter (Gambar)
window._readChapter = async (chapterId) => {
    readerImages.innerHTML = '<p style="color:white; text-align:center;">Memuat halaman...</p>';
    reader.classList.add('active');
    modal.classList.remove('active');
    
    try {
        const res = await fetch(`${PROXY}?path=/at-home/server/${chapterId}`);
        const json = await res.json();
        
        const baseUrl = json.baseUrl;
        const hash = json.chapter.hash;
        const pages = json.chapter.data; // array filenames
        
        readerImages.innerHTML = pages.map(page => 
            `<img src="${baseUrl}/data/${hash}/${page}" alt="Page" loading="lazy">`
        ).join('');
    } catch (err) {
        readerImages.innerHTML = '<p style="color:red; text-align:center;">Gagal memuat gambar chapter.</p>';
    }
};

// 5. Search
let timeout;
searchInput.addEventListener('input', (e) => {
    clearTimeout(timeout);
    const q = e.target.value.trim();
    if (q.length < 3) return;
    
    timeout = setTimeout(async () => {
        grid.innerHTML = '<p style="color:#888;">Mencari...</p>';
        try {
            const res = await fetch(`${PROXY}?path=/manga?title=${encodeURIComponent(q)}&limit=20&includes[]=cover_art`);
            const json = await res.json();
            if (json.data) renderGrid(json.data);
        } catch (err) {
            grid.innerHTML = '<p style="color:#888;">Gagal mencari.</p>';
        }
    }, 600);
});

// 6. Navbar Scroll
window.addEventListener('scroll', () => {
    if (window.scrollY > 50) navbar.classList.add('scrolled');
    else navbar.classList.remove('scrolled');
});

// Close Handlers
closeModal.onclick = () => { modal.classList.remove('active'); document.body.style.overflow = ''; };
closeReader.onclick = () => { reader.classList.remove('active'); document.body.style.overflow = ''; };
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal.onclick(); });

// Init
loadPopular();
