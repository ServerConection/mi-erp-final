// backend/src/routes/misNegociaciones.routes.js
// ============================================================================
// MIS NEGOCIACIONES — vista de deals de Bitrix (novonet.bitrix24.es) dentro
// del ERP, respetando el RESPONSABLE.
//
//   GET   /api/mis-negociaciones/yo            → a qué usuario Bitrix quedó vinculado
//   GET   /api/mis-negociaciones/embudos       → pipelines (categorías) disponibles
//   GET   /api/mis-negociaciones/etapas?categoria=N
//   GET   /api/mis-negociaciones?categoria=&etapa=&q=&start=&responsable=
//   PATCH /api/mis-negociaciones/:id/etapa      { stageId }
//
// Reglas:
//   - Asesor (cualquier perfil que no sea admin/gerencia): SOLO ve y mueve
//     deals donde ASSIGNED_BY_ID = su usuario Bitrix. El filtro se fuerza en el
//     servidor; lo que mande el navegador no lo puede saltar.
//   - ADMINISTRADOR / GERENCIA / GERENTE: ven todos (opcional ?responsable=ID).
//   - Teléfono completo: ADMINISTRADOR y el propio responsable del deal.
//     Cualquier otro lo ve enmascarado.
//   - Vínculo ERP→Bitrix: por email (= usuario del ERP) y si no, por nombre
//     inequívoco. Nunca adivina: si es ambiguo, no muestra nada.
// ============================================================================

const express = require('express');
const { verificarToken } = require('../middleware/auth');
const { bitrixCallNovonet } = require('../services/bitrix.service');
const { claveNombre, mismaPalabra } = require('../services/asesorMatcher.service');

const router = express.Router();
router.use(verificarToken);
// Solo administradores (pedido 2026-11-03).
router.use((req, res, next) => (/^ADMINISTRADOR(A)?([ _-]|$)/.test(String(req.user?.perfil || '').trim().toUpperCase())
  ? next()
  : res.status(403).json({ success: false, error: 'Módulo solo para administradores.' })));

// ── Perfiles ────────────────────────────────────────────────────────────────
const norm = (v) => String(v || '').trim().toUpperCase();
const esAdmin = (perfil) => /^ADMINISTRADOR(A)?([ _-]|$)/.test(norm(perfil));
const veTodo = (perfil) => esAdmin(perfil) || /^GEREN(CIA|TE)([ _-]|$)/.test(norm(perfil));

// ── Utilidades ──────────────────────────────────────────────────────────────
const enmascarar = (tel) => {
  const d = String(tel || '').replace(/\D/g, '');
  if (d.length < 5) return d ? '****' : '';
  return `${d.slice(0, 3)}****${d.slice(-3)}`;
};

const cache = new Map(); // clave -> { valor, vence }
async function conCache(clave, ttlMs, fn) {
  const hit = cache.get(clave);
  if (hit && hit.vence > Date.now()) return hit.valor;
  const valor = await fn();
  cache.set(clave, { valor, vence: Date.now() + ttlMs });
  return valor;
}

// ── Usuarios Bitrix (cache 10 min) ──────────────────────────────────────────
async function usuariosBitrix() {
  return conCache('usuarios', 10 * 60 * 1000, async () => {
    const todos = [];
    let start = 0;
    for (let pag = 0; pag < 40; pag++) {
      const r = await bitrixCallNovonet('user.get', { FILTER: { ACTIVE: 'Y' }, start });
      const lote = r.result || [];
      for (const u of lote) {
        todos.push({
          id: String(u.ID),
          nombre: [u.NAME, u.LAST_NAME].filter(Boolean).join(' ').trim(),
          email: String(u.EMAIL || '').trim().toLowerCase(),
        });
      }
      if (r.next == null || lote.length < 50) break;
      start = r.next;
    }
    return todos;
  });
}

const tokens = (s) => [...new Set(claveNombre(s).split(' ').filter((x) => x.length > 1))];

