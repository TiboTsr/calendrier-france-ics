'use strict';

const GENERATED_DATA_REPO = process.env.GENERATED_DATA_REPO || 'TiboTsr/calendrier-france-ics';
const GENERATED_DATA_BRANCH = process.env.GENERATED_DATA_BRANCH || 'data';
const RAW_BASE = 'https://raw.githubusercontent.com/' + GENERATED_DATA_REPO + '/' + GENERATED_DATA_BRANCH;
const CACHE_SHORT = 'public, s-maxage=300, stale-while-revalidate=3600';
const CACHE_ICS = 'public, s-maxage=3600, stale-while-revalidate=86400';

function isAllowedFile(name) {
  return /^(calendrier(?:-[a-z]+)?\.ics|zone-[abc]\.ics|calendrier\.json|events-meta\.json|calendrier\.csv|calendrier\.xml|sitemap\.xml)$/i.test(name || '');
}

function contentTypeFor(name) {
  if (name.endsWith('.ics')) return 'text/calendar; charset=utf-8';
  if (name.endsWith('.json')) return 'application/json; charset=utf-8';
  if (name.endsWith('.xml')) return 'application/xml; charset=utf-8';
  if (name.endsWith('.csv')) return 'text/csv; charset=utf-8';
  return 'application/octet-stream';
}

module.exports = async (req, res) => {
  const name = decodeURIComponent(req.query.name || '');

  if (!isAllowedFile(name)) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }

  const upstream = await fetch(RAW_BASE + '/' + name, {
    headers: {
      'User-Agent': 'calendrier-fr-generated-proxy'
    }
  });

  if (!upstream.ok) {
    res.statusCode = upstream.status;
    res.end('Upstream fetch failed for ' + name);
    return;
  }

  res.setHeader('Content-Type', contentTypeFor(name));
  res.setHeader('Cache-Control', name.endsWith('.ics') ? CACHE_ICS : CACHE_SHORT);

  const etag = upstream.headers.get('etag');
  const lastModified = upstream.headers.get('last-modified');
  if (etag) res.setHeader('ETag', etag);
  if (lastModified) res.setHeader('Last-Modified', lastModified);

  const body = Buffer.from(await upstream.arrayBuffer());
  res.statusCode = 200;
  res.end(body);
};
