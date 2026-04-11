const crypto = require('crypto');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET;

if (!ADMIN_PASSWORD) {
  throw new Error('Missing required environment variable: ADMIN_PASSWORD');
}
if (!ADMIN_SESSION_SECRET) {
  throw new Error('Missing required environment variable: ADMIN_SESSION_SECRET');
}


function generateSessionToken() {
  return crypto
    .createHmac('sha256', ADMIN_SESSION_SECRET)
    .update('admin_session')
    .digest('hex');
}

function verifyAdminSession(req) {
  const cookie = req.headers.cookie || '';
  const sessionMatch = cookie.match(/admin_session=([^;]+)/);
  if (!sessionMatch) return false;

  const sessionToken = sessionMatch[1];
  const expectedToken = generateSessionToken();

  return sessionToken === expectedToken;
}

async function handleLogin(req, res, password) {
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }

  const sessionToken = generateSessionToken();
  const maxAge = 7 * 24 * 60 * 60;

  res.setHeader(
    'Set-Cookie',
    `admin_session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`
  );

  res.status(200).json({ success: true, message: 'Authentification réussie' });
}

async function handleLogout(req, res) {
  res.setHeader(
    'Set-Cookie',
    'admin_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'
  );

  res.status(200).json({ success: true, message: 'Déconnecté' });
}

async function handleMe(req, res) {
  if (!verifyAdminSession(req)) {
    return res.status(401).json({ error: 'Non authentifié' });
  }

  res.status(200).json({ authenticated: true, user: 'admin' });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000, https://calendrier-fr.tibotsr.dev');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action || 'login';

  if (action === 'login' && req.method === 'POST') {
    const { password } = req.body || {};
    return handleLogin(req, res, password);
  }

  if (action === 'logout' && req.method === 'POST') {
    return handleLogout(req, res);
  }

  if (action === 'me' && req.method === 'GET') {
    return handleMe(req, res);
  }

  res.status(400).json({ error: 'Action non définie' });
};
