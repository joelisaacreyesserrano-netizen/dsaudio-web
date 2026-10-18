import { isAuthed, json } from './_lib/auth.js';
import { readGallery, writeGallery, isOwnPhoto, DEFAULT_GALLERY, DEFAULT_SERVICES, DEFAULT_COVERS } from './_lib/store.js';

const MAX_PHOTOS = 40;
const MAX_CLIENTS = 30;
const MAX_EXAMPLES = 60;
const MAX_SERVICES = 24;

export async function GET(request) {
  try {
    const gallery = await readGallery();
    const fresh = new URL(request.url).searchParams.has('fresh');
    return json(gallery, 200, {
      'cache-control': fresh ? 'no-store' : 'public, max-age=0, s-maxage=15, stale-while-revalidate=300',
    });
  } catch (e) {
    console.error(e);
    return json(DEFAULT_GALLERY, 200, { 'cache-control': 'no-store' });
  }
}

const text = (v, max) => String(v ?? '').trim().slice(0, max);
const validCover = (url, i) => url === DEFAULT_GALLERY.items[i].cover || isOwnPhoto(url);

export async function PUT(request) {
  if (!isAuthed(request)) return json({ error: 'Sesión expirada. Vuelve a iniciar sesión.' }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Datos inválidos' }, 400); }
  if (!Array.isArray(body?.items) || body.items.length !== 4) return json({ error: 'Se esperaban 4 trabajos' }, 400);

  const items = [];
  for (const [i, raw] of body.items.entries()) {
    const it = raw && typeof raw === 'object' ? raw : {};
    if (!validCover(it.cover, i)) return json({ error: `La portada del trabajo ${i + 1} no es válida` }, 400);
    const photos = Array.isArray(it.photos) ? it.photos : [];
    if (photos.length > MAX_PHOTOS) return json({ error: `Máximo ${MAX_PHOTOS} fotos por trabajo` }, 400);
    if (!photos.every(isOwnPhoto)) return json({ error: `Hay una foto inválida en el trabajo ${i + 1}` }, 400);
    items.push({
      cover: it.cover,
      title: text(it.title, 80),
      alt: text(it.alt, 160) || DEFAULT_GALLERY.items[i].alt,
      photos,
    });
  }
  const rawClients = Array.isArray(body.clients) ? body.clients : [];
  if (rawClients.length > MAX_CLIENTS) return json({ error: `Máximo ${MAX_CLIENTS} clientes` }, 400);
  const clients = [];
  for (const [i, raw] of rawClients.entries()) {
    const c = raw && typeof raw === 'object' ? raw : {};
    const vehicle = text(c.vehicle, 80), work = text(c.work, 600);
    if (!vehicle || !work) return json({ error: `Al cliente ${i + 1} le falta el vehículo o la descripción` }, 400);
    if (!isOwnPhoto(c.before) || !isOwnPhoto(c.after)) return json({ error: `Al cliente ${i + 1} le falta la foto de antes o de después` }, 400);
    clients.push({ vehicle, work, before: c.before, after: c.after });
  }

  const rawServices = Array.isArray(body.services) ? body.services : [];
  if (rawServices.length > MAX_SERVICES) return json({ error: `Máximo ${MAX_SERVICES} servicios` }, 400);
  const services = [], ids = new Set();
  for (const [i, raw] of rawServices.entries()) {
    const sv = raw && typeof raw === 'object' ? raw : {};
    const n = i + 1;
    const id = String(sv.id || '');
    if (!/^[a-z0-9-]{1,60}$/.test(id) || ids.has(id)) return json({ error: `El servicio ${n} tiene un identificador inválido` }, 400);
    ids.add(id);
    const title = { es: text(sv.title?.es, 60), en: text(sv.title?.en, 60) };
    if (!title.es) return json({ error: `Al servicio ${n} le falta el título` }, 400);
    if (!DEFAULT_COVERS.has(sv.cover) && !isOwnPhoto(sv.cover)) return json({ error: `Al servicio ${n} le falta la portada` }, 400);
    const examples = Array.isArray(sv.examples) ? sv.examples : [];
    if (examples.length > MAX_EXAMPLES) return json({ error: `Máximo ${MAX_EXAMPLES} ejemplos por servicio` }, 400);
    if (!examples.every(e => e && isOwnPhoto(e.url))) return json({ error: `Hay una foto inválida en el servicio ${n}` }, 400);
    const original = DEFAULT_SERVICES.find(d => d.cover === sv.cover);
    services.push({
      id, cover: sv.cover, title,
      desc: { es: text(sv.desc?.es, 200), en: text(sv.desc?.en, 200) },
      // Framing and alt text only apply to the original photos
      pos: original ? original.pos : '',
      alt: original ? original.alt : '',
      examples: examples.map(e => ({ url: e.url, caption: text(e.caption, 100) })),
    });
  }

  try {
    return json(await writeGallery({ items, clients, services }));
  } catch (e) {
    console.error(e);
    return json({ error: 'No se pudo guardar. Intenta de nuevo.' }, 500);
  }
}
