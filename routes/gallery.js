const router = require('express').Router();
const multer = require('multer');
const path   = require('path');
const { db } = require('../supabase/client');
const { requireAdmin } = require('../middleware/auth');

const BUCKET = 'gallery';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Image requise')) });

// GET /api/gallery
router.get('/', async (req, res) => {
  try {
    let q = db.from('gallery').select('*').order('created_at', { ascending: false });
    if (req.query.category && req.query.category !== 'all') q = q.eq('category', req.query.category);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/gallery — upload fichier vers Supabase Storage
router.post('/', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const { caption, category } = req.body;
    let public_url = null, storage_path = null;

    if (req.file) {
      const ext = path.extname(req.file.originalname) || '.jpg';
      storage_path = `photos/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
      const { error: upErr } = await db.storage.from(BUCKET).upload(storage_path, req.file.buffer, { contentType: req.file.mimetype });
      if (upErr) throw upErr;
      const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(storage_path);
      public_url = urlData.publicUrl;
    } else if (req.body.url) {
      public_url = req.body.url;
    } else {
      return res.status(400).json({ error: 'Fichier ou URL requis' });
    }

    const { data, error } = await db.from('gallery').insert({ storage_path, public_url, caption: caption || '', category: category || 'general' }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/gallery/url — ajouter par URL externe
router.post('/url', requireAdmin, async (req, res) => {
  try {
    const { url, caption, category } = req.body;
    if (!url) return res.status(400).json({ error: 'URL requise' });
    const { data, error } = await db.from('gallery').insert({ public_url: url, caption: caption || '', category: category || 'general' }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/gallery/:id
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await db.from('gallery').update({ caption: req.body.caption, category: req.body.category }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/gallery/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { data: item } = await db.from('gallery').select('storage_path').eq('id', req.params.id).single();
    if (item?.storage_path) await db.storage.from(BUCKET).remove([item.storage_path]);
    await db.from('gallery').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
