import { readFileSync } from 'fs';
import { join } from 'path';

const calPath = join(process.cwd(), 'calendrier.json');
const CHUNK_SIZE = 500;

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  const { offset = 0, limit = CHUNK_SIZE, count = false } = req.query;

  try {
    const content = readFileSync(calPath, 'utf8');
    const data = JSON.parse(content);
    const allEvents = Array.isArray(data?.events) ? data.events : [];

    if (count === 'true') {
      return res.status(200).json({ total: allEvents.length });
    }

    const start = parseInt(offset, 10) || 0;
    const pageSize = Math.min(parseInt(limit, 10) || CHUNK_SIZE, 1000);
    const end = start + pageSize;
    const events = allEvents.slice(start, end);

    res.status(200).json({
      events,
      offset: start,
      limit: pageSize,
      total: allEvents.length,
      hasMore: end < allEvents.length,
    });
  } catch (err) {
    console.error('[calendar] Error:', err.message);
    res.status(500).json({ error: 'Failed to load calendar' });
  }
}
