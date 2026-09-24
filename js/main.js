document.addEventListener('DOMContentLoaded', async () => {
  
  const headerPlaceholder = document.getElementById('header-placeholder');
  const footerPlaceholder = document.getElementById('footer-placeholder');
  if (headerPlaceholder) headerPlaceholder.innerHTML = Components.renderHeader();
  if (footerPlaceholder) footerPlaceholder.innerHTML = Components.renderFooter();
  document.body.insertAdjacentHTML('beforeend', Components.renderLoginModal());

  let data = {
    heroSlides: [], events: [], recentMangas: [], notifications: [], ticker: []
  };

  try {
    const res = await fetch('data/data.json');

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    data = await res.json();

  } catch (e) {
    console.error('Error cargando data.json:', e);
    console.warn('No se pudo cargar data.json, usando datos vacíos');
  }

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

  function imgWithFallback(src, alt, extraAttrs, color) {
    const fallback = placeholderDataUri(alt, color).replace(/'/g, '%27');
    return `<img src="${src}" alt="${alt}" ${extraAttrs || ''} onerror="this.onerror=null;this.src='${fallback}';">`;
  }
 
  const tickerViewport = document.getElementById('tickerViewport');
  if (tickerViewport && data.ticker && data.ticker.length) {
    tickerViewport.innerHTML = data.ticker.map((t, i) => `
      <a class="ticker-item${i === 0 ? ' is-active' : ''}" href="${t.link || '#'}">
        <strong>${t.title}</strong>
        <span class="ch">${t.chapter}</span>
        <span class="when">${t.time}</span>
      </a>
    `).join('');

    const tickerItems = tickerViewport.querySelectorAll('.ticker-item');
    if (tickerItems.length > 1) {
      let tIndex = 0;
      let tTimer = null;

      function showTickerItem(next) {
        tickerItems[tIndex].classList.remove('is-active');
        tIndex = (next + tickerItems.length) % tickerItems.length;
        tickerItems[tIndex].classList.add('is-active');
      }
      function startTicker() {
        clearInterval(tTimer);
        tTimer = setInterval(() => showTickerItem(tIndex + 1), 5000);
      }
      tickerViewport.addEventListener('mouseenter', () => clearInterval(tTimer));
      tickerViewport.addEventListener('mouseleave', startTicker);
      startTicker();
    }
  }

  const notifList = document.getElementById('notifList');
  const notifBadge = document.getElementById('notifBadge');
  if (notifList && data.notifications) {
    notifList.innerHTML = data.notifications.map(n => `
      <a class="notif-item${n.unread ? ' is-unread' : ''}" href="#" style="--c:${n.color || 'var(--accent-red)'}">
        <span class="notif-bar"></span>
        <span class="notif-info">
          <span class="notif-title">${n.title}</span>
          <span class="notif-chapter">${n.chapter}</span>
        </span>
        <span class="notif-time">${n.time}</span>
      </a>
    `).join('');

    const hasUnread = data.notifications.some(n => n.unread);
    if (notifBadge) notifBadge.hidden = !hasUnread;
  }

  const rankingContainer = document.getElementById('rankingList');
  if (rankingContainer && data.recentMangas) {
    rankingContainer.innerHTML = data.recentMangas.slice(0, 10).map((m, i) => `
      <div class="rank-card">
        <span class="rank-num">${i + 1}</span>
        ${imgWithFallback(m.cover, m.title, 'loading="lazy"')}
        <div class="rank-info">
          <div class="rank-title">${m.title}</div>
          <div class="rank-chapter">${m.chapter}</div>
        </div>
      </div>
    `).join('');
  }
  
  const btnMenu = document.getElementById('btnMenu');
  const menuPopup = document.getElementById('menuPopup');
  const btnNotif = document.getElementById('btnNotif');
  const notifPopup = document.getElementById('notifPopup');

  function closeAllPopups() {
    menuPopup?.classList.remove('open');
    notifPopup?.classList.remove('open');
  }

  btnMenu?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = menuPopup.classList.contains('open');
    closeAllPopups();
    if (!isOpen) menuPopup.classList.add('open');
  });

  btnNotif?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = notifPopup.classList.contains('open');
    closeAllPopups();
    if (!isOpen) notifPopup.classList.add('open');
  });

  document.addEventListener('click', closeAllPopups);
  menuPopup?.addEventListener('click', e => e.stopPropagation());
  notifPopup?.addEventListener('click', e => e.stopPropagation());

  document.getElementById('btnMarkRead')?.addEventListener('click', () => {
    notifList?.querySelectorAll('.notif-item.is-unread').forEach(n => n.classList.remove('is-unread'));
    if (notifBadge) notifBadge.hidden = true;
  });
 
  const loginModal = document.getElementById('loginModal');
  const btnOpenLogin = document.getElementById('btnOpenLogin');
  const btnCloseLogin = document.getElementById('btnCloseLogin');
  const btnSwitchRegister = document.getElementById('btnSwitchRegister');
  const modalTitle = document.getElementById('modalTitle');
  let isRegister = false;

  btnOpenLogin?.addEventListener('click', () => {
    closeAllPopups();
    loginModal.classList.add('open');
  });

  btnCloseLogin?.addEventListener('click', () => loginModal.classList.remove('open'));
  loginModal?.addEventListener('click', (e) => {
    if (e.target === loginModal) loginModal.classList.remove('open');
  });

  btnSwitchRegister?.addEventListener('click', (e) => {
    e.preventDefault();
    isRegister = !isRegister;
    modalTitle.textContent = isRegister ? 'Crear cuenta' : 'Iniciar sesión';
    btnSwitchRegister.textContent = isRegister ? 'Iniciar sesión' : 'Crear cuenta';
    btnSwitchRegister.parentElement.childNodes[0].textContent = isRegister
      ? '¿Ya tienes cuenta? '
      : '¿No tienes cuenta? ';
  });

  document.getElementById('loginForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    alert(isRegister ? 'Cuenta creada (demo)' : 'Sesión iniciada (demo)');
    loginModal.classList.remove('open');
  });

  const heroStage = document.getElementById('heroStage');
  if (heroStage && data.heroSlides && data.heroSlides.length) {
    heroStage.innerHTML = data.heroSlides.map((m, i) => heroSlideTemplate(m, i, imgWithFallback)).join('');
    const indicatorContainer = document.getElementById('indicatorContainer');
    if (indicatorContainer) {
      indicatorContainer.innerHTML = data.heroSlides.map((m, i) => `
        <button class="indicator-item${i === 0 ? ' active' : ''}" data-slide="${i}" aria-label="Slide ${i + 1}">
          <div class="progress-fill"></div>
        </button>
      `).join('');
    }
  }
  
  const eventStage = document.getElementById('eventStage');
  if (eventStage && data.events && data.events.length) {
    eventStage.innerHTML = data.events.map((ev, i) => eventSlideTemplate(ev, i)).join('');
    const eventIndicatorContainer = document.getElementById('eventIndicatorContainer');
    if (eventIndicatorContainer) {
      eventIndicatorContainer.innerHTML = data.events.map((ev, i) => `
        <button class="indicator-item${i === 0 ? ' active' : ''}" data-slide="${i}" aria-label="Slide ${i + 1}">
          <div class="progress-fill"></div>
        </button>
      `).join('');
    }
  }
  
  initHeroCarousel();

  initEventCarousel();
});

