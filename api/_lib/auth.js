import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'vt_session';
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function sign(value) {
  return createHmac('sha256', process.env.SESSION_SECRET || '').update(value).digest('base64url');
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkCredentials(user, pass) {
  const u = process.env.PANEL_USER, p = process.env.PANEL_PASSWORD;
  if (!u || !p || !process.env.SESSION_SECRET) return false;
  // Evaluate both so timing does not reveal which one failed
  const okUser = safeEqual(String(user || '').trim().toLowerCase(), u.toLowerCase());
  const okPass = safeEqual(pass || '', p);
  return okUser && okPass;
}

export function sessionCookie() {
  const exp = String(Math.floor(Date.now() / 1000) + MAX_AGE);
  return `${COOKIE}=${exp}.${sign(exp)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX_AGE}`;
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function isAuthed(request) {
  const raw = request.headers.get('cookie') || '';
  const match = raw.split(/;\s*/).find(c => c.startsWith(COOKIE + '='));
  if (!match) return false;
  const [exp, sig] = match.slice(COOKIE.length + 1).split('.');
  if (!exp || !sig || !process.env.SESSION_SECRET) return false;
  if (!safeEqual(sig, sign(exp))) return false;
  return Number(exp) > Date.now() / 1000;
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}
