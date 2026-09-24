/**
 * NekoManga - Reusable Components
 */

const Components = {
  // SVG Icons
  icons: {
    menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
    bookmark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`,
    bell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
    user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    library: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
    calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    discord: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>`,
    x: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
    tiktok: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>`
  },

  renderHeader() {
    return `
      <header class="site-header">

        <!-- Barra de novedades (ticker) — copiada del diseño de overclock-header -->
        <div class="ticker-bar" role="region" aria-label="Últimos capítulos publicados">
          <span class="ticker-tag">Novedades</span>
          <div class="ticker-viewport" id="tickerViewport">
            <!-- filled by JS desde data.json (ticker) -->
          </div>
        </div>

        <div class="main-row">
          <a href="index.html" class="logo">nekomanga</a>
          <div class="header-actions">
            <div class="header-btn-wrap" style="position:relative">
              <button class="header-btn" id="btnMenu" aria-label="Menú">
                ${this.icons.menu}
              </button>
              <div class="popup menu-popup" id="menuPopup">
                <a href="biblioteca.html" class="menu-item">${this.icons.library} Biblioteca</a>
                <a href="eventos.html" class="menu-item">${this.icons.calendar} Eventos</a>
                <a href="comunidad.html" class="menu-item">${this.icons.users} Comunidad</a>
                <div class="menu-divider"></div>
                <a href="perfil.html" class="menu-item">${this.icons.user} Mi perfil</a>
                <button class="menu-item" id="btnOpenLogin" style="width:100%;text-align:left">${this.icons.user} Iniciar sesión</button>
              </div>
            </div>
            <a href="perfil.html" class="header-btn" aria-label="Guardados" title="Mis obras guardadas">
              ${this.icons.bookmark}
            </a>
            <div class="header-btn-wrap" style="position:relative">
              <button class="header-btn" id="btnNotif" aria-label="Notificaciones">
                ${this.icons.bell}
                <span class="notif-badge" id="notifBadge"></span>
              </button>
              <!-- Panel de notificaciones — copiado del diseño de overclock-header -->
              <div class="popup" id="notifPopup">
                <div class="popup-header">
                  <span>Notificaciones</span>
                  <button class="link-btn" id="btnMarkRead" type="button">Marcar como leídas</button>
                </div>
                <div class="popup-body" id="notifList">
                  <!-- filled by JS desde data.json (notifications) -->
                </div>
                <a class="popup-footer-link" href="#">Ver novedades de mi biblioteca</a>
              </div>
            </div>
          </div>
        </div>
      </header>
    `;
  },

  renderFooter() {
    return `
      <footer class="site-footer">
        <div class="footer-inner">
          <div>
            <div class="footer-brand">nekomanga</div>
            <p style="font-size:0.85rem;color:var(--text-muted);max-width:220px">Tu biblioteca de manga favorita. Lee, guarda y comparte.</p>
            <div class="footer-socials">
              <a href="#" class="social-link" aria-label="Discord" title="Discord">${this.icons.discord}</a>
              <a href="#" class="social-link" aria-label="X" title="X / Twitter">${this.icons.x}</a>
              <a href="#" class="social-link" aria-label="TikTok" title="TikTok">${this.icons.tiktok}</a>
            </div>
          </div>
          <div class="footer-links">
            <div class="footer-col">
              <h4>Explorar</h4>
              <a href="biblioteca.html">Biblioteca</a>
              <a href="#">Ranking</a>
              <a href="eventos.html">Eventos</a>
              <a href="comunidad.html">Comunidad</a>
            </div>
            <div class="footer-col">
              <h4>Soporte</h4>
              <a href="#">Contacto</a>
              <a href="#">Ayuda</a>
              <a href="#">FAQ</a>
            </div>
            <div class="footer-col">
              <h4>Legal</h4>
              <a href="#">Términos</a>
              <a href="#">Privacidad</a>
            </div>
          </div>
          <div></div>
        </div>
        <div class="footer-bottom">
          © 2026 NekoManga. Todos los derechos reservados.
        </div>
      </footer>
    `;
  },

  renderLoginModal() {
    return `
      <div class="modal-overlay" id="loginModal">
        <div class="modal" style="position:relative">
          <button class="modal-close" id="btnCloseLogin" aria-label="Cerrar">✕</button>
          <h2 class="modal-title" id="modalTitle">Iniciar sesión</h2>
          <form id="loginForm">
            <div class="form-group">
              <label for="email">Correo electrónico</label>
              <input type="email" id="email" placeholder="tu@email.com" required>
            </div>
            <div class="form-group">
              <label for="password">Contraseña</label>
              <input type="password" id="password" placeholder="••••••••" required>
            </div>
            <button type="submit" class="btn-primary">Entrar</button>
          </form>
          <div class="modal-switch">
            ¿No tienes cuenta? <a href="#" id="btnSwitchRegister">Crear cuenta</a>
          </div>
        </div>
      </div>
    `;
  }
};

// Export for use
window.Components = Components;
