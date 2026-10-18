import { randomBytes } from 'node:crypto';
import { isAuthed, json } from './_lib/auth.js';
import { PREFIX } from './_lib/store.js';
import { readRecord, writeRecord, deleteRecord, readAllRecords } from './_lib/records.js';

// Quote requests sent from the site's quote form, and the estimates built for them in /panel
const QUOTES = PREFIX + 'cotizaciones-data';
const SETTINGS = PREFIX + 'cotizaciones-ajustes';
const MAX_ITEMS = 30;

export const DEFAULT_SETTINGS = {
  business: '12 Voltec',
  phone: '+1 (520) 979-4376',
  email: 'DsAudio17@gmail.com',
  instagram: 'audio_ds',
  facebook: 'DsAudio',
  validDays: 15,
  taxRate: 8,
  warranty:
    'At 12 Voltec, we are committed to providing our clients with professional, high-quality service in every project we undertake. Therefore, our warranty applies exclusively to the installation of the audio system carried out by our technical team, ensuring that the work is performed correctly and safely.\n\n' +
    'It is important to note that the warranty does not cover products or equipment purchased by the client, as these are protected by the warranty provided by the manufacturer or authorized distributor. In the event that a product presents a manufacturing defect, it will be the client’s responsibility to manage the claim directly with the corresponding supplier.\n\n' +
    'In this way, we guarantee full support for our installation work, always maintaining transparency and professionalism in our relationship with clients.',
};

const text = (v, max) => String(v ?? '').trim().slice(0, max);
const ownBlob = url => typeof url === 'string' && /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//.test(url);
const sameOrigin = req => { const o = req.headers.get('origin'); return !o || new URL(o).host === new URL(req.url).host; };
const validId = id => /^[a-z0-9]{12}$/.test(id || '');
// Tax percentage, 0–30 with up to 3 decimals (e.g. 8 or 8.7)
const rate = (v, fallback) => {
  const n = Number(v);
  return v === '' || v == null || !Number.isFinite(n) ? fallback : Math.max(0, Math.min(30, Math.round(n * 1000) / 1000));
};

// Optional text-message alert to the shop (works once Twilio is configured in Vercel)
async function notifySms(q) {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM: from, NOTIFY_SMS_TO: to } = process.env;
  if (!sid || !token || !from || !to) return;
  const car = [q.year, q.make, q.model].filter(Boolean).join(' ');
  const body = ['Nueva cotización 12 Voltec', q.name && `Cliente: ${q.name}`, q.phone && `Tel: ${q.phone}`,
    car && `Vehículo: ${car}`, q.service && `Servicio: ${q.service}`, q.work && `Trabajo: ${q.work.slice(0, 160)}`,
    'Ver en: https://12voltec.com/panel#cotizaciones'].filter(Boolean).join('\n');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  if (!res.ok) console.error('SMS failed', res.status, await res.text());
}

// Public: the quote form sends the request here as well as to WhatsApp
export async function POST(request) {
  if (!sameOrigin(request)) return json({ error: 'Forbidden' }, 403);
  let b;
  try { b = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const q = {
    id: randomBytes(9).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').padEnd(12, '0').slice(0, 12),
    createdAt: new Date().toISOString(),
    status: 'nueva',
    lang: b.lang === 'es' ? 'es' : 'en',
    name: text(b.name, 80), phone: text(b.phone, 30),
    service: text(b.service, 80), work: text(b.work, 500),
    year: text(b.year, 4), make: text(b.make, 40), model: text(b.model, 60),
    dash: ownBlob(b.dash) ? b.dash : '', door: ownBlob(b.door) ? b.door : '',
    estimate: null,
  };
  if (!q.name && !q.phone && !q.service && !q.work && !q.year && !q.make && !q.model && !q.dash && !q.door) {
    return json({ error: 'Empty' }, 400);
  }
  try {
    await writeRecord(`${QUOTES}/${q.id}`, q);
    await notifySms(q).catch(e => console.error(e));
    return json({ ok: true, id: q.id });
  } catch (e) {
    console.error(e);
    return json({ error: 'Save failed' }, 500);
  }
}

// Panel: all quote requests (newest first) and the PDF business details
export async function GET(request) {
  if (!isAuthed(request)) return json({ error: 'Sesión expirada. Vuelve a iniciar sesión.' }, 401);
  try {
    const [quotes, settings] = await Promise.all([readAllRecords(QUOTES), readRecord(SETTINGS)]);
    quotes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return json({ quotes, settings: { ...DEFAULT_SETTINGS, ...(settings || {}) } });
  } catch (e) {
    console.error(e);
    return json({ error: 'No se pudieron cargar las cotizaciones' }, 500);
  }
}

function cleanEstimate(e) {
  if (!e || typeof e !== 'object') return null;
  const items = (Array.isArray(e.items) ? e.items : []).slice(0, MAX_ITEMS).map(it => ({
    desc: text(it?.desc, 80),
    part: !!it?.part,
    qty: Math.max(0, Math.min(9999, Number(it?.qty) || 0)),
    price: Math.max(0, Math.min(1e6, Math.round((Number(it?.price) || 0) * 100) / 100)),
  }));
  return { job: text(e.job, 120), items, taxRate: rate(e.taxRate, DEFAULT_SETTINGS.taxRate), notes: text(e.notes, 400) };
}

// Panel: save an estimate (or the PDF business details with ?settings)
export async function PUT(request) {
  if (!isAuthed(request)) return json({ error: 'Sesión expirada. Vuelve a iniciar sesión.' }, 401);
  const url = new URL(request.url);
  let b;
  try { b = await request.json(); } catch { return json({ error: 'Datos inválidos' }, 400); }
  try {
    if (url.searchParams.has('settings')) {
      const s = {
        business: text(b.business, 40) || DEFAULT_SETTINGS.business,
        phone: text(b.phone, 30), email: text(b.email, 80), instagram: text(b.instagram, 40), facebook: text(b.facebook, 40),
        validDays: Math.max(1, Math.min(365, parseInt(b.validDays, 10) || 15)),
        taxRate: rate(b.taxRate, DEFAULT_SETTINGS.taxRate),
        warranty: text(b.warranty, 3000),
      };
      return json(await writeRecord(SETTINGS, s));
    }
    const id = url.searchParams.get('id');
    if (!validId(id)) return json({ error: 'Cotización inválida' }, 400);
    const q = await readRecord(`${QUOTES}/${id}`);
    if (!q) return json({ error: 'La cotización ya no existe' }, 404);
    const saved = {
      ...q,
      name: text(b.name, 80), phone: text(b.phone, 30),
      year: text(b.year, 4), make: text(b.make, 40), model: text(b.model, 60),
      status: ['nueva', 'cotizada', 'archivada'].includes(b.status) ? b.status : q.status,
      estimate: cleanEstimate(b.estimate),
      updatedAt: new Date().toISOString(),
    };
    return json(await writeRecord(`${QUOTES}/${id}`, saved));
  } catch (e) {
    console.error(e);
    return json({ error: 'No se pudo guardar. Intenta de nuevo.' }, 500);
  }
}

export async function DELETE(request) {
  if (!isAuthed(request)) return json({ error: 'Sesión expirada. Vuelve a iniciar sesión.' }, 401);
  const id = new URL(request.url).searchParams.get('id');
  if (!validId(id)) return json({ error: 'Cotización inválida' }, 400);
  try { await deleteRecord(`${QUOTES}/${id}`); return json({ ok: true }); }
  catch (e) { console.error(e); return json({ error: 'No se pudo eliminar' }, 500); }
}
