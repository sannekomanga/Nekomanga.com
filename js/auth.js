/**
 * NekoManga - Auth (iniciar-sesion.html)
 * Lógica de login / registro con Supabase. No toca main.js ni components.js.
 */

document.addEventListener('DOMContentLoaded', () => {

  // ---- Pestañas ----
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const panelLogin = document.getElementById('panelLogin');
  const panelRegister = document.getElementById('panelRegister');

  function showTab(tab) {
    const isLogin = tab === 'login';
    tabLogin.classList.toggle('active', isLogin);
    tabRegister.classList.toggle('active', !isLogin);
    panelLogin.classList.toggle('active', isLogin);
    panelRegister.classList.toggle('active', !isLogin);
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
      options: { redirectTo: window.location.origin + '/index.html' }
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

    window.location.href = 'index.html';
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

  // ---- Si ya hay sesión activa, no tiene sentido quedarse aquí ----
  if (supabaseClient) {
    supabaseClient.auth.getSession().then(({ data }) => {
      if (data.session) window.location.href = 'index.html';
    });
  }
});
