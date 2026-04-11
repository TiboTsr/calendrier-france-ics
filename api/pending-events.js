import { Redis } from '@upstash/redis';
import crypto from 'crypto';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET;

if (!ADMIN_PASSWORD) {
  throw new Error('Missing required environment variable: ADMIN_PASSWORD');
}
if (!ADMIN_SESSION_SECRET) {
  throw new Error('Missing required environment variable: ADMIN_SESSION_SECRET');
}

function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

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

async function getPendingEvents() {
  try {
    const keys = await redis.keys('pending:*');
    const events = [];
    
    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        try {
          events.push(typeof data === 'string' ? JSON.parse(data) : data);
        } catch {
          // Skip malformed entries
        }
      }
    }
    
    return { events };
  } catch {
    return { events: [] };
  }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method === 'GET') {
    const data = await getPendingEvents();
    return res.status(200).json(data);
  }

  if (!verifyAdminSession(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'POST') {
    const { summary, start, categories = [], description = '', emoji = '' } = req.body;
    
    if (!summary || !start) {
      return res.status(400).json({ error: 'Missing summary or start date' });
    }

    const id = generateId();
    const event = {
      id,
      summary,
      start,
      categories,
      description,
      emoji,
      createdAt: new Date().toISOString()
    };

    await redis.set(`pending:${id}`, JSON.stringify(event));
    return res.status(201).json(event);
  }

  if (req.method === 'PUT') {
    const { id, summary, start, categories, description, emoji } = req.body;
    
    const existing = await redis.get(`pending:${id}`);
    if (!existing) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const event = {
      id,
      summary,
      start,
      categories,
      description,
      emoji,
      createdAt: typeof existing === 'string' ? JSON.parse(existing).createdAt : existing.createdAt
    };

    await redis.set(`pending:${id}`, JSON.stringify(event));
    return res.status(200).json(event);
  }

  if (req.method === 'DELETE') {
    const { id } = req.body;
    
    await redis.del(`pending:${id}`);
    return res.status(200).json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
