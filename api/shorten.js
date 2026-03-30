const { Redis } = require('@upstash/redis');
const crypto = require('crypto');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ALLOWED_HOSTNAME = 'api.calendrier-fr.tibotsr.dev';
const ALLOWED_SCHEMES = ['https:', 'webcal:'];
const MAX_URL_LENGTH = 4096;
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW = 60; // secondes

function validateUrl(raw) {
  if (!raw || typeof raw !== 'string') return { ok: false, reason: 'URL manquante' };
  if (raw.length > MAX_URL_LENGTH) return { ok: false, reason: 'URL trop longue' };

  let parsed;
  try {
    parsed = new URL(raw.replace(/^webcal:\/\//i, 'https://'));
  } catch {
    return { ok: false, reason: 'URL invalide' };
  }

  const scheme = raw.toLowerCase().startsWith('webcal:') ? 'webcal:' : parsed.protocol;
  if (!ALLOWED_SCHEMES.includes(scheme)) return { ok: false, reason: `Schéma non autorisé : ${scheme}` };
  if (parsed.hostname !== ALLOWED_HOSTNAME) return { ok: false, reason: `Domaine non autorisé : ${parsed.hostname}` };
  return { ok: true };
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

async function checkRateLimit(ip) {
  const key = `rl:shorten:${crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16)}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, RATE_LIMIT_WINDOW);
    if (count > RATE_LIMIT_MAX) {
      const ttl = await redis.ttl(key);
      return { allowed: false, remaining: 0, resetIn: ttl };
    }
    return { allowed: true, remaining: RATE_LIMIT_MAX - count };
  } catch {
    return { allowed: true, remaining: -1 };
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const ip = getClientIp(req);
  const rateCheck = await checkRateLimit(ip);

  res.setHeader('X-RateLimit-Limit', String(RATE_LIMIT_MAX));
  res.setHeader('X-RateLimit-Remaining', String(rateCheck.remaining));

  if (!rateCheck.allowed) {
    res.setHeader('Retry-After', String(rateCheck.resetIn || RATE_LIMIT_WINDOW));
    return res.status(429).json({ error: 'Trop de requêtes. Réessayez dans quelques secondes.' });
  }

  try {
    const { fullUrl } = req.body || {};
    const check = validateUrl(fullUrl);
    if (!check.ok) return res.status(400).json({ error: check.reason });

    const shortId = crypto.createHash('sha256').update(fullUrl).digest('hex').slice(0, 6);
    await redis.set(`link:${shortId}`, fullUrl, { ex: 15552000 });
    res.status(200).json({ shortId });
  } catch {
    console.error('[shorten] Erreur serveur Redis');
    res.status(500).json({ error: 'Erreur serveur' });
  }
};