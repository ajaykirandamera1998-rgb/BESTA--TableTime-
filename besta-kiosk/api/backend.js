/**
 * Private proxy between the kiosk page and the Google Apps Script backend (Vercel serverless function).
 */
const MAX_BODY_CHARS = 20000;

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).send(typeof body === 'string' ? body : JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  const target = process.env.APPS_SCRIPT_URL;
  if (!target) return send(res, 503, { status: 'error', message: 'This service is not available right now.' });

  // Handle CORS Preflight requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Refuse requests from unapproved domains if ALLOWED_ORIGINS is specified
  const origin = req.headers.origin;
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.length && origin && !allowed.includes(origin)) {
    return send(res, 403, { status: 'error', message: 'Not allowed by origin rule.' });
  }

  try {
    let upstream;
    if (req.method === 'GET') {
      const q = req.query || {};
      if (q.action !== 'leaderboard') return send(res, 400, { status: 'error', message: 'Bad request.' });
      const params = new URLSearchParams({ action: 'leaderboard', game: String(q.game || 'orderup').slice(0, 20) });
      upstream = await fetch(target + '?' + params.toString(), { redirect: 'follow' });
    } else if (req.method === 'POST') {
      const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
      if (!raw || raw.length > MAX_BODY_CHARS) return send(res, 413, { status: 'error', message: 'Bad request.' });
      upstream = await fetch(target, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: raw, redirect: 'follow' });
    } else {
      res.setHeader('Allow', 'GET, POST');
      return send(res, 405, { status: 'error', message: 'Not allowed.' });
    }

    const text = await upstream.text();
    try { 
      JSON.parse(text); 
    } catch (e) { 
      return send(res, 502, { status: 'error', message: 'The service is busy. Please try again.' }); 
    }
    return send(res, 200, text);
  } catch (err) {
    console.error('proxy failed: ' + (err && err.message));
    return send(res, 502, { status: 'error', message: 'The service is busy. Please try again.' });
  }
};