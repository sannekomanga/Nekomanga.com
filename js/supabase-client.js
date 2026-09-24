/**
 * NekoManga - Conexión a Supabase
 *
 * Solo hace falta llenar estas 2 líneas con los datos de tu proyecto
 * (Supabase → Settings → API):
 *   - Project URL
 *   - anon public key
 *
 * Este archivo NO tiene nada más — es a propósito, para que sea el
 * único lugar que toques si algún día cambias de proyecto de Supabase.
 */

const SUPABASE_URL = 'PEGA_AQUI_TU_PROJECT_URL';
const SUPABASE_ANON_KEY = 'PEGA_AQUI_TU_ANON_KEY';

const supabaseClient = (SUPABASE_URL.startsWith('http'))
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

if (!supabaseClient) {
  console.warn(
    'Supabase todavía no está configurado. Completa SUPABASE_URL y ' +
    'SUPABASE_ANON_KEY en js/supabase-client.js (Supabase → Settings → API).'
  );
}
