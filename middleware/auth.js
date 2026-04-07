const { db } = require('../supabase/client');

/** Vérifie un token JWT Supabase et attache req.user */
async function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Token manquant' });
  if (!db) return res.status(503).json({ error: 'Supabase non configuré' });
  try {
    const { data, error } = await db.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Token invalide' });
    const { data: profile } = await db.from('profiles').select('*').eq('id', data.user.id).single();
    req.user = { ...data.user, profile: profile || {} };
    next();
  } catch { res.status(401).json({ error: 'Erreur authentification' }); }
}

/** Vérifie que l'utilisateur a le rôle admin (via JWT Supabase OU ADMIN_SECRET header) */
async function requireAdmin(req, res, next) {
  // Option 1: secret backend-to-backend
  if (req.headers['x-admin-secret'] === process.env.ADMIN_SECRET) {
    req.isAdminSecret = true; return next();
  }
  // Option 2: JWT Supabase avec role admin
  const token = extractToken(req);
  if (!token) return res.status(403).json({ error: 'Accès admin requis' });
  if (!db) return res.status(503).json({ error: 'Supabase non configuré' });
  try {
    const { data } = await db.auth.getUser(token);
    if (!data?.user) return res.status(403).json({ error: 'Non autorisé' });
    const { data: profile } = await db.from('profiles').select('role').eq('id', data.user.id).single();
    if (profile?.role !== 'admin') return res.status(403).json({ error: 'Rôle admin requis' });
    req.user = { ...data.user, profile };
    req.isAdmin = true;
    next();
  } catch { res.status(403).json({ error: 'Accès refusé' }); }
}

/** Auth optionnelle — ne bloque pas si absent */
async function optAuth(req, res, next) {
  const token = extractToken(req);
  if (token && db) {
    try {
      const { data } = await db.auth.getUser(token);
      if (data?.user) {
        const { data: p } = await db.from('profiles').select('*').eq('id', data.user.id).single();
        req.user = { ...data.user, profile: p || {} };
      }
    } catch {}
  }
  next();
}

function extractToken(req) {
  const auth = req.headers['authorization'];
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

module.exports = { requireAuth, requireAdmin, optAuth };
