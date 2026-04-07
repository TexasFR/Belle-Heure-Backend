const router  = require('express').Router();
const { db }  = require('../supabase/client');
const { requireAdmin, requireAuth } = require('../middleware/auth');

// ── USERS ──────────────────────────────────────────────────

// GET /api/users — admin
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { data: profiles, error } = await db.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    const { data: appts } = await db.from('appointments').select('user_id').neq('status', 'cancelled');
    const cntMap = {};
    (appts || []).forEach(a => { if (a.user_id) cntMap[a.user_id] = (cntMap[a.user_id] || 0) + 1; });
    res.json(profiles.map(p => ({ ...p, appointment_count: cntMap[p.id] || 0 })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/users/me
router.get('/me', requireAuth, (req, res) => res.json(req.user.profile));

// PUT /api/users/me
router.put('/me', requireAuth, async (req, res) => {
  try {
    const { first_name, last_name, phone } = req.body;
    const { data, error } = await db.from('profiles').update({ first_name, last_name, phone }).eq('id', req.user.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/users/:id/role — admin
router.put('/:id/role', requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user','admin'].includes(role)) return res.status(400).json({ error: 'Rôle invalide' });
    const { data, error } = await db.from('profiles').update({ role }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/users/:id — admin
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await db.from('profiles').delete().eq('id', req.params.id);
    await db.auth.admin.deleteUser(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SETTINGS ───────────────────────────────────────────────

router.get('/settings', async (req, res) => {
  try {
    const { data, error } = await db.from('settings').select('*');
    if (error) throw error;
    const obj = {};
    (data || []).forEach(r => { obj[r.key] = r.value; });
    res.json(obj);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/settings', requireAdmin, async (req, res) => {
  try {
    for (const [key, value] of Object.entries(req.body)) {
      await db.from('settings').upsert({ key, value: String(value) }, { onConflict: 'key' });
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
