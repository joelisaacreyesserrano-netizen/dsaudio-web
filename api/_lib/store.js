import { put, list, del } from '@vercel/blob';

// Keep preview/local data apart from what the live site shows
export const PREFIX = process.env.VERCEL_ENV === 'production' ? 'taller/' : 'taller-dev/';
const DATA_PREFIX = PREFIX + 'data-';
export const PHOTO_PREFIX = PREFIX + 'fotos/';

export const DEFAULT_GALLERY = {
  items: [
    { cover: 'img/work-1.jpg', title: '', alt: 'Black Ford Bronco with red lighting in the shop', photos: [] },
    { cover: 'img/work-2.jpg', title: '', alt: 'Kicker amplifier installed under the rear seat', photos: [] },
    { cover: 'img/work-3.jpg', title: '', alt: 'Shelby Mustang with an Apple CarPlay touchscreen radio', photos: [] },
    { cover: 'img/work-4.jpg', title: '', alt: 'Audio processor mounted inside a vehicle panel', photos: [] },
  ],
  // "Satisfied customers" cases shown from the Before & after section
  clients: [],
};

async function listAll(prefix) {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}

// Each save writes a new data file, so readers never get a stale CDN copy
export async function readGallery() {
  const files = await listAll(DATA_PREFIX);
  if (!files.length) return DEFAULT_GALLERY;
  files.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  const res = await fetch(files[0].url);
  if (!res.ok) throw new Error('No se pudo leer la galería');
  const data = await res.json();
  return { ...data, clients: data.clients || [] };
}

export async function writeGallery(gallery) {
  const before = await listAll(DATA_PREFIX);
  const saved = { ...gallery, updatedAt: new Date().toISOString() };
  await put(`${DATA_PREFIX}${Date.now()}.json`, JSON.stringify(saved), {
    access: 'public', contentType: 'application/json', addRandomSuffix: false,
  });
  if (before.length) await del(before.map(b => b.url));
  await removeUnusedPhotos(saved);
  return saved;
}

// Delete uploaded photos no longer referenced; recent ones may belong to an unsaved edit
async function removeUnusedPhotos(gallery) {
  const used = new Set([
    ...gallery.items.flatMap(i => [i.cover, ...i.photos]),
    ...gallery.clients.flatMap(c => [c.before, c.after]),
  ]);
  const cutoff = Date.now() - 60 * 60 * 1000;
  const stale = (await listAll(PHOTO_PREFIX))
    .filter(b => !used.has(b.url) && new Date(b.uploadedAt).getTime() < cutoff);
  if (stale.length) await del(stale.map(b => b.url));
}

export function isOwnPhoto(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname.endsWith('.public.blob.vercel-storage.com')
      && u.pathname.startsWith('/' + PHOTO_PREFIX);
  } catch { return false; }
}
