const router = require('express').Router();
const { Resend } = require('resend');
const { requireAdmin } = require('../middleware/auth');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'Belle Heure <contact@trntech.fr>';

// ── Templates ──────────────────────────────────────────────

function tplConfirmation({ clientName, date, heure, service, praticienne, adresse, horaire }) {
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:auto;color:#333">
      <h2 style="color:#b07d62">Votre rendez-vous est confirmé ✓</h2>
      <p>Bonjour <strong>${clientName}</strong>,</p>
      <p>Nous avons bien enregistré votre rendez-vous :</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;background:#f9f5f2;font-weight:600">Soin</td><td style="padding:8px">${service}</td></tr>
        <tr><td style="padding:8px;background:#f9f5f2;font-weight:600">Date</td><td style="padding:8px">${date}</td></tr>
        <tr><td style="padding:8px;background:#f9f5f2;font-weight:600">Heure</td><td style="padding:8px">${heure}</td></tr>
        <tr><td style="padding:8px;background:#f9f5f2;font-weight:600">Praticienne</td><td style="padding:8px">${praticienne}</td></tr>
        <tr><td style="padding:8px;background:#f9f5f2;font-weight:600">Adresse</td><td style="padding:8px">${adresse}</td></tr>
      </table>
      <p style="font-size:13px;color:#888">Pour annuler ou modifier, contactez-nous au moins 24h à l'avance.</p>
      <p style="font-size:13px;color:#888">À très bientôt,<br><strong>L'équipe Belle Heure</strong></p>
    </div>`;
}

function tplAnnulation({ clientName, date, heure, service }) {
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:auto;color:#333">
      <h2 style="color:#c0392b">Votre rendez-vous a été annulé</h2>
      <p>Bonjour <strong>${clientName}</strong>,</p>
      <p>Votre rendez-vous suivant a bien été annulé :</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;background:#fdf2f2;font-weight:600">Soin</td><td style="padding:8px">${service}</td></tr>
        <tr><td style="padding:8px;background:#fdf2f2;font-weight:600">Date</td><td style="padding:8px">${date}</td></tr>
        <tr><td style="padding:8px;background:#fdf2f2;font-weight:600">Heure</td><td style="padding:8px">${heure}</td></tr>
      </table>
      <p>Vous pouvez reprendre rendez-vous quand vous le souhaitez.</p>
      <p style="font-size:13px;color:#888">À bientôt,<br><strong>L'équipe Belle Heure</strong></p>
    </div>`;
}

// ── Fonctions d'envoi (exportées pour appointments.js) ─────

async function sendConfirmation(to, data) {
  try {
    const result = await resend.emails.send({
      from: FROM,
      to,
      subject: `Confirmation — ${data.service} le ${data.date} à ${data.heure}`,
      html: tplConfirmation(data),
    });
    console.log(`[MAILER] ✅ Confirmation envoyée à ${to} — id: ${result.data?.id}`);
  } catch (e) {
    console.error(`[MAILER] ❌ Échec confirmation à ${to} — ${e.message}`);
    throw e;
  }
}

async function sendAnnulation(to, data) {
  try {
    const result = await resend.emails.send({
      from: FROM,
      to,
      subject: `Annulation — ${data.service} le ${data.date} à ${data.heure}`,
      html: tplAnnulation(data),
    });
    console.log(`[MAILER] ✅ Annulation envoyée à ${to} — id: ${result.data?.id}`);
  } catch (e) {
    console.error(`[MAILER] ❌ Échec annulation à ${to} — ${e.message}`);
    throw e;
  }
}
// ── Route de test — admin ──────────────────────────────────

router.post('/test', requireAdmin, async (req, res) => {
  try {
    const { type = 'confirmation', email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requis' });

    const mockData = {
      clientName : 'Marie Dupont',
      service    : 'Soin visage éclat',
      date       : '2025-04-28',
      heure      : '10h30',
      praticienne: 'Sophie',
      adresse    : '12 rue des Fleurs, Paris',
      horaire    : 'Lun–Sam 9h–19h',
    };

    type === 'annulation'
      ? await sendAnnulation(email, mockData)
      : await sendConfirmation(email, mockData);

    res.json({ success: true, type, to: email });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
module.exports.sendConfirmation = sendConfirmation;
module.exports.sendAnnulation   = sendAnnulation;
