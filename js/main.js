/**
 * NekoManga - Main Script
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Inject header, footer, modal
  const headerPlaceholder = document.getElementById('header-placeholder');
  const footerPlaceholder = document.getElementById('footer-placeholder');
  if (headerPlaceholder) headerPlaceholder.innerHTML = Components.renderHeader();
  if (footerPlaceholder) footerPlaceholder.innerHTML = Components.renderFooter();
  document.body.insertAdjacentHTML('beforeend', Components.renderLoginModal());

  // Load data
  let data = { recentMangas: [], notifications: [] };
  try {
    const res = await fetch('data/data.json');
    data = await res.json();
  } catch (e) {
    console.warn('No se pudo cargar data.json, usando datos de ejemplo');
  }

  // ========== NOTIFICATIONS ==========
  const notifList = document.getElementById('notifList');
  if (notifList && data.notifications) {
    notifList.innerHTML = data.notifications.map(n => `
      <div class="notif-item">
        <img src="${n.cover}" alt="${n.title}">
        <div class="notif-info">
          <div class="notif-title">${n.title}</div>
          <div class="notif-chapter">${n.chapter}</div>
          <div class="notif-time">${n.time}</div>
        </div>
      </div>
    `).join('');
  }

  // ========== RANKING MINI (10 recientes) ==========
  const rankingContainer = document.getElementById('rankingList');
  if (rankingContainer && data.recentMangas) {
    rankingContainer.innerHTML = data.recentMangas.slice(0, 10).map((m, i) => `
      <div class="rank-card">
        <span class="rank-num">${i + 1}</span>
        <img src="${m.cover}" alt="${m.title}" loading="lazy">
        <div class="rank-info">
          <div class="rank-title">${m.title}</div>
          <div class="rank-chapter">${m.chapter}</div>
        </div>
      </div>
    `).join('');
  }

  // ========== POPUPS ==========
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
    document.querySelector('.notif-badge')?.remove();
    notifPopup.classList.remove('open');
  });

  // ========== LOGIN MODAL ==========
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

  // ========== MAIN HERO CAROUSEL ==========
  initHeroCarousel();

  // ========== EVENT CAROUSEL ==========
  initEventCarousel();
});

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
