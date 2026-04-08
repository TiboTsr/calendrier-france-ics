'use strict';

const { requireAdminSession } = require('./_admin-auth');

const GH_API = 'https://api.github.com';
const SUGGESTIONS_PATH = 'calendar_core/data/suggestions.json';
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT = Number(process.env.SUGGESTIONS_MAX_PER_HOUR || 12);
const ipHits = new Map();

function repo() {
  const r = process.env.GITHUB_REPO;
  if (!r) throw new Error('GITHUB_REPO manquant');
  return r;
}

function branch() {
  return process.env.GITHUB_BRANCH || 'main';
}

function ghHeaders() {
  const tok = process.env.GITHUB_TOKEN;
  if (!tok) throw new Error('GITHUB_TOKEN manquant');
  return {
    Authorization: `Bearer ${tok}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'calendrier-fr-suggestions/1.0',
  };
}

function json(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function cors(req, res) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  const allowed = new Set([
    host ? `https://${host}` : '',
    host ? `http://${host}` : '',
    ...(process.env.SUGGESTIONS_ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean),
  ]);
  if (origin && allowed.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function getIp(req) {
  const h = req.headers['x-forwarded-for'];
  if (typeof h === 'string' && h.trim()) return h.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function enforceRateLimit(ip) {
  const now = Date.now();
  const arr = (ipHits.get(ip) || []).filter(ts => now - ts < RATE_WINDOW_MS);
  if (arr.length >= RATE_LIMIT) return false;
  arr.push(now);
  ipHits.set(ip, arr);
  return true;
}

function isIsoDate(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
}

function normalizeCsvArray(input, maxItems, maxLen) {
  const arr = Array.isArray(input) ? input : [];
  const out = arr
    .map(v => String(v || '').trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map(v => v.slice(0, maxLen));
  return [...new Set(out)];
}

function validate(body) {
  const errors = [];
  const summary = String(body.summary || '').trim().slice(0, 140);
  const start = String(body.start || '').trim();
  const end = String(body.end || '').trim();
  const description = String(body.description || '').trim().slice(0, 2000);
  const sourceUrl = String(body.sourceUrl || '').trim().slice(0, 280);
  const email = String(body.email || '').trim().slice(0, 120);
  const website = String(body.website || '').trim();
  const categories = normalizeCsvArray(body.categories, 8, 40);
  const zones = normalizeCsvArray(body.zones, 4, 4).map(z => z.toUpperCase());

  if (!summary || summary.length < 3) errors.push('Titre trop court');
  if (!isIsoDate(start)) errors.push('Date de debut invalide');
  if (end && !isIsoDate(end)) errors.push('Date de fin invalide');
  if (end && start && end < start) errors.push('Date de fin avant debut');
  if (!description || description.length < 10) errors.push('Description trop courte');
  if (website) errors.push('Champ invalide');

  if (sourceUrl) {
    try {
      const u = new URL(sourceUrl);
      if (!['http:', 'https:'].includes(u.protocol)) errors.push('URL source invalide');
    } catch {
      errors.push('URL source invalide');
    }
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Email invalide');
  }

  const allowedZones = new Set(['A', 'B', 'C', 'AM']);
  if (zones.some(z => !allowedZones.has(z))) errors.push('Zones invalides');

  return {
    errors,
    value: { summary, start, end: end || null, description, sourceUrl: sourceUrl || null, email: email || null, categories, zones },
  };
}

async function ghGet(path) {
  const url = `${GH_API}/repos/${repo()}/contents/${path}?ref=${branch()}`;
  const r = await fetch(url, { headers: ghHeaders() });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub GET ${path} -> ${r.status}`);
  const d = await r.json();
  return { sha: d.sha, content: Buffer.from(d.content, 'base64').toString('utf-8') };
}

async function ghPut(path, content, sha, message) {
  const url = `${GH_API}/repos/${repo()}/contents/${path}`;
  const body = {
    message,
    content: Buffer.from(content, 'utf-8').toString('base64'),
    branch: branch(),
  };
  if (sha) body.sha = sha;
  const r = await fetch(url, { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`GitHub PUT ${path} -> ${r.status}`);
  return r.json();
}

async function parseBody(req) {
  const raw = await new Promise((ok, ko) => {
    let d = '';
    req.on('data', c => { d += c; });
    req.on('end', () => ok(d));
    req.on('error', ko);
  });
  try {
    return JSON.parse(raw || '{}');
  } catch {
    throw new Error('JSON invalide');
  }
}

module.exports = async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === 'GET') {
    const url = new URL(req.url, `https://${req.headers.host}`);
    const adminMode = url.searchParams.get('admin') === '1';
    try {
      const file = await ghGet(SUGGESTIONS_PATH);
      if (!file) return json(res, 200, { total: 0, pending: 0, latest: [] });
      const parsed = JSON.parse(file.content);
      const items = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];

      if (adminMode) {
        if (!requireAdminSession(req)) return json(res, 401, { error: 'Non autorise' });
        const full = [...items].reverse().slice(0, 1000);
        const pending = items.filter(x => x.status === 'pending').length;
        return json(res, 200, { total: items.length, pending, items: full });
      }

      const pending = items.filter(x => x.status === 'pending').length;
      const latest = items.slice(-20).reverse().map(x => ({
        id: x.id,
        summary: x.summary,
        start: x.start,
        status: x.status,
        submittedAt: x.submittedAt,
      }));
      return json(res, 200, { total: items.length, pending, latest });
    } catch (e) {
      return json(res, 500, { error: e.message });
    }
  }

  if (req.method === 'POST') {
    const ip = getIp(req);
    if (!enforceRateLimit(ip)) return json(res, 429, { error: 'Trop de propositions, reessayez plus tard.' });

    let body;
    try {
      body = await parseBody(req);
    } catch (e) {
      return json(res, 400, { error: e.message });
    }

    const { errors, value } = validate(body);
    if (errors.length) return json(res, 400, { error: errors[0], details: errors });

    try {
      const file = await ghGet(SUGGESTIONS_PATH);
      let current = { suggestions: [] };
      let sha = null;
      if (file) {
        current = JSON.parse(file.content);
        sha = file.sha;
      }
      if (!Array.isArray(current.suggestions)) current.suggestions = [];

      const id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const suggestion = {
        id,
        status: 'pending',
        submittedAt: new Date().toISOString(),
        ...value,
      };

      current.suggestions.push(suggestion);
      if (current.suggestions.length > 5000) current.suggestions = current.suggestions.slice(-5000);

      const content = JSON.stringify(current, null, 2);
      const msg = `[suggestions] Nouvelle proposition: ${value.summary.slice(0, 60)}`;
      await ghPut(SUGGESTIONS_PATH, content, sha, msg);

      return json(res, 200, { ok: true, id });
    } catch (e) {
      return json(res, 500, { error: e.message });
    }
  }

  if (req.method === 'PATCH') {
    if (!requireAdminSession(req)) return json(res, 401, { error: 'Non autorise' });

    let body;
    try {
      body = await parseBody(req);
    } catch (e) {
      return json(res, 400, { error: e.message });
    }

    const id = String(body.id || '').trim();
    const status = String(body.status || '').trim().toLowerCase();
    const note = String(body.note || '').trim().slice(0, 280);
    const validStatus = new Set(['pending', 'accepted', 'rejected']);
    if (!id) return json(res, 400, { error: 'id requis' });
    if (!validStatus.has(status)) return json(res, 400, { error: 'status invalide' });

    try {
      const file = await ghGet(SUGGESTIONS_PATH);
      if (!file) return json(res, 404, { error: 'Fichier suggestions introuvable' });
      const current = JSON.parse(file.content);
      if (!Array.isArray(current.suggestions)) current.suggestions = [];
      const idx = current.suggestions.findIndex(s => s.id === id);
      if (idx === -1) return json(res, 404, { error: 'Suggestion introuvable' });

      current.suggestions[idx].status = status;
      current.suggestions[idx].reviewedAt = new Date().toISOString();
      if (note) current.suggestions[idx].reviewNote = note;

      const content = JSON.stringify(current, null, 2);
      const msg = `[suggestions] ${status} ${id}`;
      await ghPut(SUGGESTIONS_PATH, content, file.sha, msg);

      return json(res, 200, { ok: true, id, status });
    } catch (e) {
      return json(res, 500, { error: e.message });
    }
  }

  return json(res, 405, { error: 'Methode non autorisee' });
};
