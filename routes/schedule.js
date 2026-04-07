const router = require('express').Router();
const { db }  = require('../supabase/client');
const { requireAdmin } = require('../middleware/auth');

// GET /api/schedule — public
router.get('/', async (req, res) => {
  try {
    const [s, b, c] = await Promise.all([
      db.from('schedule').select('*').order('day_of_week'),
      db.from('blocked_dates').select('*').order('date'),
      db.from('slot_config').select('slot_duration').limit(1).single(),
    ]);
    res.json({ schedule: s.data || [], blocked_dates: b.data || [], slot_duration: c.data?.slot_duration || 30 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/schedule — admin
router.put('/', requireAdmin, async (req, res) => {
  try {
    const { schedule, slot_duration } = req.body;
    if (Array.isArray(schedule)) {
      for (const day of schedule) {
        await db.from('schedule').upsert({
          day_of_week: day.day_of_week,
          is_open: day.is_open,
          open_time: day.open_time,
          close_time: day.close_time,
        }, { onConflict: 'day_of_week' });
      }
    }
    if (slot_duration) {
      const { data: ex } = await db.from('slot_config').select('id').limit(1).single();
      if (ex) await db.from('slot_config').update({ slot_duration }).eq('id', ex.id);
      else await db.from('slot_config').insert({ slot_duration });
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/schedule/blocked
router.post('/blocked', requireAdmin, async (req, res) => {
  try {
    const { date, reason } = req.body;
    if (!date) return res.status(400).json({ error: 'Date requise' });
    await db.from('blocked_dates').upsert({ date, reason: reason || '' }, { onConflict: 'date' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/schedule/blocked/:date
router.delete('/blocked/:date', requireAdmin, async (req, res) => {
  try {
    await db.from('blocked_dates').delete().eq('date', req.params.date);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
