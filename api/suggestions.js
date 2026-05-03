const { Redis } = require('@upstash/redis');
const crypto = require('crypto');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET;
const SUGGESTION_INDEX_KEY = 'suggestions:index';

if (!ADMIN_PASSWORD) {
  throw new Error('Missing required environment variable: ADMIN_PASSWORD');
}
if (!ADMIN_SESSION_SECRET) {
  throw new Error('Missing required environment variable: ADMIN_SESSION_SECRET');
}

/**
 * Generate a unique ID for a suggestion
 */
function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Verify admin session from cookie
 */
function verifyAdminSession(req) {
  const cookie = req.headers.cookie || '';
  const sessionMatch = cookie.match(/admin_session=([^;]+)/);
  if (!sessionMatch) return false;

  const sessionToken = sessionMatch[1];
  const expectedToken = crypto
    .createHmac('sha256', ADMIN_SESSION_SECRET)
    .update('admin_session')
    .digest('hex');

  return sessionToken === expectedToken;
}

/**
 * Map form fields to suggestion data
 */
function mapFormToSuggestion(body) {
  const suggestion = {
    id: generateId(),
    summary: String(body.title || '(sans titre)').trim(),
    description: String(body.description || '').trim(),
    type: String(body.type || 'autre'),
    email: String(body.email || '').trim(),
    timestamp: body.timestamp || new Date().toISOString(),
    url: String(body.url || ''),
    sourceUrl: String(body.url || ''),
    status: 'pending',
    categories: mapTypeToCategory(String(body.type || 'autre')),
    start: '',
    end: '',
  };
  return suggestion;
}

/**
 * Map type to category array
 */
function mapTypeToCategory(type) {
  const typeMap = {
    bug: ['Bug', 'Technique'],
    correction: ['Correction'],
    ajout: ['Suggestion', 'Nouvelle'],
    suggestion: ['Suggestion'],
    autre: ['Autre'],
  };
  return typeMap[type] || ['Autre'];
}

/**
 * Serialize suggestion for Redis storage
 */
function serializeSuggestion(sugg) {
  return JSON.stringify(sugg);
}

/**
 * Deserialize suggestion from Redis storage
 */
function deserializeSuggestion(json) {
  try {
    return typeof json === 'string' ? JSON.parse(json) : json;
  } catch {
    return null;
  }
}

/**
 * GET /api/suggestions
 * Load suggestions. Admin=1 for authenticated access.
 */
async function handleGet(req, res) {
  try {
    const isAdmin = req.query.admin === '1' && verifyAdminSession(req);
    let keys = [];

    // Primary path: explicit index of suggestion keys
    try {
      const indexed = await redis.lrange(SUGGESTION_INDEX_KEY, 0, 999);
      keys = Array.isArray(indexed) ? indexed.filter(Boolean) : [];
    } catch {
      keys = [];
    }

    // Backward-compatible fallback for older entries
    if (!keys.length) {
      try {
        keys = await redis.keys('suggestion:*');
      } catch {
        keys = [];
      }
    }

    keys = [...new Set(keys)];

    const items = [];
    for (const key of keys || []) {
      const raw = await redis.get(key);
      const sugg = deserializeSuggestion(raw);
      if (sugg) {
        // Don't expose email to non-admin
        if (!isAdmin) delete sugg.email;
        items.push(sugg);
      }
    }

    // Sort by timestamp descending (newest first)
    items.sort((a, b) => {
      const aTime = new Date(a.timestamp || 0).getTime();
      const bTime = new Date(b.timestamp || 0).getTime();
      return bTime - aTime;
    });

    const pending = items.filter(s => String(s.status || 'pending') === 'pending').length;

    res.status(200).json({
      items,
      pending,
      total: items.length,
    });
  } catch (err) {
    console.error('[suggestions] GET error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * POST /api/suggestions
 * Create a new suggestion (public endpoint)
 */
async function handlePost(req, res) {
  try {
    const { title, description, type, email, timestamp, url } = req.body || {};

    // Validate required fields
    if (!title || !description) {
      return res.status(400).json({ error: 'Title et description requis' });
    }

    const suggestion = mapFormToSuggestion({
      title,
      description,
      type,
      email,
      timestamp,
      url,
    });

    // Store in Redis
    const key = `suggestion:${suggestion.id}`;
    await redis.set(key, serializeSuggestion(suggestion), {
      ex: 7776000, // 90 days
    });
    try {
      await redis.lpush(SUGGESTION_INDEX_KEY, key);
      await redis.ltrim(SUGGESTION_INDEX_KEY, 0, 999);
    } catch (indexErr) {
      console.error('[suggestions] index update error:', indexErr);
    }

    res.status(201).json({
      success: true,
      id: suggestion.id,
      message: 'Suggestion enregistrée',
    });
  } catch (err) {
    console.error('[suggestions] POST error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * PATCH /api/suggestions
 * Update suggestion status (admin only)
 */
async function handlePatch(req, res) {
  try {
    // Verify admin
    if (!verifyAdminSession(req)) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    const { id, status } = req.body || {};

    // Validate
    if (!id) {
      return res.status(400).json({ error: 'ID requis' });
    }
    if (!['pending', 'accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Statut invalide' });
    }

    const key = `suggestion:${id}`;
    const raw = await redis.get(key);
    const suggestion = deserializeSuggestion(raw);

    if (!suggestion) {
      return res.status(404).json({ error: 'Proposition non trouvée' });
    }

    suggestion.status = status;
    await redis.set(key, serializeSuggestion(suggestion), {
      ex: 7776000,
    });

    res.status(200).json({
      success: true,
      suggestion,
    });
  } catch (err) {
    console.error('[suggestions] PATCH error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return handleGet(req, res);
  }
  if (req.method === 'POST') {
    return handlePost(req, res);
  }
  if (req.method === 'PATCH') {
    return handlePatch(req, res);
  }

  res.status(405).json({ error: 'Méthode non autorisée' });
};