// Devuelve { estado, usuario } — nunca elige "el más parecido".
function vincular(reqUser, universo) {
  const login = String(reqUser.usuario || '').trim().toLowerCase();
  if (login.includes('@')) {
    const porEmail = universo.filter((u) => u.email === login);
    if (porEmail.length === 1) return { estado: 'EMAIL', usuario: porEmail[0] };
  }
  const nombre = reqUser.nombreCompleto || '';
  const clave = claveNombre(nombre);
  if (clave) {
    const exactos = universo.filter((u) => claveNombre(u.nombre) === clave);
    if (exactos.length === 1) return { estado: 'EXACTO', usuario: exactos[0] };
    if (exactos.length > 1) return { estado: 'AMBIGUO', usuario: null };
  }
  const origen = tokens(nombre);
  if (origen.length < 2) return { estado: 'NO_ENCONTRADO', usuario: null };
  const candidatos = universo.filter((u) => {
    const destino = tokens(u.nombre);
    const corto = origen.length <= destino.length ? origen : destino;
    const largo = origen.length <= destino.length ? destino : origen;
    return corto.length >= 2 && corto.every((x) => largo.some((y) => mismaPalabra(x, y)));
  });
  if (candidatos.length === 1) return { estado: 'NOMBRE_UNICO', usuario: candidatos[0] };
  return { estado: candidatos.length > 1 ? 'AMBIGUO' : 'NO_ENCONTRADO', usuario: null };
}

async function bitrixDelUsuario(req) {
  const universo = await usuariosBitrix();
  return vincular(req.user, universo);
}

// ── Embudos y etapas (cache 10 min) ─────────────────────────────────────────
async function embudos() {
  return conCache('embudos', 10 * 60 * 1000, async () => {
    const r = await bitrixCallNovonet('crm.dealcategory.list', { order: { SORT: 'ASC' } });
    const lista = (r.result || []).map((c) => ({ id: String(c.ID), nombre: c.NAME }));
    return [{ id: '0', nombre: 'General' }, ...lista];
  });
}

async function etapas(categoria) {
  const cat = String(Number(categoria) || 0);
  return conCache(`etapas:${cat}`, 10 * 60 * 1000, async () => {
    const entity = cat === '0' ? 'DEAL_STAGE' : `DEAL_STAGE_${cat}`;
    const r = await bitrixCallNovonet('crm.status.list', {
      order: { SORT: 'ASC' },
      filter: { ENTITY_ID: entity },
    });
    return (r.result || []).map((s) => ({
      id: s.STATUS_ID,
      nombre: s.NAME,
      color: s.EXTRA?.COLOR || s.COLOR || null,
      semantica: s.EXTRA?.SEMANTICS || s.SEMANTICS || null,
    }));
  });
}

const fallo = (res, err, msg) => {
  console.error(`[mis-negociaciones] ${msg}:`, err.message);
  res.status(502).json({ success: false, error: `${msg}. Bitrix: ${err.message}` });
};

// ── Rutas ───────────────────────────────────────────────────────────────────
router.get('/yo', async (req, res) => {
  try {
    const v = await bitrixDelUsuario(req);
    res.json({
      success: true,
      veTodo: veTodo(req.user.perfil),
      vinculo: v.estado,
      bitrix: v.usuario ? { id: v.usuario.id, nombre: v.usuario.nombre } : null,
    });
  } catch (err) { fallo(res, err, 'No se pudo identificar tu usuario Bitrix'); }
});

router.get('/embudos', async (_req, res) => {
  try { res.json({ success: true, data: await embudos() }); }
  catch (err) { fallo(res, err, 'No se pudieron cargar los embudos'); }
});

router.get('/etapas', async (req, res) => {
  try { res.json({ success: true, data: await etapas(req.query.categoria) }); }
  catch (err) { fallo(res, err, 'No se pudieron cargar las etapas'); }
});

router.get('/responsables', async (req, res) => {
  if (!veTodo(req.user.perfil)) return res.status(403).json({ success: false, error: 'Sin permiso' });
  try {
    const u = await usuariosBitrix();
    res.json({ success: true, data: u.map(({ id, nombre }) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre)) });
  } catch (err) { fallo(res, err, 'No se pudieron cargar los responsables'); }
});

