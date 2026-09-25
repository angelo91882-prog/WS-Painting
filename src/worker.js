/**
 * W&S Painting — Lead Capture Worker
 * Serves static assets and handles POST /api/lead to store leads in D1.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/lead' && request.method === 'POST') {
      return handleLead(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};

async function handleLead(request, env) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const { name, phone, email, service, message } = data;
  const errors = [];

  if (!name || name.trim().length < 2) errors.push('Name is required');
  if (!phone || phone.trim().length < 7) errors.push('Valid phone number is required');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Valid email is required');
  if (!service) errors.push('Service type is required');

  if (errors.length) {
    return json({ error: errors.join('. ') }, 422);
  }

  const clean = (s) => String(s || '').trim().slice(0, 2000);
  const lead = {
    name: clean(name),
    phone: clean(phone),
    email: clean(email),
    service: clean(service),
    message: clean(message),
    ip: request.headers.get('cf-connecting-ip') || '',
    user_agent: (request.headers.get('user-agent') || '').slice(0, 500),
    source: request.headers.get('referer') || '',
  };

  try {
    await env.LEADS_DB.prepare(`
      CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT NOT NULL,
        service TEXT NOT NULL,
        message TEXT,
        ip TEXT,
        user_agent TEXT,
        source TEXT,
        status TEXT DEFAULT 'new',
        created_at TEXT DEFAULT (datetime('now'))
      )
    `).run();

    await env.LEADS_DB.prepare(`
      INSERT INTO leads (name, phone, email, service, message, ip, user_agent, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(lead.name, lead.phone, lead.email, lead.service, lead.message, lead.ip, lead.user_agent, lead.source)
      .run();

    return json({ success: true, message: 'Lead received' }, 200);
  } catch (err) {
    console.error('D1 error:', err);
    return json({ error: 'Unable to save your request. Please try again or call us directly.' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
