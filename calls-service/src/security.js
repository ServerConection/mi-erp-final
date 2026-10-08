// Cifrado de tokens de Meta (AES-256-GCM) — sin dependencias externas
const crypto = require('crypto');

function requireEnv(name, min = 16) {
  const v = process.env[name];
  if (!v || v.length < min) throw new Error(`Falta ${name} (mínimo ${min} caracteres) en variables de entorno`);
  return v;
}

const encKey = () => crypto.createHash('sha256').update(requireEnv('CALLS_ENCRYPTION_KEY')).digest();

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const data = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map(b => b.toString('base64')).join('.');
}

function decrypt(blob) {
  if (!blob) return null;
  const [iv, tag, data] = blob.split('.').map(s => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', encKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

const mask = s => (s ? `••••${String(s).slice(-4)}` : '');

module.exports = { encrypt, decrypt, mask, requireEnv };