function heroSlideTemplate(m, index, imgWithFallback) {
  const chipStyle = `background:${m.themeColor};${m.onAccentText ? ` color:${m.onAccentText};` : ''}`;
  return `
    <article class="manga-slide${index === 0 ? ' active' : ''}" style="--theme-color: ${m.themeColor}; --theme-glow: ${m.themeGlow};" data-index="${index}">
      <div class="slide-bg-art" style="background-image: url('${m.bgImage}');"></div>
      <div class="slide-ambient-glow"></div>

      <div class="slide-content">
        <div class="editorial-meta">
          <span class="volume-tag" style="${chipStyle}">${m.chapterTag}</span>
          <span class="magazine-badge">${m.magazine}</span>
        </div>
        <div class="title-wrapper">
          <span class="kanji-bg">${m.titleJp}</span>
          <h2 class="manga-title">${m.title}</h2>
        </div>
        <div class="manga-stats">
          <div class="rating-box"><span>★</span> ${Number(m.rating).toFixed(1)}</div>
          <div class="genre-pills">
            ${m.genres.map(g => `<span class="pill">${g}</span>`).join('')}
          </div>
        </div>
        <p class="manga-synopsis">${m.synopsis}</p>
        <div class="slide-actions">
          <a href="${m.link || '#'}" class="btn-read" style="${chipStyle}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            Leer Ahora
          </a>
          <button class="btn-bookmark" title="Guardar en biblioteca" aria-label="Guardar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
          </button>
        </div>
      </div>

      <div class="slide-visual">
        <div class="art-composition-frame">
          <div class="frame-border-accent"></div>
          <span class="poster-vertical-text">${m.posterJp}</span>
          <div class="main-cover-wrapper">
            ${imgWithFallback(m.coverImage, m.title, `class="main-cover-img"${index === 0 ? '' : ' loading="lazy"'}`, m.themeColor)}
          </div>
          <div class="floating-chapter-card">
            <div class="ch-icon" style="color: ${m.themeColor};">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
            </div>
            <div class="ch-info">
              <div class="ch-label">${m.chapterLabel}</div>
              <div class="ch-title">${m.chapterTitle}</div>
            </div>
          </div>
        </div>
      </div>
    </article>
  `;
}

