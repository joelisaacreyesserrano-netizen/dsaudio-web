import { put } from '@vercel/blob';
import { isAuthed, json } from './_lib/auth.js';
import { PHOTO_PREFIX } from './_lib/store.js';

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = { jpg: [0xff, 0xd8, 0xff], png: [0x89, 0x50, 0x4e, 0x47], webp: [0x52, 0x49, 0x46, 0x46] };
const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

function sniff(buf) {
  return Object.keys(TYPES).find(ext => TYPES[ext].every((b, i) => buf[i] === b));
}

export async function POST(request) {
  if (!isAuthed(request)) return json({ error: 'Sesión expirada. Vuelve a iniciar sesión.' }, 401);
  const buf = new Uint8Array(await request.arrayBuffer());
  if (!buf.length) return json({ error: 'Archivo vacío' }, 400);
  if (buf.length > MAX_BYTES) return json({ error: 'La imagen es demasiado grande' }, 413);
  const ext = sniff(buf);
  if (!ext) return json({ error: 'Formato no permitido. Usa JPG, PNG o WebP.' }, 415);

  try {
    const blob = await put(`${PHOTO_PREFIX}foto.${ext}`, buf, {
      access: 'public', contentType: MIME[ext], addRandomSuffix: true,
      cacheControlMaxAge: 60 * 60 * 24 * 365,
    });
    return json({ url: blob.url });
  } catch (e) {
    console.error(e);
    return json({ error: 'No se pudo subir la imagen' }, 500);
  }
}
