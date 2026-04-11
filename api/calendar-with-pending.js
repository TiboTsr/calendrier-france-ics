import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PENDING_PATH = path.join(__dirname, '../../calendar_core/data/pending_events.json');
const CALENDAR_PATH = path.join(__dirname, '../../calendrier.json');

function readPending() {
  try {
    if (!fs.existsSync(PENDING_PATH)) return { events: [] };
    return JSON.parse(fs.readFileSync(PENDING_PATH, 'utf-8'));
  } catch {
    return { events: [] };
  }
}

function readCalendar() {
  try {
    if (!fs.existsSync(CALENDAR_PATH)) return [];
    const data = JSON.parse(fs.readFileSync(CALENDAR_PATH, 'utf-8'));
    return Array.isArray(data) ? data : data.events || [];
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get params
  const { offset = 0, limit = 1000, count } = req.query;
  const offsetNum = parseInt(offset, 10) || 0;
  const limitNum = Math.min(parseInt(limit, 10) || 1000, 1000);

  try {
    // Load both sources
    const calendarEvents = readCalendar();
    const pendingData = readPending();
    
    // Combine: pending events first, then calendar events
    const allEvents = [
      ...pendingData.events.map(e => ({
        ...e,
        summary: `${e.emoji || '📌'} ${e.summary}`,
        start: e.start,
        end: e.end,
        categories: e.categories || [],
        description: e.description || '',
        _pending: true
      })),
      ...calendarEvents
    ];

    if (count === 'true') {
      return res.status(200).json({ total: allEvents.length });
    }

    // Paginate
    const paginatedEvents = allEvents.slice(offsetNum, offsetNum + limitNum);
    return res.status(200).json({
      events: paginatedEvents,
      offset: offsetNum,
      limit: limitNum,
      total: allEvents.length,
      hasMore: offsetNum + limitNum < allEvents.length
    });
  } catch (err) {
    console.error('Calendar with pending error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
