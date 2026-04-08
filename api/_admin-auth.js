'use strict';

const crypto = require('crypto');

const SESSION_COOKIE = 'admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8;

function getSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error('ADMIN_SESSION_SECRET manquant');
  return secret;
}

function getAdminPassword() {
  const pwd = process.env.ADMIN_PASSWORD;
  if (!pwd) throw new Error('ADMIN_PASSWORD manquant');
  return pwd;
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function sign(payloadB64) {
  return base64url(
    crypto
      .createHmac('sha256', getSessionSecret())
      .update(payloadB64)
      .digest()
  );
}

function createSessionToken() {
  const now = Math.floor(Date.now() / 1000);
  const payload = { iat: now, exp: now + SESSION_TTL_SECONDS };
  const payloadB64 = base64url(JSON.stringify(payload));
  const sig = sign(payloadB64);
  return `${payloadB64}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return false;

  const expected = sign(payloadB64);
  if (!safeEqual(sig, expected)) return false;

  try {
    const payloadJson = Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
    const payload = JSON.parse(payloadJson);
    const now = Math.floor(Date.now() / 1000);
    return Number(payload.exp) > now;
  } catch {
    return false;
  }
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  raw.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx <= 0) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function setSessionCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  const secure = isProd ? '; Secure' : '';
  const cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
  res.setHeader('Set-Cookie', cookie);
}

function clearSessionCookie(res) {
  const isProd = process.env.NODE_ENV === 'production';
  const secure = isProd ? '; Secure' : '';
  const cookie = `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
  res.setHeader('Set-Cookie', cookie);
}

function json(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function allowedOrigins(req) {
  const fromEnv = (process.env.ADMIN_ALLOWED_ORIGINS || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  const host = req.headers.host;
  const sameHost = host ? [`https://${host}`, `http://${host}`] : [];
  return new Set([...fromEnv, ...sameHost, 'http://localhost:3000']);
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  const allowed = allowedOrigins(req);

  if (origin && allowed.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
}

function requireAdminSession(req) {
  const cookies = parseCookies(req);
  return verifySessionToken(cookies[SESSION_COOKIE]);
}

module.exports = {
  getAdminPassword,
  safeEqual,
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
  applyCors,
  json,
  requireAdminSession,
};
