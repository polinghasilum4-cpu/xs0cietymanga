const PROXY = '/api/proxy';
let currentLang = localStorage.getItem('lang') || 'id';
let currentManga = null;
let chapterFeed = []; // Simpan list chapter buat Next
let currentChapterIndex = -1;

// DOM
const grid = document.getElementById('mangaGrid');
const searchGrid = document.getElementById('searchGrid');
const searchInput = document.getElementById('searchInput');
const langSelect = document.getElementById('langSelect');
const heroBg = document.getElementById('heroBg');
const heroTitle = document.getElementById('heroTitle');
const heroSynopsis = document.getElementById('heroSynopsis');
const heroReadBtn = document.getElementById('heroReadBtn');
const navbarTop = document.getElementById('navbarTop');

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
const readerNext = document.getElementById('readerNext');
const nextChapterBtn = document.getElementById('nextChapterBtn');

// 1. Set Bahasa
langSelect.value = currentLang;
langSelect.addEventListener('change', (e) => {
    currentLang = e.target.value;
    localStorage.setItem('lang', currentLang);
    loadPopular();
    if(currentManga) loadChapters(currentManga.id); // Reload chapter if modal open
});

// 2. Load Popular
async function loadPopular() {
    grid.innerHTML = '<p style="color:#888; padding:20px;">Memuat data...</p>';
    try {
        const res = await fetch(`${PROXY}?path=/manga?limit=12&includes[]=cover_art&order[followedCount]=desc`);
        const json = await res.json();
        const list = json.data || [];
        
        if (list.length > 0) {
            const top = list[0];
            heroBg.style.backgroundImage = `url('${top.coverUrl || ''}')`;
            heroTitle.textContent = top.attributes.title.en || Object.values(top.attributes.title)[0] || 'Untitled';
            heroSynopsis.textContent = top.attributes.description?.en || 'Sinopsis tidak tersedia.';
            heroReadBtn.onclick = () => openModal(top);
            renderGrid(list, grid);
        }
    } catch (err) {
        grid.innerHTML = '<p style="color:#888; padding:20px;">Gagal memuat data.</p>';
    }
}

// 3. Render Grid
function renderGrid(list, container) {
    container.innerHTML = list.map(m => {
        const title = m.attributes.title.en || Object.values(m.attributes.title)[0] || 'Untitled';
        const cover = m.coverUrl || 'https://via.placeholder.com/256x384/141414/e50914?text=No+Cover';
        return `
            <div class="card" onclick="window._openManga('${m.id}')">
                <img src="${cover}" alt="${title}" loading="lazy">
                <div class="card-info">
                    <h4>${title}</h4>
                    <span>${m.attributes.status || 'Unknown'}</span>
                </div>
            </div>
        `;
    }).join('');
}

// 4. Open Modal
window._openManga = async (id) => {
    try {
        const res = await fetch(`${PROXY}?path=/manga/${id}?includes[]=cover_art`);
        const json = await res.json();
        const manga = json.data;
        if (!manga) return;
        
        currentManga = manga;
        modalImg.src = manga.coverUrl || 'https://via.placeholder.com/256x384/141414/e50914?text=No+Cover';
        modalTitle.textContent = manga.attributes.title.en || Object.values(manga.attributes.title)[0] || 'Untitled';
        modalSynopsis.textContent = manga.attributes.description?.en || 'Sinopsis tidak tersedia.';
        
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        loadChapters(id);
    } catch (err) {
        console.error(err);
    }
};

// 5. Load Chapters (Filter by Language)
async function loadChapters(mangaId) {
    chapterList.innerHTML = '<p style="color:#888; padding:10px;">Memuat chapter...</p>';
    try {
        const res = await fetch(`${PROXY}?path=/manga/${mangaId}/feed?limit=100&translatedLanguage[]=${currentLang}&order[chapter]=desc`);
        const json = await res.json();
        chapterFeed = json.data || [];
        
        if (chapterFeed.length > 0) {
            chapterList.innerHTML = chapterFeed.map((ch, idx) => `
                <button class="chapter-btn" onclick="window._readChapter(${idx})">
                    Ch. ${ch.attributes.chapter || '?'} ${ch.attributes.title ? '- ' + ch.attributes.title : ''}
                </button>
            `).join('');
        } else {
            chapterList.innerHTML = `<p style="color:#888; padding:10px;">Chapter bahasa ${currentLang.toUpperCase()} belum tersedia.</p>`;
        }
    } catch (err) {
        chapterList.innerHTML = '<p style="color:#888; padding:10px;">Gagal memuat chapter.</p>';
    }
}

