import { checkCredentials, sessionCookie, clearCookie, isAuthed, json } from './_lib/auth.js';

export function GET(request) {
  return json({ ok: isAuthed(request) });
}

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  if (!checkCredentials(body.user, body.pass)) {
    await new Promise(r => setTimeout(r, 800)); // slow down guessing
    return json({ error: 'Usuario o contraseña incorrectos' }, 401);
  }
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie() });
}

export function DELETE() {
  return json({ ok: true }, 200, { 'set-cookie': clearCookie() });
}