router.get('/', async (req, res) => {
  try {
    const todo = veTodo(req.user.perfil);
    const v = await bitrixDelUsuario(req);
    const miId = v.usuario?.id || null;

    if (!todo && !miId) {
      return res.status(409).json({
        success: false,
        vinculo: v.estado,
        error: v.estado === 'AMBIGUO'
          ? 'Tu nombre coincide con varios usuarios de Bitrix. Pide a sistemas que revise tu nombre en el ERP.'
          : 'No encontramos tu usuario en Bitrix (por email ni por nombre). Pide a sistemas que lo revise.',
      });
    }

    const filter = {};
    if (todo) {
      if (req.query.responsable) filter.ASSIGNED_BY_ID = String(req.query.responsable);
    } else {
      filter.ASSIGNED_BY_ID = miId; // forzado en servidor
    }
    if (req.query.categoria !== undefined && req.query.categoria !== '') filter.CATEGORY_ID = String(Number(req.query.categoria) || 0);
    if (req.query.etapa) filter.STAGE_ID = String(req.query.etapa);
    const q = String(req.query.q || '').trim();
    if (q) {
      if (/^\d+$/.test(q)) filter.ID = q;
      else filter['%TITLE'] = q;
    }

    const r = await bitrixCallNovonet('crm.deal.list', {
      order: { DATE_MODIFY: 'DESC' },
      filter,
      select: ['ID', 'TITLE', 'STAGE_ID', 'CATEGORY_ID', 'CONTACT_ID', 'ASSIGNED_BY_ID',
        'DATE_CREATE', 'DATE_MODIFY', 'OPPORTUNITY', 'CURRENCY_ID', 'SOURCE_ID'],
      start: Math.max(0, Number(req.query.start) || 0),
    });
    const deals = r.result || [];

    // Contactos en un solo llamado
    const idsContacto = [...new Set(deals.map((d) => d.CONTACT_ID).filter((x) => x && x !== '0'))];
    const contactos = new Map();
    if (idsContacto.length) {
      const rc = await bitrixCallNovonet('crm.contact.list', {
        filter: { ID: idsContacto },
        select: ['ID', 'NAME', 'LAST_NAME', 'PHONE', 'EMAIL'],
      });
      for (const c of rc.result || []) contactos.set(String(c.ID), c);
    }

    const usuarios = await usuariosBitrix();
    const nombreUsuario = new Map(usuarios.map((u) => [u.id, u.nombre]));
    const admin = esAdmin(req.user.perfil);

    const data = deals.map((d) => {
      const c = contactos.get(String(d.CONTACT_ID));
      const esDueno = miId && String(d.ASSIGNED_BY_ID) === miId;
      const telefonos = (c?.PHONE || []).map((p) => (admin || esDueno ? p.VALUE : enmascarar(p.VALUE)));
      return {
        id: d.ID,
        titulo: d.TITLE,
        etapa: d.STAGE_ID,
        categoria: String(d.CATEGORY_ID ?? '0'),
        responsableId: String(d.ASSIGNED_BY_ID),
        responsable: nombreUsuario.get(String(d.ASSIGNED_BY_ID)) || `ID ${d.ASSIGNED_BY_ID}`,
        creado: d.DATE_CREATE,
        modificado: d.DATE_MODIFY,
        monto: d.OPPORTUNITY,
        moneda: d.CURRENCY_ID,
        fuente: d.SOURCE_ID,
        contacto: c ? {
          id: c.ID,
          nombre: [c.NAME, c.LAST_NAME].filter(Boolean).join(' ').trim(),
          telefonos,
          email: (c.EMAIL || [])[0]?.VALUE || null,
        } : null,
      };
    });

    res.json({ success: true, data, total: r.total ?? data.length, next: r.next ?? null });
  } catch (err) { fallo(res, err, 'No se pudieron cargar las negociaciones'); }
});

router.patch('/:id/etapa', express.json(), async (req, res) => {
  const id = String(req.params.id || '');
  const stageId = String(req.body?.stageId || '').trim();
  if (!/^\d+$/.test(id) || !stageId) {
    return res.status(400).json({ success: false, error: 'Faltan datos (id de negociación o etapa).' });
  }
  try {
    const rd = await bitrixCallNovonet('crm.deal.get', { id });
    const deal = rd.result;
    if (!deal) return res.status(404).json({ success: false, error: 'Negociación no encontrada.' });

    if (!veTodo(req.user.perfil)) {
      const v = await bitrixDelUsuario(req);
      if (!v.usuario || String(deal.ASSIGNED_BY_ID) !== v.usuario.id) {
        return res.status(403).json({ success: false, error: 'Solo el responsable puede mover esta negociación.' });
      }
    }

    const validas = await etapas(deal.CATEGORY_ID);
    if (!validas.some((s) => s.id === stageId)) {
      return res.status(400).json({ success: false, error: 'La etapa no pertenece al embudo de esta negociación.' });
    }
    if (deal.STAGE_ID === stageId) return res.json({ success: true, sinCambio: true });

    await bitrixCallNovonet('crm.deal.update', {
      id,
      fields: { STAGE_ID: stageId },
      params: { REGISTER_SONET_EVENT: 'Y' },
    });
    console.log(`[mis-negociaciones] deal ${id}: ${deal.STAGE_ID} → ${stageId} por ERP usuario ${req.user.id} (${req.user.usuario})`);
    res.json({ success: true, anterior: deal.STAGE_ID, nueva: stageId });
  } catch (err) { fallo(res, err, 'No se pudo cambiar la etapa'); }
});

module.exports = router;
// Exportado solo para pruebas
module.exports._internos = { vincular, enmascarar, veTodo, esAdmin };
