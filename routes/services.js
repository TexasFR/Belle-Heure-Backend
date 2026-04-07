const router = require('express').Router();
const { db }  = require('../supabase/client');
const { requireAdmin } = require('../middleware/auth');

router.get('/', async (req, res) => {
  try {
    const admin = req.headers['x-admin-secret'] === process.env.ADMIN_SECRET;
    let q = db.from('services').select('*').order('sort_order');
    if (!admin) q = q.eq('active', true);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, icon, description, price, duration, active, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom requis' });
    const { data, error } = await db.from('services').insert({
      name, icon: icon || '✨', description: description || '',
      price: parseFloat(price) || 0, duration: parseInt(duration) || 30,
      active: active !== false, sort_order: sort_order || 0,
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await db.from('services').update(req.body).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { error } = await db.from('services').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