function eventSlideTemplate(ev, index) {
  const chipStyle = `background:${ev.themeColor};${ev.onAccentText ? ` color:${ev.onAccentText};` : ''}`;
  return `
    <article class="manga-slide${index === 0 ? ' active' : ''}" style="--theme-color: ${ev.themeColor}; --theme-glow: ${ev.themeGlow};" data-index="${index}">
      <div class="slide-bg-art" style="background-image: url('${ev.bgImage}');"></div>
      <div class="slide-ambient-glow"></div>
      <div class="slide-content">
        <div class="editorial-meta">
          <span class="volume-tag" style="${chipStyle}">${ev.tag}</span>
          <span class="magazine-badge">${ev.magazineBadge}</span>
        </div>
        <div class="title-wrapper">
          <span class="kanji-bg">${ev.glyph}</span>
          <h2 class="manga-title">${ev.title}</h2>
        </div>
        <div class="manga-stats">
          <div class="rating-box"><span>★</span> ${Number(ev.rating).toFixed(1)}</div>
          <div class="genre-pills">
            ${ev.genres.map(g => `<span class="pill">${g}</span>`).join('')}
          </div>
        </div>
        <p class="manga-synopsis">${ev.synopsis}</p>
        <div class="slide-actions">
          <a href="${ev.link || '#'}" class="btn-read" style="${chipStyle}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            IR AL EVENTO
          </a>
        </div>
      </div>
      <div class="slide-visual">
        <div class="art-composition-frame">
          <div class="frame-border-accent"></div>
          <div class="main-cover-wrapper event-glyph-frame">
            <div class="event-glyph${ev.vip ? ' event-glyph--vip' : ''}">${ev.glyph}</div>
          </div>
          <div class="floating-chapter-card">
            <div class="ch-icon" style="color:${ev.themeColor};">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
            <div class="ch-info">
              <div class="ch-label">${ev.dateLabel}</div>
              <div class="ch-title">${ev.dateValue}</div>
            </div>
          </div>
        </div>
      </div>
    </article>
  `;
}

