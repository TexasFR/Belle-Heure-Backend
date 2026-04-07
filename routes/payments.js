const router  = require('express').Router();
const express = require('express');
const { db }  = require('../supabase/client');

function stripe() {
  const k = process.env.STRIPE_SECRET_KEY;
  return (k && !k.includes('sk_test_...')) ? require('stripe')(k) : null;
}

// GET /api/payments/config — clé publique pour le frontend
router.get('/config', (req, res) => {
  const pk = process.env.STRIPE_PUBLISHABLE_KEY;
  res.json({ publishable_key: pk || null, configured: !!(pk && !pk.includes('pk_test_...')) });
});

// POST /api/payments/create-intent
router.post('/create-intent', async (req, res) => {
  try {
    const { appointment_id } = req.body;
    if (!appointment_id) return res.status(400).json({ error: 'appointment_id requis' });

    const s = stripe();
    if (!s) return res.json({ client_secret: `demo_${Date.now()}`, demo: true });

    const { data: appt } = await db.from('appointments').select('*').eq('id', appointment_id).single();
    if (!appt) return res.status(404).json({ error: 'Rendez-vous introuvable' });

    const intent = await s.paymentIntents.create({
      amount: Math.round(parseFloat(appt.service_price) * 100),
      currency: 'eur',
      receipt_email: appt.email,
      metadata: { appointment_id: appt.id, service: appt.service_name, client: `${appt.first_name} ${appt.last_name}` },
      description: `Belle Heure — ${appt.service_name} — ${appt.first_name} ${appt.last_name}`,
    });
    res.json({ client_secret: intent.client_secret });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/payments/webhook — Stripe webhook (raw body)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig    = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const s      = stripe();
  if (!s || !secret) return res.json({ received: true });
  let event;
  try { event = s.webhooks.constructEvent(req.body, sig, secret); }
  catch (e) { return res.status(400).send(`Webhook Error: ${e.message}`); }
  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    const id = pi.metadata?.appointment_id;
    if (id) await db.from('appointments').update({ status: 'confirmed', stripe_payment_id: pi.id }).eq('id', id);
  }
  if (event.type === 'payment_intent.payment_failed') {
    const pi = event.data.object;
    const id = pi.metadata?.appointment_id;
    if (id) await db.from('appointments').update({ status: 'cancelled' }).eq('id', id);
  }
  res.json({ received: true });
});

module.exports = router;
