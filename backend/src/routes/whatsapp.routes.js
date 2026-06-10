/**
 * Rutas del módulo WhatsApp — ERP
 * Montadas en /api/wa/*
 */
const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { verificarToken } = require('../middleware/auth');

const linesCtrl    = require('../controllers/wa_lines.controller');
const botsCtrl     = require('../controllers/wa_bots.controller');
const campaignsCtrl = require('../controllers/wa_campaigns.controller');
const campMsgCtrl  = require('../controllers/wa_campaign_messages.controller');
const contactsCtrl = require('../controllers/wa_contacts.controller');
const listsCtrl    = require('../controllers/wa_lists.controller');
const templatesCtrl = require('../controllers/wa_templates.controller');
const convsCtrl    = require('../controllers/wa_conversations.controller');
const scheduledCtrl = require('../controllers/wa_scheduled.controller');
const dashboardCtrl = require('../controllers/wa_dashboard.controller');
const statsCtrl    = require('../controllers/wa_stats.controller');

// Upload de archivos multimedia
const uploadsDir = process.env.WA_UPLOADS_DIR || path.join(__dirname, '../../wa_uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename:    (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname)),
  }),
});

// Todas las rutas requieren autenticación
router.use(verificarToken);

// ── LÍNEAS ────────────────────────────────────────────────────
router.get   ('/lines',           linesCtrl.getAll);
router.get   ('/lines/:id',       linesCtrl.getOne);
router.post  ('/lines',           linesCtrl.create);
router.put   ('/lines/:id',       linesCtrl.update);
router.delete('/lines/:id',       linesCtrl.remove);
router.post  ('/lines/:id/connect',    linesCtrl.connect);
router.post  ('/lines/:id/disconnect', linesCtrl.disconnect);
router.get   ('/lines/:id/qr',         linesCtrl.getQR);

// ── BOTS / CHATBOTS ───────────────────────────────────────────
router.get   ('/bots',       botsCtrl.getAll);
router.get   ('/bots/:id',   botsCtrl.getOne);
router.post  ('/bots',       botsCtrl.create);
router.put   ('/bots/:id',   botsCtrl.update);
router.delete('/bots/:id',   botsCtrl.remove);

// ── CAMPAÑAS ──────────────────────────────────────────────────
router.get   ('/campaigns',                   campaignsCtrl.getAll);
router.get   ('/campaigns/:id',               campaignsCtrl.getOne);
router.post  ('/campaigns',                   campaignsCtrl.create);
router.put   ('/campaigns/:id',               campaignsCtrl.update);
router.delete('/campaigns/:id',               campaignsCtrl.remove);
router.post  ('/campaigns/:id/start',         campaignsCtrl.start);
router.post  ('/campaigns/:id/pause',         campaignsCtrl.pause);
router.post  ('/campaigns/:id/resume',        campaignsCtrl.resume);
router.post  ('/campaigns/:id/cancel',        campaignsCtrl.cancel);
router.post  ('/campaigns/:id/retry-failed',  campaignsCtrl.retryFailed);

// Variantes de mensaje
router.get   ('/campaigns/:campaignId/messages',              campMsgCtrl.getAll);
router.post  ('/campaigns/:campaignId/messages',              campMsgCtrl.create);
router.put   ('/campaigns/:campaignId/messages/:messageId',   campMsgCtrl.update);
router.delete('/campaigns/:campaignId/messages/:messageId',   campMsgCtrl.remove);
router.post  ('/campaigns/:campaignId/messages/reorder',      campMsgCtrl.reorder);

// ── CONTACTOS ─────────────────────────────────────────────────
router.get   ('/contacts',      contactsCtrl.getAll);
router.get   ('/contacts/:id',  contactsCtrl.getOne);
router.post  ('/contacts',      contactsCtrl.create);
router.put   ('/contacts/:id',  contactsCtrl.update);
router.delete('/contacts/:id',  contactsCtrl.remove);

// ── LISTAS ────────────────────────────────────────────────────
router.get   ('/lists',                    listsCtrl.getAll);
router.get   ('/lists/:id',                listsCtrl.getOne);
router.post  ('/lists',                    listsCtrl.create);
router.put   ('/lists/:id',                listsCtrl.update);
router.delete('/lists/:id',                listsCtrl.remove);
router.post  ('/lists/:id/items',          listsCtrl.addItem);
router.delete('/lists/:id/items/:itemId',  listsCtrl.removeItem);

// ── PLANTILLAS ────────────────────────────────────────────────
router.get   ('/templates',      templatesCtrl.getAll);
router.get   ('/templates/:id',  templatesCtrl.getOne);
router.post  ('/templates',      templatesCtrl.create);
router.put   ('/templates/:id',  templatesCtrl.update);
router.delete('/templates/:id',  templatesCtrl.remove);

// ── CONVERSACIONES / INBOX ────────────────────────────────────
router.get  ('/conversations',                   convsCtrl.getAll);
router.get  ('/conversations/:id/messages',      convsCtrl.getMessages);
router.post ('/conversations/:id/send',          convsCtrl.sendMessage);
router.post ('/conversations/:id/close',         convsCtrl.close);
router.post ('/conversations/:id/return-to-bot', convsCtrl.returnToBot);

// ── MENSAJES PROGRAMADOS ──────────────────────────────────────
router.get   ('/scheduled',              scheduledCtrl.getAll);
router.post  ('/scheduled',              scheduledCtrl.create);
router.post  ('/scheduled/:id/cancel',   scheduledCtrl.cancel);
router.delete('/scheduled/:id',          scheduledCtrl.remove);

// ── DASHBOARD Y ESTADÍSTICAS ──────────────────────────────────
router.get('/dashboard',                    dashboardCtrl.getSummary);
router.get('/stats/lines',                  statsCtrl.getAllLines);
router.get('/stats/lines/:lineId',          statsCtrl.getByLine);

// ── UPLOAD MULTIMEDIA ─────────────────────────────────────────
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file' });
  res.json({
    success: true,
    data: {
      filename:     req.file.filename,
      originalname: req.file.originalname,
      mimetype:     req.file.mimetype,
      size:         req.file.size,
      url:          `/wa-uploads/${req.file.filename}`,
    }
  });
});

module.exports = router;
