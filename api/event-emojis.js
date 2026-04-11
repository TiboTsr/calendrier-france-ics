import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EMOJIS_PATH = path.join(__dirname, '../../calendar_core/data/event_emojis.json');

function readEmojis() {
  try {
    if (!fs.existsSync(EMOJIS_PATH)) return { events: {}, defaults: {} };
    return JSON.parse(fs.readFileSync(EMOJIS_PATH, 'utf-8'));
  } catch {
    return { events: {}, defaults: {} };
  }
}

function writeEmojis(data) {
  fs.writeFileSync(EMOJIS_PATH, JSON.stringify(data, null, 2));
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method === 'GET') {
    const data = readEmojis();
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const data = readEmojis();
    const { name, emoji, type = 'events' } = req.body;
    
    if (!name || !emoji) {
      return res.status(400).json({ error: 'Missing name or emoji' });
    }

    if (!data[type]) data[type] = {};
    data[type][name] = emoji;
    writeEmojis(data);
    return res.status(200).json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
