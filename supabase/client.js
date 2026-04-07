const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL  = process.env.SUPABASE_URL;
const ANON_KEY      = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;

const configured = !!(SUPABASE_URL && ANON_KEY && SERVICE_KEY);

if (!configured) {
  console.warn('⚠  Supabase non configuré — mode démo (localStorage côté frontend)');
}

// Client admin — contourne RLS, utilisé côté serveur uniquement
const db = configured
  ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

// Client public — respecte RLS (pour vérifier les tokens utilisateurs)
const supabase = configured ? createClient(SUPABASE_URL, ANON_KEY) : null;

module.exports = { db, supabase, configured, SUPABASE_URL, ANON_KEY };
