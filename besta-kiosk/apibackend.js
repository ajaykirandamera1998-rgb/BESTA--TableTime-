export default async function handler(req, res) {
  // CORS headers allowing requests from your frontend domain
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Respond to preflight requests immediately
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const appsScriptUrl = process.env.APPS_SCRIPT_URL;

  if (!appsScriptUrl) {
    return res.status(500).json({ status: 'error', message: 'Backend URL not configured on server.' });
  }

  try {
    let response;
    if (req.method === 'GET') {
      const queryString = new URLSearchParams(req.query).toString();
      const targetUrl = queryString ? `${appsScriptUrl}?${queryString}` : appsScriptUrl;
      response = await fetch(targetUrl, { method: 'GET' });
    } else if (req.method === 'POST') {
      const bodyData = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      response = await fetch(appsScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: bodyData,
      });
    } else {
      return res.status(405).json({ status: 'error', message: 'Method not allowed.' });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error('Vercel proxy error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to communicate with Google Apps Script.' });
  }
}