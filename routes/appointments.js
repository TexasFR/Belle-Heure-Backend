const router = require('express').Router();
const { db }  = require('../supabase/client');
const { requireAdmin, optAuth, requireAuth } = require('../middleware/auth');

function makeId() {
  return 'BH-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2,5).toUpperCase();
}
function genSlots(open, close, dur) {
  const sl = [];
  let [sh, sm] = open.split(':').map(Number);
  const [eh, em] = close.split(':').map(Number);
  let cur = sh * 60 + sm, end = eh * 60 + em;
  while (cur + dur <= end) {
    sl.push(`${String(Math.floor(cur/60)).padStart(2,'0')}:${String(cur%60).padStart(2,'0')}`);
    cur += dur;
  }
  return sl;
}

// GET /api/appointments/slots?date=YYYY-MM-DD
router.get('/slots', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Date requise' });
    const dow = new Date(date + 'T00:00:00').getDay();
    const [dayR, blkR, cfgR, takenR] = await Promise.all([
      db.from('schedule').select('*').eq('day_of_week', dow).single(),
      db.from('blocked_dates').select('date').eq('date', date).maybeSingle(),
      db.from('slot_config').select('slot_duration').limit(1).single(),
      db.from('appointments').select('appointment_slot').eq('appointment_date', date).neq('status', 'cancelled'),
    ]);
    if (blkR.data) return res.json({ available: false, reason: 'blocked', slots: [] });
    if (!dayR.data?.is_open) return res.json({ available: false, reason: 'closed', slots: [] });
    const dur = cfgR.data?.slot_duration || 30;
    const open  = dayR.data.open_time.slice(0, 5);
    const close = dayR.data.close_time.slice(0, 5);
    const taken = (takenR.data || []).map(r => r.appointment_slot.slice(0, 5));
    res.json({ available: true, slots: genSlots(open, close, dur).map(t => ({ time: t, taken: taken.includes(t) })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/appointments — admin
router.get('/', requireAdmin, async (req, res) => {
  try {
    let q = db.from('appointments').select('*').order('appointment_date', { ascending: false }).order('appointment_slot', { ascending: false });
    if (req.query.status) q = q.eq('status', req.query.status);
    if (req.query.date)   q = q.eq('appointment_date', req.query.date);
    if (req.query.search) { const s = `%${req.query.search}%`; q = q.or(`first_name.ilike.${s},last_name.ilike.${s},email.ilike.${s}`); }
    const { data, error } = await q;
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/appointments/mine
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const { data, error } = await db.from('appointments').select('*').eq('user_id', req.user.id).order('appointment_date', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/appointments — créer
router.post('/', optAuth, async (req, res) => {
  try {
    const { service_id, appointment_date, appointment_slot, first_name, last_name, email, phone, notes, payment_method } = req.body;
    if (!service_id || !appointment_date || !appointment_slot || !first_name || !last_name || !email || !phone)
      return res.status(400).json({ error: 'Champs obligatoires manquants' });

    const { data: svc } = await db.from('services').select('*').eq('id', service_id).single();
    if (!svc) return res.status(404).json({ error: 'Soin introuvable' });

    const { data: existing } = await db.from('appointments').select('id').eq('appointment_date', appointment_date).eq('appointment_slot', appointment_slot).neq('status', 'cancelled').maybeSingle();
    if (existing) return res.status(409).json({ error: 'Ce créneau est déjà pris' });

    const pm = payment_method === 'on_site' ? 'on_site' : 'stripe';
    const { data, error } = await db.from('appointments').insert({
      id: makeId(),
      user_id: req.user?.id || null,
      service_id, service_name: svc.name, service_icon: svc.icon, service_price: svc.price,
      appointment_date, appointment_slot, first_name, last_name, email, phone,
      notes: notes || '', payment_method: pm,
      status: pm === 'on_site' ? 'confirmed' : 'pending',
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/appointments/:id/status — admin
router.put('/:id/status', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending','confirmed','completed','cancelled'].includes(status)) return res.status(400).json({ error: 'Statut invalide' });
    const { data, error } = await db.from('appointments').update({ status }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/appointments/:id/confirm-payment — après Stripe
router.put('/:id/confirm-payment', async (req, res) => {
  try {
    const { stripe_payment_id } = req.body;
    const { data, error } = await db.from('appointments').update({ status: 'confirmed', stripe_payment_id }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/appointments/:id — annuler
router.delete('/:id', optAuth, async (req, res) => {
  try {
    const { data: appt } = await db.from('appointments').select('user_id').eq('id', req.params.id).single();
    if (!appt) return res.status(404).json({ error: 'Rendez-vous introuvable' });
    const isAdmin = req.isAdminSecret || req.user?.profile?.role === 'admin';
    const isOwner = req.user?.id && req.user.id === appt.user_id;
    if (!isAdmin && !isOwner) return res.status(403).json({ error: 'Non autorisé' });
    const { data, error } = await db.from('appointments').update({ status: 'cancelled' }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
