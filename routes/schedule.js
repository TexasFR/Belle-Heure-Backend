const router = require('express').Router();
const { db }  = require('../supabase/client');
const { requireAdmin } = require('../middleware/auth');
 
/* ══════════════════════════════════════════════════════════
   GET /api/schedule — public
   Retourne : horaires, jours bloqués, durée créneaux,
              mode semaine (week_plan) et noms catégories
══════════════════════════════════════════════════════════ */
router.get('/', async (req, res) => {
  try {
    const [s, b, c, w, cats] = await Promise.all([
      db.from('schedule').select('*').order('day_of_week'),
      db.from('blocked_dates').select('*').order('date'),
      db.from('slot_config').select('slot_duration').limit(1).single(),
      db.from('app_settings').select('value').eq('key', 'week_plan').maybeSingle(),
      db.from('app_settings').select('value').eq('key', 'category_names').maybeSingle(),
    ]);
 
    const weekPlan = w.data?.value
      ? JSON.parse(w.data.value)
      : { enabled: false, open_dates: [], horizon: null };
 
    const categoryNames = cats.data?.value
      ? JSON.parse(cats.data.value)
      : null;
 
    res.json({
      schedule:       s.data || [],
      blocked_dates:  b.data || [],
      slot_duration:  c.data?.slot_duration || 30,
      week_plan:      weekPlan,
      category_names: categoryNames,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
 
/* ══════════════════════════════════════════════════════════
   PUT /api/schedule — admin
   Met à jour les horaires par jour et la durée des créneaux
══════════════════════════════════════════════════════════ */
router.put('/', requireAdmin, async (req, res) => {
  try {
    const { schedule, slot_duration } = req.body;
 
    if (Array.isArray(schedule)) {
      for (const day of schedule) {
        await db.from('schedule').upsert({
          day_of_week: day.day_of_week,
          is_open:     day.is_open,
          open_time:   day.open_time,
          close_time:  day.close_time,
          open_time2:   day.open_time2,
          close_time2:  day.close_time2,
        }, { onConflict: 'day_of_week' });
      }
    }
 
    if (slot_duration) {
      const { data: ex } = await db.from('slot_config').select('id').limit(1).single();
      if (ex) await db.from('slot_config').update({ slot_duration }).eq('id', ex.id);
      else    await db.from('slot_config').insert({ slot_duration });
    }
 
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
 
/* ══════════════════════════════════════════════════════════
   POST /api/schedule/blocked
   Bloquer un seul jour
══════════════════════════════════════════════════════════ */
router.post('/blocked', requireAdmin, async (req, res) => {
  try {
    const { date, reason } = req.body;
    if (!date) return res.status(400).json({ error: 'Date requise' });
    await db.from('blocked_dates').upsert(
      { date, reason: reason || '' },
      { onConflict: 'date' }
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
 
/* ══════════════════════════════════════════════════════════
   POST /api/schedule/blocked/range  ← NOUVEAU
   Bloquer une période entière (vacances / congés)
   Body : { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD', reason?: string }
══════════════════════════════════════════════════════════ */
router.post('/blocked/range', requireAdmin, async (req, res) => {
  try {
    const { start, end, reason } = req.body;
    if (!start || !end) return res.status(400).json({ error: 'start et end requis' });
    if (start > end)    return res.status(400).json({ error: 'start doit être avant end' });
 
    // Générer toutes les dates de la plage
    const dates = [];
    const cur   = new Date(start + 'T00:00:00');
    const endD  = new Date(end   + 'T00:00:00');
   while (cur <= endD) {
  // Remplace : dates.push(cur.toISOString().slice(0, 10));
  const y = cur.getFullYear();
  const m = String(cur.getMonth() + 1).padStart(2, '0');
  const d = String(cur.getDate()).padStart(2, '0');
  dates.push(`${y}-${m}-${d}`);
  cur.setDate(cur.getDate() + 1);
}
 
    // Upsert en batch (Supabase accepte un tableau)
    const rows = dates.map(date => ({ date, reason: reason || 'Fermeture période' }));
    const { error } = await db.from('blocked_dates').upsert(rows, { onConflict: 'date' });
    if (error) throw new Error(error.message);
 
    res.json({ success: true, blocked: dates.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

 
/* ══════════════════════════════════════════════════════════
   DELETE /api/schedule/blocked/:date
   Débloquer un jour
══════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════
   DELETE /api/schedule/blocked/range  ← NOUVEAU
   Débloquer une période entière
   Body : { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }
══════════════════════════════════════════════════════════ */
router.delete('/blocked/range', requireAdmin, async (req, res) => {
  try {
   const { start, end } = req.body;
    if (!start || !end) return res.status(400).json({ error: 'start et end requis' });
    const { error } = await db
      .from('blocked_dates')
      .delete()
      .gte('date', start)
      .lte('date', end);
    if (error) throw new Error(error.message);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
   });
   
router.delete('/blocked/cleanup', requireAdmin, async (req, res) => {
  try {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;

    // Récupère les dates passées
    const { data: toDelete, error: selectError } = await db
      .from('blocked_dates')
      .select('date')
      .lt('date', todayStr);

    if (selectError) throw new Error(selectError.message);
    if (!toDelete || toDelete.length === 0)
      return res.json({ success: true, deleted: 0 });

    // Supprime une par une comme ton endpoint qui fonctionne
    for (const row of toDelete) {
      await db.from('blocked_dates').delete().eq('date', row.date);
    }

    res.json({ success: true, deleted: toDelete.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/weekplan/cleanup_weekplan', requireAdmin, async (req, res) => {
  try {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;

    // Récupère les dates passées
    const { data: toDelete, error: selectError } = await db
      .from('week_plan_dates')
      .select('date')
      .lt('date', todayStr);

    if (selectError) throw new Error(selectError.message);
    if (!toDelete || toDelete.length === 0)
      return res.json({ success: true, deleted: 0 });

    // Supprime une par une comme ton endpoint qui fonctionne
    for (const row of toDelete) {
      await db.from('week_plan_dates').delete().eq('date', row.date);
    }

    res.json({ success: true, deleted: toDelete.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ══════════════════════════════════════════════════════════
   GET /api/schedule/week-plan
   Retourne l'état global + toutes les dates ouvertes
══════════════════════════════════════════════════════════ */
router.get('/week-plan',/* requireAdmin,*/ async (req, res) => {
  try {
    const { data: wp, error: e1 } = await db
      .from('week_plan')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (e1) throw e1;

    const { data: dates, error: e2 } = await db
      .from('week_plan_dates')
      .select('date, open_time, close_time, open_time2, close_time2')
      .order('date');
    if (e2) throw e2;

    res.json({
      enabled:    wp?.enabled ?? false,
      horizon:    wp?.horizon ?? null,
      open_dates: dates || []
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


/* ══════════════════════════════════════════════════════════
   PUT /api/schedule/week-plan
   Met à jour enabled + horizon uniquement
   Body : { enabled: bool, horizon: 'YYYY-MM-DD' | null }
══════════════════════════════════════════════════════════ */
router.put('/week-plan', requireAdmin, async (req, res) => {
  try {
    const { enabled, horizon } = req.body;

    const { error } = await db
      .from('week_plan')
      .upsert({ id: 1, enabled, horizon: horizon || null }, { onConflict: 'id' });
    if (error) throw error;

    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


/* ══════════════════════════════════════════════════════════
   POST /api/schedule/week-plan/dates
   Ouvre une date (insert ou update des horaires)
   Body : { date: 'YYYY-MM-DD', open_time: 'HH:MM', close_time: 'HH:MM' }
══════════════════════════════════════════════════════════ */
router.post('/week-plan/dates', requireAdmin, async (req, res) => {
  try {
    const { date, open_time = '09:00', close_time = '19:00', open_time2 ='', close_time2='' } = req.body;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      return res.status(400).json({ error: 'Format date invalide (YYYY-MM-DD)' });

    const { error } = await db
      .from('week_plan_dates')
      .upsert({ date, open_time, close_time, open_time2, close_time2 }, { onConflict: 'date' });
    if (error) throw error;

    res.json({ success: true, date });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


/* ══════════════════════════════════════════════════════════
   DELETE /api/schedule/week-plan/dates/:date
   Ferme une date (supprime la ligne)
══════════════════════════════════════════════════════════ */
router.delete('/week-plan/dates/:date', requireAdmin, async (req, res) => {
  try {
    const { date } = req.params;

    const { error, count } = await db
      .from('week_plan_dates')
      .delete()
      .eq('date', date);
    if (error) throw error;
    if (count === 0) return res.status(404).json({ error: 'Date non trouvée' });

    res.json({ success: true, date });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


 /* ══════════════════════════════════════════════════════════
   GET /api/schedule/categories  ← NOUVEAU
   Lire les noms de catégories galerie
══════════════════════════════════════════════════════════ */
router.get('/categories', async (req, res) => {
  try {
    const { data } = await db
      .from('app_settings')
      .select('value')
      .eq('key', 'category_names')
      .maybeSingle();
 
    const defaults = {
      visage: 'Visage', mains: 'Mains & Pieds', corps: 'Corps',
      maquillage: 'Maquillage', ambiance: 'Ambiance', general: 'Général',
    };
 
    res.json(data?.value ? JSON.parse(data.value) : defaults);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
 
/* ══════════════════════════════════════════════════════════
   PUT /api/schedule/categories  ← NOUVEAU
   Sauvegarder les noms de catégories galerie
   Body : { visage: '...', mains: '...', ... }
══════════════════════════════════════════════════════════ */
router.put('/categories', requireAdmin, async (req, res) => {
  try {
    const allowed = ['visage', 'mains', 'corps', 'maquillage', 'ambiance', 'general'];
    const cats = {};
    for (const k of allowed) {
      if (req.body[k]) cats[k] = String(req.body[k]).slice(0, 60);
    }
    await db.from('app_settings').upsert(
      { key: 'category_names', value: JSON.stringify(cats) },
      { onConflict: 'key' }
    );
    res.json({ success: true, categories: cats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/blocked/:date', requireAdmin, async (req, res) => {
  try {
    await db.from('blocked_dates').delete().eq('date', req.params.date);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
 

module.exports = router;