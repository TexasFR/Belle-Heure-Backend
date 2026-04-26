require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { configured, SUPABASE_URL, ANON_KEY } = require('./supabase/client');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Stripe webhook AVANT le json parser ────────────────────
app.use('/api/payments/webhook', require('./routes/payments').webhookHandler || ((req,res,next)=>next()));

// ── Middleware ─────────────────────────────────────────────
app.use(cors({
  origin: [
    "https://html-starter-cyan-eight.vercel.app",
    "https://trntech.fr",
    "https://www.trntech.fr",
  ],
  credentials: true
}));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Static frontend ────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend')));

// ── Routes API ─────────────────────────────────────────────
app.use('/api/services',     require('./routes/services'));
app.use('/api/schedule',     require('./routes/schedule'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/gallery',      require('./routes/gallery'));
app.use('/api/payments',     require('./routes/payments'));
app.use('/api/users',        require('./routes/users'));
app.use('/api/mailer',       require('./routes/mailer'));


// ── Health check ───────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const stripeOk = !!(process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes('sk_test_...'));
  res.json({
    status:        'ok',
    version:       '2.0.0',
    supabase:      configured,
    supabase_url:  SUPABASE_URL  || null,
    supabase_anon: ANON_KEY      || null,
    stripe:        stripeOk,
    stripe_pk:     process.env.STRIPE_PUBLISHABLE_KEY || null,
  });
});

// ── SPA fallback ───────────────────────────────────────────
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));

// ── Error handler ──────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Fichier trop grand (max 8MB)' });
  console.error('Server error:', err.message);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`\n  ✦ Belle Heure API v2.0`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  → Supabase : ${configured ? '✓ connecté' : '✗ mode démo'}`);
  console.log(`  → Stripe   : ${process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes('sk_test_...') ? '✓ configuré' : '⚠ mode démo'}\n`);
});

module.exports = app;