// 6. Read Chapter & Handle Next
window._readChapter = async (index) => {
    if (index < 0 || index >= chapterFeed.length) return;
    currentChapterIndex = index;
    const ch = chapterFeed[index];
    
    readerImages.innerHTML = '<p style="color:white; text-align:center; margin-top:50px;">Memuat halaman...</p>';
    readerNext.style.display = 'none';
    reader.classList.add('active');
    modal.classList.remove('active');
    reader.scrollTop = 0;
    
    try {
        const res = await fetch(`${PROXY}?path=/at-home/server/${ch.id}`);
        const json = await res.json();
        const baseUrl = json.baseUrl;
        const hash = json.chapter.hash;
        const pages = json.chapter.data;
        
        readerImages.innerHTML = pages.map(page => 
            `<img src="${baseUrl}/data/${hash}/${page}" alt="Page" loading="lazy">`
        ).join('');
        
        // Tampilkan tombol Next kalau bukan chapter terakhir
        if (currentChapterIndex < chapterFeed.length - 1) {
            readerNext.style.display = 'flex';
            nextChapterBtn.onclick = () => window._readChapter(currentChapterIndex + 1);
        } else {
            readerNext.style.display = 'none';
        }
        
        // Detect scroll abis di paling bawah
        window.addEventListener('scroll', handleScrollEnd);
    } catch (err) {
        readerImages.innerHTML = '<p style="color:red; text-align:center; margin-top:50px;">Gagal memuat gambar.</p>';
    }
};

// Deteksi scroll abis
let scrollTimeout;
function handleScrollEnd() {
    if (!reader.classList.contains('active')) return;
    const scrollPos = window.innerHeight + window.scrollY;
    const bodyHeight = document.body.offsetHeight;
    
    if (scrollPos >= bodyHeight - 100) {
        if (currentChapterIndex < chapterFeed.length - 1) {
            readerNext.style.display = 'flex';
        }
    }
}

// 7. Search
let searchTimeout;
searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const q = e.target.value.trim();
    if (q.length < 3) return;
    
    searchTimeout = setTimeout(async () => {
        searchGrid.innerHTML = '<p style="color:#888;">Mencari...</p>';
        try {
            const res = await fetch(`${PROXY}?path=/manga?title=${encodeURIComponent(q)}&limit=20&includes[]=cover_art`);
            const json = await res.json();
            if (json.data) renderGrid(json.data, searchGrid);
        } catch (err) {
            searchGrid.innerHTML = '<p style="color:#888;">Gagal mencari.</p>';
        }
    }, 600);
});

// 8. Navigation Logic
window.switchView = (view) => {
    document.getElementById('dashboardView').style.display = view === 'dashboard' ? 'block' : 'none';
    document.getElementById('searchView').style.display = view === 'search' ? 'block' : 'none';
    document.getElementById('devView').style.display = view === 'dev' ? 'block' : 'none';
    
    // Update active button
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    if (view === 'dashboard') document.querySelectorAll('.nav-btn')[0].classList.add('active');
    if (view === 'search') document.querySelectorAll('.nav-btn')[1].classList.add('active');
    if (view === 'dev') document.querySelectorAll('.nav-btn')[2].classList.add('active');
    
    window.scrollTo(0, 0);
};

// 9. Scroll Navbar Effect
window.addEventListener('scroll', () => {
    if (window.scrollY > 50) navbarTop.classList.add('scrolled');
    else navbarTop.classList.remove('scrolled');
});

// Close Handlers
closeModal.onclick = () => { modal.classList.remove('active'); document.body.style.overflow = ''; };
closeReader.onclick = () => { 
    reader.classList.remove('active'); 
    document.body.style.overflow = ''; 
    window.removeEventListener('scroll', handleScrollEnd);
};
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal.onclick(); });

// Init
loadPopular();