function initHeroCarousel() {
  const carousel = document.getElementById('mangaCarousel');
  const viewport = document.getElementById('carouselViewport');
  if (!carousel || !viewport) return;

  const BASE_WIDTH = 1320;
  const BASE_HEIGHT = 640;

  function scaleCarousel() {
    const availableWidth = viewport.clientWidth;
    const scale = Math.min(1, availableWidth / BASE_WIDTH);
    carousel.style.transform = `scale(${scale})`;
    viewport.style.height = (BASE_HEIGHT * scale) + 'px';
  }

  scaleCarousel();
  window.addEventListener('resize', scaleCarousel);
  window.addEventListener('orientationchange', scaleCarousel);

  const slides = carousel.querySelectorAll('.manga-slide');
  const indicators = carousel.querySelectorAll('.indicator-item');
  if (!slides.length) return;

  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const counterCurrent = document.getElementById('counterCurrent');
  const counterTotal = document.getElementById('counterTotal');

  let currentIndex = 0;
  const totalSlides = slides.length;
  const AUTO_PLAY_TIME = 7000;
  let autoPlayTimer = null;

  if (counterTotal) counterTotal.textContent = String(totalSlides).padStart(2, '0');

  function goToSlide(index) {
    if (index < 0) index = totalSlides - 1;
    else if (index >= totalSlides) index = 0;

    slides[currentIndex].classList.remove('active');
    indicators[currentIndex]?.classList.remove('active');

    currentIndex = index;

    slides[currentIndex].classList.add('active');
    indicators[currentIndex]?.classList.add('active');

    if (counterCurrent) counterCurrent.textContent = String(currentIndex + 1).padStart(2, '0');
    resetAutoPlay();
  }

  function nextSlide() { goToSlide(currentIndex + 1); }
  function prevSlide() { goToSlide(currentIndex - 1); }

  function startAutoPlay() {
    autoPlayTimer = setInterval(nextSlide, AUTO_PLAY_TIME);
  }

  function resetAutoPlay() {
    clearInterval(autoPlayTimer);
    startAutoPlay();
  }

  nextBtn?.addEventListener('click', nextSlide);
  prevBtn?.addEventListener('click', prevSlide);

  indicators.forEach((indicator) => {
    indicator.addEventListener('click', (e) => {
      const slideIndex = parseInt(e.currentTarget.getAttribute('data-slide'));
      goToSlide(slideIndex);
    });
  });

  carousel.addEventListener('mouseenter', () => clearInterval(autoPlayTimer));
  carousel.addEventListener('mouseleave', () => startAutoPlay());

  let touchStartX = 0;
  let touchEndX = 0;

  carousel.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  carousel.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    const swipeThreshold = 50;
    if (touchEndX < touchStartX - swipeThreshold) nextSlide();
    else if (touchEndX > touchStartX + swipeThreshold) prevSlide();
  }, { passive: true });

  startAutoPlay();
}

function initEventCarousel() {
  const carousel = document.getElementById('eventCarousel');
  const viewport = document.getElementById('eventViewport');
  if (!carousel || !viewport) return;

  const BASE_WIDTH = 1320;
  const BASE_HEIGHT = 640;

  function scaleCarousel() {
    const availableWidth = viewport.clientWidth;
    const scale = Math.min(1, availableWidth / BASE_WIDTH);
    carousel.style.transform = `scale(${scale})`;
    viewport.style.height = (BASE_HEIGHT * scale) + 'px';
  }

  scaleCarousel();
  window.addEventListener('resize', scaleCarousel);

  const slides = carousel.querySelectorAll('.manga-slide');
  const indicators = carousel.querySelectorAll('.indicator-item');
  if (!slides.length) return;

  let currentIndex = 0;
  const totalSlides = slides.length;
  const AUTO_PLAY_TIME = 7000;
  let autoPlayTimer = null;

  function goToSlide(index) {
    if (index < 0) index = totalSlides - 1;
    else if (index >= totalSlides) index = 0;

    slides[currentIndex].classList.remove('active');
    indicators[currentIndex]?.classList.remove('active');
    currentIndex = index;
    slides[currentIndex].classList.add('active');
    indicators[currentIndex]?.classList.add('active');
    resetAutoPlay();
  }

  function nextSlide() { goToSlide(currentIndex + 1); }

  function startAutoPlay() {
    autoPlayTimer = setInterval(nextSlide, AUTO_PLAY_TIME);
  }

  function resetAutoPlay() {
    clearInterval(autoPlayTimer);
    startAutoPlay();
  }

  indicators.forEach((indicator) => {
    indicator.addEventListener('click', (e) => {
      goToSlide(parseInt(e.currentTarget.getAttribute('data-slide')));
    });
  });

  carousel.addEventListener('mouseenter', () => clearInterval(autoPlayTimer));
  carousel.addEventListener('mouseleave', () => startAutoPlay());

  startAutoPlay();
}
