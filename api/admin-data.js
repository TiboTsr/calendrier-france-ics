'use strict';
/**
 * api/admin-data.js
 * GET  /api/admin-data?source=sports|exams|specials|elections
 * POST /api/admin-data  { source, content, sha?, commitMessage? }
 *
 * Env vars requis :
 *   GITHUB_TOKEN   — PAT avec scope contents:write
 *   GITHUB_REPO    — TiboTsr/calendrier-france-ics
 *   GITHUB_BRANCH  — main (défaut)
 */

const SOURCES = {
  sports:    'calendar_core/data/sports.json',
  exams:     'calendar_core/data/exams.json',
  specials:  'calendar_core/data/specials.json',
  elections: 'calendar_core/data/elections_override.json',
};

const GH_API = 'https://api.github.com';

const { applyCors, json, requireAdminSession } = require('./_admin-auth');

function ghHeaders() {
  const tok = process.env.GITHUB_TOKEN;
  if (!tok) throw new Error('GITHUB_TOKEN manquant dans les variables d\'environnement Vercel');
  return {
    Authorization:        `Bearer ${tok}`,
    Accept:               'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type':       'application/json',
    'User-Agent':         'calendrier-fr-admin/1.0',
  };
}
const repo   = () => { const r = process.env.GITHUB_REPO; if (!r) throw new Error('GITHUB_REPO manquant'); return r; };
const branch = () => process.env.GITHUB_BRANCH || 'main';

async function ghGet(path) {
  const url = `${GH_API}/repos/${repo()}/contents/${path}?ref=${branch()}`;
  const res = await fetch(url, { headers: ghHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET ${path} → ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return {
    content: Buffer.from(data.content, 'base64').toString('utf-8'),
    sha:     data.sha,
  };
}

async function ghPut(path, content, sha, message) {
  const url  = `${GH_API}/repos/${repo()}/contents/${path}`;
  const body = { message, content: Buffer.from(content, 'utf-8').toString('base64'), branch: branch() };
  if (sha) body.sha = sha;
  const res = await fetch(url, { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`GitHub PUT ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

function jsonOk(res, data) { return json(res, 200, data); }
function jsonErr(res, code, msg) { return json(res, code, { error: msg }); }

module.exports = async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

  if (!requireAdminSession(req)) {
    return jsonErr(res, 401, 'Non autorisé');
  }

  /* ── GET : lire un fichier ── */
  if (req.method === 'GET') {
    const url    = new URL(req.url, `https://${req.headers.host}`);
    const source = url.searchParams.get('source');
    if (!source || !SOURCES[source])
      return jsonErr(res, 400, `Source invalide. Valeurs : ${Object.keys(SOURCES).join(', ')}`);

    try {
      const file = await ghGet(SOURCES[source]);
      if (!file) {
        // Fichier inexistant → template vide
        return jsonOk(res, { content: JSON.stringify({ events: [] }, null, 2), sha: null, exists: false, path: SOURCES[source] });
      }
      return jsonOk(res, { content: file.content, sha: file.sha, exists: true, path: SOURCES[source] });
    } catch (e) {
      console.error('[admin-data GET]', e.message);
      return jsonErr(res, 500, e.message);
    }
  }

  /* ── POST : écrire un fichier ── */
  if (req.method === 'POST') {
    let body;
    try {
      const raw = await new Promise((ok, ko) => {
        let d = '';
        req.on('data', c => { d += c; });
        req.on('end',  () => ok(d));
        req.on('error', ko);
      });
      body = JSON.parse(raw);
    } catch { return jsonErr(res, 400, 'Corps JSON invalide'); }

    const { source, content, sha, commitMessage } = body;
    if (!source || !SOURCES[source])  return jsonErr(res, 400, `Source invalide : ${source}`);
    if (!content || !content.trim())  return jsonErr(res, 400, 'content vide');

    // Validation JSON légère
    try { JSON.parse(content); } catch { return jsonErr(res, 400, 'Le content n\'est pas du JSON valide'); }

    const msg = commitMessage || `[admin] Mise à jour de ${SOURCES[source]} 🤖`;
    try {
      const result = await ghPut(SOURCES[source], content, sha || null, msg);
      return jsonOk(res, {
        committed:  true,
        sha:        result.content?.sha,
        commitSha:  result.commit?.sha,
        commitUrl:  result.commit?.html_url,
        message:    msg,
      });
    } catch (e) {
      console.error('[admin-data POST]', e.message);
      return jsonErr(res, 500, e.message);
    }
  }

  return jsonErr(res, 405, 'Méthode non autorisée');
};