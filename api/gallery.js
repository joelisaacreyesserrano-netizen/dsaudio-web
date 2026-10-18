import { isAuthed, json } from './_lib/auth.js';
import { readGallery, writeGallery, isOwnPhoto, DEFAULT_GALLERY } from './_lib/store.js';

const MAX_PHOTOS = 40;

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
  try {
    return json(await writeGallery({ items }));
  } catch (e) {
    console.error(e);
    return json({ error: 'No se pudo guardar. Intenta de nuevo.' }, 500);
  }
}
