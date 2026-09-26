/**
 * NekoManga - Biblioteca
 *
 * Pinta el header/footer (Components), carga data/data.json y arma la
 * grilla de la biblioteca con búsqueda, filtros por género/estado,
 * orden y paginación — todo en el cliente, sin llamadas extra al
 * servidor por cada interacción.
 *
 * Los favoritos ("Guardar en mi biblioteca") se guardan en
 * localStorage para que el botón sirva incluso sin cuenta. Si más
 * adelante quieres que viajen con el usuario, es el único lugar
 * (getBookmarks/setBookmarks) que habría que conectar a Supabase.
 */

document.addEventListener('DOMContentLoaded', async () => {

  const headerPlaceholder = document.getElementById('header-placeholder');
  const footerPlaceholder = document.getElementById('footer-placeholder');
  if (headerPlaceholder && window.Components) headerPlaceholder.innerHTML = Components.renderHeader();
  if (footerPlaceholder && window.Components) footerPlaceholder.innerHTML = Components.renderFooter();

  const PAGE_SIZE = 12;
  const BOOKMARKS_KEY = 'nekomanga_bookmarks';

  const els = {
    grid: document.getElementById('biblioGrid'),
    empty: document.getElementById('biblioEmpty'),
    count: document.getElementById('biblioCount'),
    search: document.getElementById('biblioSearch'),
    genre: document.getElementById('filterGenre'),
    status: document.getElementById('filterStatus'),
    sort: document.getElementById('filterSort'),
    pagination: document.getElementById('biblioPagination'),
  };

  if (!els.grid) return;

  let library = [];
  let filtered = [];
  let currentPage = 1;

  // ---------- Helpers de imagen (misma idea que main.js) ----------
  function placeholderDataUri(text, color) {
    const initial = (text || '?').trim().charAt(0).toUpperCase();
    const bg = color || '#1a1822';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="560">
      <rect width="100%" height="100%" fill="${bg}"/>
      <text x="50%" y="50%" fill="#ffffff" font-family="sans-serif" font-size="160"
            font-weight="700" text-anchor="middle" dominant-baseline="central">${initial}</text>
    </svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  function imgWithFallback(src, alt, extraAttrs) {
    const fallback = placeholderDataUri(alt).replace(/'/g, '%27');
    return `<img src="${src}" alt="${alt}" ${extraAttrs || ''} onerror="this.onerror=null;this.src='${fallback}';">`;
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ---------- Favoritos (localStorage) ----------
  function getBookmarks() {
    try {
      return JSON.parse(localStorage.getItem(BOOKMARKS_KEY)) || [];
    } catch {
      return [];
    }
  }

  function setBookmarks(arr) {
    try {
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(arr));
    } catch {
      /* localStorage no disponible (modo privado, etc.) — se ignora */
    }
  }

  function toggleBookmark(id) {
    const bm = getBookmarks();
    const key = String(id);
    const i = bm.indexOf(key);
    if (i === -1) bm.push(key); else bm.splice(i, 1);
    setBookmarks(bm);
    return bm.includes(key);
  }

  // ---------- Carga de datos ----------
  function buildFallbackLibrary(data) {
    // Si data.json todavía no tiene "library", arma un catálogo básico
    // con lo que ya exista (recentMangas + heroSlides) para que la
    // página nunca se quede vacía.
    const map = new Map();
    (data.recentMangas || []).forEach(m => map.set(String(m.id), {
      id: String(m.id), title: m.title, cover: m.cover, genres: m.genre || [],
      rating: m.rating, chapter: m.chapter, status: 'En publicación',
      added: m.added, link: '#'
    }));
    (data.heroSlides || []).forEach(m => map.set(m.id, {
      id: m.id, title: m.title, cover: m.coverImage, genres: m.genres || [],
      rating: m.rating, chapter: m.chapterTag,
      status: m.chapterLabel || 'En publicación', added: null, link: m.link || '#'
    }));
    return Array.from(map.values());
  }

  try {
    const res = await fetch('data/data.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    library = (Array.isArray(data.library) && data.library.length)
      ? data.library
      : buildFallbackLibrary(data);
  } catch (e) {
    console.error('Error cargando la biblioteca:', e);
    if (els.count) els.count.textContent = 'No se pudo cargar la biblioteca. Intenta recargar la página.';
  }

  // ---------- Filtros dinámicos (géneros) ----------
  function populateGenres() {
    if (!els.genre) return;
    const set = new Set();
    library.forEach(m => (m.genres || []).forEach(g => set.add(g)));
    const sorted = Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
    els.genre.insertAdjacentHTML(
      'beforeend',
      sorted.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('')
    );
  }

  // ---------- Filtrado + orden ----------
  function applyFilters() {
    const q = (els.search?.value || '').trim().toLowerCase();
    const genre = els.genre?.value || '';
    const status = els.status?.value || '';
    const sort = els.sort?.value || 'recent';

    filtered = library.filter(m => {
      const matchesQuery = !q || m.title.toLowerCase().includes(q);
      const matchesGenre = !genre || (m.genres || []).includes(genre);
      const matchesStatus = !status || m.status === status;
      return matchesQuery && matchesGenre && matchesStatus;
    });

    filtered.sort((a, b) => {
      if (sort === 'az') return a.title.localeCompare(b.title, 'es');
      if (sort === 'za') return b.title.localeCompare(a.title, 'es');
      if (sort === 'rating') return (b.rating || 0) - (a.rating || 0);
      // "recent" por defecto
      if (a.added && b.added) return new Date(b.added) - new Date(a.added);
      if (a.added) return -1;
      if (b.added) return 1;
      return 0;
    });

    currentPage = 1;
    renderPage();
  }

  // ---------- Render de tarjetas ----------
  function statusClass(status) {
    if (status === 'Finalizado') return 'finalizado';
    if (status === 'Pausado') return 'pausado';
    return 'publicando';
  }

  function cardTemplate(m, bookmarks) {
    const id = String(m.id);
    const isBm = bookmarks.includes(id);
    const cover = imgWithFallback(m.cover, m.title, 'loading="lazy" decoding="async"');
    const genrePills = (m.genres || []).slice(0, 3)
      .map(g => `<span class="pill">${escapeHtml(g)}</span>`).join('');
    const link = m.link || '#';
    const bookmarkIcon = (window.Components && Components.icons.bookmark)
      ? Components.icons.bookmark
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';

    return `
      <article class="biblio-card" data-id="${escapeHtml(id)}">
        <a href="${escapeHtml(link)}" class="biblio-card-cover-link" aria-label="Leer ${escapeHtml(m.title)}">
          <div class="biblio-card-cover">
            ${cover}
            <span class="biblio-status-badge status-${statusClass(m.status)}">${escapeHtml(m.status || 'En publicación')}</span>
          </div>
        </a>
        <button
          class="biblio-bookmark-btn${isBm ? ' is-active' : ''}"
          data-id="${escapeHtml(id)}"
          type="button"
          aria-pressed="${isBm}"
          aria-label="${isBm ? 'Quitar de mi biblioteca' : 'Guardar en mi biblioteca'}"
          title="${isBm ? 'Quitar de mi biblioteca' : 'Guardar en mi biblioteca'}"
        >${bookmarkIcon}</button>
        <div class="biblio-card-info">
          <h3 class="biblio-card-title"><a href="${escapeHtml(link)}">${escapeHtml(m.title)}</a></h3>
          <div class="biblio-card-meta">
            <span class="biblio-rating">★ ${Number(m.rating || 0).toFixed(1)}</span>
            <span class="biblio-chapter">${escapeHtml(m.chapter || '')}</span>
          </div>
          ${genrePills ? `<div class="biblio-card-genres">${genrePills}</div>` : ''}
        </div>
      </article>
    `;
  }

  function renderPage() {
    const total = filtered.length;

    if (els.count) {
      els.count.textContent = total
        ? `${total} título${total === 1 ? '' : 's'} en la biblioteca`
        : '0 títulos encontrados';
    }

    if (els.empty) els.empty.hidden = total !== 0;
    els.grid.hidden = total === 0;

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);
    const bookmarks = getBookmarks();

    els.grid.innerHTML = pageItems.map(m => cardTemplate(m, bookmarks)).join('');
    renderPagination(totalPages);
  }

  function renderPagination(totalPages) {
    if (!els.pagination) return;
    if (totalPages <= 1) {
      els.pagination.innerHTML = '';
      return;
    }

    let html = `<button class="page-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''} aria-label="Página anterior">‹</button>`;

    for (let p = 1; p <= totalPages; p++) {
      const isEdge = p === 1 || p === totalPages;
      const isNear = Math.abs(p - currentPage) <= 1;
      if (isEdge || isNear) {
        html += `<button class="page-btn${p === currentPage ? ' active' : ''}" data-page="${p}" ${p === currentPage ? 'aria-current="page"' : ''}>${p}</button>`;
      } else if (Math.abs(p - currentPage) === 2) {
        html += `<span class="page-ellipsis">…</span>`;
      }
    }

    html += `<button class="page-btn" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''} aria-label="Página siguiente">›</button>`;
    els.pagination.innerHTML = html;
  }

  // ---------- Eventos ----------
  els.pagination?.addEventListener('click', (e) => {
    const btn = e.target.closest('.page-btn');
    if (!btn || btn.disabled) return;
    const page = parseInt(btn.dataset.page, 10);
    if (!page || page === currentPage) return;
    currentPage = page;
    renderPage();
    document.querySelector('.biblio-toolbar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  els.grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.biblio-bookmark-btn');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const id = btn.dataset.id;
    const isNowBm = toggleBookmark(id);
    btn.classList.toggle('is-active', isNowBm);
    btn.setAttribute('aria-pressed', String(isNowBm));
    const label = isNowBm ? 'Quitar de mi biblioteca' : 'Guardar en mi biblioteca';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
  });

  let searchTimer = null;
  els.search?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applyFilters, 250);
  });

  els.genre?.addEventListener('change', applyFilters);
  els.status?.addEventListener('change', applyFilters);
  els.sort?.addEventListener('change', applyFilters);

  // ---------- Arranque ----------
  populateGenres();
  applyFilters();
});
