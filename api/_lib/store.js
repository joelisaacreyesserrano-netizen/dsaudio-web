import { put, list, del } from '@vercel/blob';

// Keep preview/local data apart from what the live site shows
export const PREFIX = process.env.VERCEL_ENV === 'production' ? 'taller/' : 'taller-dev/';
const DATA_PREFIX = PREFIX + 'data-';
export const PHOTO_PREFIX = PREFIX + 'fotos/';

// The original "Our services" cards; the panel can edit, reorder, add and remove them
const svc = (id, cover, pos, es, en, descEs, descEn, alt) =>
  ({ id, cover, pos, alt, title: { es, en }, desc: { es: descEs, en: descEn }, examples: [] });
export const DEFAULT_SERVICES = [
  svc('radios', 'img/screen.jpg', 'center 45%', 'Radios', 'Radios',
    'Pantallas táctiles con Apple CarPlay, Android Auto y Bluetooth.', 'Touchscreens with Apple CarPlay, Android Auto and Bluetooth.',
    'Apple CarPlay touchscreen radio installed in a Ford Mustang dash'),
  svc('amplificadores', 'img/amplifier.jpg', 'center 70%', 'Amplificadores de 4 y 5 canales', '4 & 5 Channel Amplifiers',
    'Potencia limpia para todo tu sistema, instalada y calibrada.', 'Clean power for your whole system, installed and tuned.',
    'Two amplifiers installed in a vehicle'),
  svc('amplificadores-sub', 'img/sub-amp.jpg', 'center 62%', 'Amplificadores para sub', 'Sub Amplifiers',
    'Potencia dedicada para que el bajo pegue limpio y fuerte.', 'Dedicated power so your bass hits clean and hard.',
    'Dual subwoofer box installed in an SUV cargo area'),
  svc('bocinas', 'img/speakers-door.jpg', 'center 60%', 'Bocinas', 'Speakers',
    'Componentes y coaxiales con claridad real.', 'Component and coaxial upgrades with real clarity.',
    'Upgraded door speaker installed in a Ford Bronco'),
  svc('aislamiento', 'img/sound-damping.jpg', 'center 55%', 'Aislamiento acústico', 'Sound Damping',
    'Menos ruido del camino y vibraciones, mejor sonido adentro.', 'Less road noise and rattles, better sound inside.',
    'Car door interior panel'),
  svc('camaras-reversa', 'img/backup-camera.jpg', 'center 55%', 'Cámaras de reversa', 'Backup Cameras',
    'La vista trasera directo en la pantalla de tu radio.', 'Your rear view, right on your radio screen.',
    'Backup camera view shown on an aftermarket radio screen in a Mustang'),
  svc('camaras-tablero', 'img/dash-cam.jpg', 'center 55%', 'Cámaras de tablero', 'Dash Cams',
    'Delantera y trasera, conectadas con cableado oculto.', 'Front and rear, hardwired with hidden routing.',
    'Dash cam installed on a windshield'),
  svc('radar', 'img/radar-detector.jpg', 'center 35%', 'Radar', 'Radar',
    'Conectados directo y siempre encendidos, sin cables colgando.', 'Hardwired and always on — no cords hanging.',
    'Radar detector mounted on a windshield at night'),
  svc('iluminacion', 'img/lighting.jpg', 'center 60%', 'Iluminación', 'Lighting',
    'Luces ambientales interiores, bajo el auto y en llantas.', 'Ambient interior, underglow and wheel-well lights.',
    'Car interior with red ambient lighting'),
];
export const DEFAULT_COVERS = new Set(DEFAULT_SERVICES.map(s => s.cover));

// Older saves kept only example photos, keyed by service id
function migrateServices(services) {
  if (Array.isArray(services)) return services;
  const examples = services || {};
  return DEFAULT_SERVICES.map(s => ({ ...s, examples: examples[s.id] || [] }));
}

export const DEFAULT_GALLERY = {
  items: [
    { cover: 'img/work-1.jpg', title: '', alt: 'Black Ford Bronco with red lighting in the shop', photos: [] },
    { cover: 'img/work-2.jpg', title: '', alt: 'Kicker amplifier installed under the rear seat', photos: [] },
    { cover: 'img/work-3.jpg', title: '', alt: 'Shelby Mustang with an Apple CarPlay touchscreen radio', photos: [] },
    { cover: 'img/work-4.jpg', title: '', alt: 'Audio processor mounted inside a vehicle panel', photos: [] },
  ],
  // "Satisfied customers" cases shown from the Before & after section
  clients: [],
  // "Our services" cards, each with its own examples page
  services: DEFAULT_SERVICES,
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
  return { ...data, clients: data.clients || [], services: migrateServices(data.services) };
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
    ...gallery.services.flatMap(s => [s.cover, ...s.examples.map(e => e.url)]),
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
