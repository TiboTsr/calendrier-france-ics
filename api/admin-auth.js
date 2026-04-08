'use strict';

const {
  getAdminPassword,
  safeEqual,
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
  applyCors,
  json,
  requireAdminSession,
} = require('./_admin-auth');

module.exports = async function handler(req, res) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url, `https://${req.headers.host}`);
  const action = url.searchParams.get('action') || '';

  if (req.method === 'GET' && action === 'me') {
    if (requireAdminSession(req)) return json(res, 200, { authenticated: true });
    return json(res, 401, { authenticated: false });
  }

  if (req.method === 'POST' && action === 'logout') {
    clearSessionCookie(res);
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && action === 'login') {
    let body;
    try {
      const raw = await new Promise((ok, ko) => {
        let d = '';
        req.on('data', (c) => {
          d += c;
        });
        req.on('end', () => ok(d));
        req.on('error', ko);
      });
      body = JSON.parse(raw || '{}');
    } catch {
      return json(res, 400, { error: 'Corps JSON invalide' });
    }

    try {
      const expected = getAdminPassword();
      const provided = String(body.password || '');
      if (!provided || !safeEqual(provided, expected)) {
        return json(res, 401, { error: 'Mot de passe invalide' });
      }

      const token = createSessionToken();
      setSessionCookie(res, token);
      return json(res, 200, { ok: true });
    } catch (e) {
      return json(res, 500, { error: e.message });
    }
  }

  return json(res, 405, { error: 'Méthode non autorisée' });
};
