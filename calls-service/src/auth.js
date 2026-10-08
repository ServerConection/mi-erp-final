// Autenticación con el MISMO JWT del ERP (JWT_SECRET de erp-shared).
// El usuario entra al ERP, abre "Llamadas WA" y no vuelve a iniciar sesión.
const jwt = require('jsonwebtoken');
const { q } = require('./db');

const CACHE_MS = 60 * 1000; // igual que el ERP: un usuario desactivado pierde acceso en <= 60 s
const cache = new Map();

// ADMINISTRADOR → admin · ASESOR → asesor · resto de perfiles (SUPERVISOR, GERENCIA, ANALISTA…) → supervisor
const roleFromPerfil = p => (p === 'ADMINISTRADOR' ? 'admin' : p === 'ASESOR' ? 'asesor' : 'supervisor');

async function loadAgent(id) {
  const hit = cache.get(id);
  if (hit && hit.exp > Date.now()) return hit.agent;
  const r = await q(
    `SELECT u.id, u.usuario, u.empresa, u.perfil, u.activo,
            trim(coalesce(u.nombres,'') || ' ' || coalesce(u.apellidos,'')) AS name,
            a.account_id, coalesce(a.habilitado, false) AS habilitado
       FROM usuarios u LEFT JOIN calls_agents a ON a.usuario_id = u.id
      WHERE u.id = $1`,
    [id]
  );
  const u = r.rows[0];
  const agent = u && {
    id: u.id, username: u.usuario, name: u.name || u.usuario,
    empresa: (u.empresa || '').toUpperCase(), perfil: (u.perfil || '').toUpperCase(),
    role: roleFromPerfil((u.perfil || '').toUpperCase()),
    active: u.activo === 'SI', account_id: u.account_id, habilitado: u.habilitado,
  };
  cache.set(id, { agent, exp: Date.now() + CACHE_MS });
  return agent;
}

const invalidate = id => cache.delete(Number(id));

// Header "Authorization: Bearer <token del ERP>" o ?token= (para SSE)
async function authenticate(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : req.query.token;
  if (!token) return res.status(401).json({ error: 'Abre este módulo desde el ERP' });
  let decoded;
  try { decoded = jwt.verify(token, process.env.JWT_SECRET); } catch (e) {
    return res.status(401).json({ error: e.name === 'TokenExpiredError' ? 'Tu sesión del ERP expiró, vuelve a ingresar' : 'Sesión inválida' });
  }
  const agent = await loadAgent(decoded.id);
  if (!agent || !agent.active) return res.status(401).json({ error: 'Usuario desactivado en el ERP' });
  req.agent = agent;
  next();
}

const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.agent.role) ? next() : res.status(403).json({ error: 'No tienes permiso para esta sección' });

// Para hacer o contestar llamadas: admin siempre; los demás deben estar habilitados en Configuración → Asesores
const canCall = (req, res, next) =>
  req.agent.role === 'admin' || req.agent.habilitado ? next()
    : res.status(403).json({ error: 'No estás habilitado para llamar. Pide acceso al administrador.' });

module.exports = { authenticate, requireRole, canCall, invalidate };
