const { kv } = require('@vercel/kv');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const { fullUrl } = req.body;
    if (!fullUrl) return res.status(400).json({ error: 'URL manquante' });

    const shortId = crypto.createHash('sha256').update(fullUrl).digest('hex').slice(0, 6);

    await kv.set(`link:${shortId}`, fullUrl, { ex: 15552000 });

    res.status(200).json({ shortId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur KV' });
  }
};