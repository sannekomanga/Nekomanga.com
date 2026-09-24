/**
 * NekoManga - Auth Modal
 *
 * Inyecta la ventana de login/registro sobre la página actual (no navega
 * a ningún lado). Todo lo de autenticación vive aquí — no toca main.js
 * ni components.js, así que se puede editar aparte sin enredarse con
 * el resto del sitio.
 */

document.addEventListener('DOMContentLoaded', () => {

  document.body.insertAdjacentHTML('beforeend', renderAuthModal());

  const authModal = document.getElementById('authModal');
  const btnOpenLogin = document.getElementById('btnOpenLogin');
  const btnCloseAuth = document.getElementById('btnCloseAuth');

  function openModal() {
    // Si el botón vive dentro del menú del header, ciérralo primero.
    document.getElementById('menuPopup')?.classList.remove('open');
    document.getElementById('notifPopup')?.classList.remove('open');
    authModal.classList.add('open');
  }

  function closeModal() {
    authModal.classList.remove('open');
  }

  btnOpenLogin?.addEventListener('click', openModal);
  btnCloseAuth?.addEventListener('click', closeModal);
  authModal.addEventListener('click', (e) => {
    if (e.target === authModal) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // ---- Pestañas ----
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const panelLogin = document.getElementById('panelLogin');
  const panelRegister = document.getElementById('panelRegister');
  const modalTitle = document.getElementById('modalTitle');

  function showTab(tab) {
    const isLogin = tab === 'login';
    tabLogin.classList.toggle('active', isLogin);
    tabRegister.classList.toggle('active', !isLogin);
    panelLogin.classList.toggle('active', isLogin);
    panelRegister.classList.toggle('active', !isLogin);
    modalTitle.textContent = isLogin ? 'Iniciar sesión' : 'Crear cuenta';
    hideMessage();
  }

  tabLogin.addEventListener('click', () => showTab('login'));
  tabRegister.addEventListener('click', () => showTab('register'));

  // ---- Mensaje de error / éxito ----
  const authMessage = document.getElementById('authMessage');

  function showMessage(text, type) {
    authMessage.textContent = text;
    authMessage.className = `auth-message show ${type}`;
  }

  function hideMessage() {
    authMessage.className = 'auth-message';
  }

  function requireSupabase() {
    if (!supabaseClient) {
      showMessage(
        'Falta conectar Supabase: completa js/supabase-client.js con tu URL y tu clave.',
        'error'
      );
      return false;
    }
    return true;
  }

  // ---- Google ----
  document.getElementById('btnGoogle').addEventListener('click', async () => {
    if (!requireSupabase()) return;
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href }
    });
    if (error) showMessage(error.message, 'error');
  });

  // ---- Iniciar sesión (correo + contraseña) ----
  const loginForm = document.getElementById('loginForm');
  const btnLoginSubmit = document.getElementById('btnLoginSubmit');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!requireSupabase()) return;
    hideMessage();

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    btnLoginSubmit.disabled = true;
    btnLoginSubmit.textContent = 'Entrando...';

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

    btnLoginSubmit.disabled = false;
    btnLoginSubmit.textContent = 'Entrar';

    if (error) {
      showMessage(traducirError(error.message), 'error');
      return;
    }

    window.location.reload();
  });

  // ---- Crear cuenta (correo + contraseña) ----
  const registerForm = document.getElementById('registerForm');
  const btnRegisterSubmit = document.getElementById('btnRegisterSubmit');

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!requireSupabase()) return;
    hideMessage();

    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;

    btnRegisterSubmit.disabled = true;
    btnRegisterSubmit.textContent = 'Creando cuenta...';

    const { error } = await supabaseClient.auth.signUp({ email, password });

    btnRegisterSubmit.disabled = false;
    btnRegisterSubmit.textContent = 'Crear cuenta';

    if (error) {
      showMessage(traducirError(error.message), 'error');
      return;
    }

    showMessage('Cuenta creada. Revisa tu correo para confirmarla.', 'success');
    registerForm.reset();
  });

  // ---- Mensajes de error de Supabase, traducidos ----
  function traducirError(msg) {
    const mapa = {
      'Invalid login credentials': 'Correo o contraseña incorrectos.',
      'User already registered': 'Ese correo ya tiene una cuenta.',
      'Email not confirmed': 'Confirma tu correo antes de iniciar sesión.',
      'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres.'
    };
    return mapa[msg] || msg;
  }
});

/**
 * Markup del modal. Vive en su propia función para que sea fácil de
 * ubicar y editar sin tener que leer el resto de auth.js.
 */
function renderAuthModal() {
  return `
    <div class="modal-overlay" id="authModal">
      <div class="modal">
        <button class="modal-close" id="btnCloseAuth" aria-label="Cerrar">✕</button>
        <h2 class="modal-title" id="modalTitle">Iniciar sesión</h2>

        <div class="auth-tabs">
          <button class="auth-tab active" id="tabLogin" type="button">Iniciar sesión</button>
          <button class="auth-tab" id="tabRegister" type="button">Crear cuenta</button>
        </div>

        <div class="auth-message" id="authMessage"></div>

        <button class="btn-google" id="btnGoogle" type="button">
          <svg viewBox="0 0 24 24"><path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47c-.28 1.5-1.13 2.77-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81z"/><path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.92l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.26v3.1C3.24 21.3 7.28 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.27A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.27v-3.1H1.26A11.98 11.98 0 0 0 0 12c0 1.94.46 3.77 1.26 5.37z"/><path fill="#EA4335" d="M12 4.77c1.76 0 3.34.6 4.59 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0 7.28 0 3.24 2.7 1.26 6.63l4.01 3.1C6.22 6.88 8.87 4.77 12 4.77z"/></svg>
          Continuar con Google
        </button>

        <div class="auth-divider">o con tu correo</div>

        <div class="auth-panel active" id="panelLogin">
          <form id="loginForm">
            <div class="form-group">
              <label for="loginEmail">Correo electrónico</label>
              <input type="email" id="loginEmail" placeholder="tu@email.com" required>
            </div>
            <div class="form-group">
              <label for="loginPassword">Contraseña</label>
              <input type="password" id="loginPassword" placeholder="••••••••" required>
            </div>
            <button type="submit" class="btn-primary" id="btnLoginSubmit">Entrar</button>
          </form>
        </div>

        <div class="auth-panel" id="panelRegister">
          <form id="registerForm">
            <div class="form-group">
              <label for="registerEmail">Correo electrónico</label>
              <input type="email" id="registerEmail" placeholder="tu@email.com" required>
            </div>
            <div class="form-group">
              <label for="registerPassword">Contraseña</label>
              <input type="password" id="registerPassword" placeholder="Mínimo 6 caracteres" minlength="6" required>
            </div>
            <p class="form-hint">Te enviaremos un correo para confirmar tu cuenta.</p>
            <button type="submit" class="btn-primary" id="btnRegisterSubmit">Crear cuenta</button>
          </form>
        </div>
      </div>
    </div>
  `;
}
