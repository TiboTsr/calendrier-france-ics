import { readFile, writeFile } from "fs/promises";
import { resolve } from "path";
import crypto from "crypto";

// Verify session from cookie
function verifySession(req) {
  const cookies = Object.fromEntries(
    (req.headers.cookie || "").split("; ").map((c) => c.split("="))
  );
  const sessionToken = cookies.admin_session;
  const secret = process.env.ADMIN_SESSION_SECRET;

  if (!sessionToken || !secret) return false;

  try {
    const [timestamp, hmac] = sessionToken.split(".");
    const expected = crypto
      .createHmac("sha256", secret)
      .update(timestamp)
      .digest("hex");
    return hmac === expected && Date.now() - parseInt(timestamp) < 7 * 86400000; // 7 days
  } catch {
    return false;
  }
}

// Data file mappings
const DATA_SOURCES = {
  sports: "calendar_core/data/sports.json",
  exams: "calendar_core/data/exams.json",
  specials: "calendar_core/data/specials.json",
  elections: "calendar_core/data/elections_override.json",
};

async function loadSourceFile(source) {
  if (!DATA_SOURCES[source]) {
    throw new Error(`Unknown source: ${source}`);
  }

  const filePath = resolve(process.cwd(), DATA_SOURCES[source]);

  try {
    const content = await readFile(filePath, "utf-8");
    const sha = crypto.createHash("sha1").update(content).digest("hex");
    return {
      content, // Return as string (will be parsed on client)
      sha,
      path: DATA_SOURCES[source],
    };
  } catch (e) {
    // File doesn't exist - return empty
    const content = JSON.stringify({ events: [] });
    return {
      content,
      sha: crypto.createHash("sha1").update(content).digest("hex"),
      path: DATA_SOURCES[source],
    };
  }
}

async function saveSourceFile(req, source, content, originalSha) {
  if (!verifySession(req)) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  if (!DATA_SOURCES[source]) {
    throw new Error(`Unknown source: ${source}`);
  }

  const filePath = resolve(process.cwd(), DATA_SOURCES[source]);

  try {
    // Try to parse to validate JSON
    JSON.parse(content);
    await writeFile(filePath, content, "utf-8");
    const sha = crypto.createHash("sha1").update(content).digest("hex");
    return {
      status: 200,
      body: { sha },
    };
  } catch (e) {
    return {
      status: 400,
      body: { error: "Invalid JSON" },
    };
  }
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // GET /api/admin-data?source=sports
  if (req.method === "GET") {
    const { source } = req.query;

    if (!source) {
      return res.status(400).json({ error: "source parameter required" });
    }

    try {
      const data = await loadSourceFile(source);
      return res.status(200).json(data);
    } catch (e) {
      console.error(`[admin-data] Error loading ${source}:`, e.message);
      return res
        .status(500)
        .json({ error: `Failed to load ${source}`, details: e.message });
    }
  }

  // POST /api/admin-data - Save data
  if (req.method === "POST") {
    if (!verifySession(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { source, content, sha } = req.body;

    if (!source || !content) {
      return res
        .status(400)
        .json({ error: "source and content required" });
    }

    try {
      const result = await saveSourceFile(req, source, content, sha);
      return res.status(result.status).json(result.body);
    } catch (e) {
      console.error(`[admin-data] Error saving ${source}:`, e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).json({ error: "Method not allowed" });
}
