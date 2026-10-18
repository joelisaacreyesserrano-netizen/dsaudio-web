import { put } from '@vercel/blob';
import { isAuthed, json } from './_lib/auth.js';
import { PHOTO_PREFIX } from './_lib/store.js';
import { readImage, MIME } from './_lib/image.js';

export async function POST(request) {
  if (!isAuthed(request)) return json({ error: 'Sesión expirada. Vuelve a iniciar sesión.' }, 401);
  const img = await readImage(request);
  if (img.error) return json({ error: img.error }, img.status);

  try {
    const blob = await put(`${PHOTO_PREFIX}foto.${img.ext}`, img.buf, {
      access: 'public', contentType: MIME[img.ext], addRandomSuffix: true,
      cacheControlMaxAge: 60 * 60 * 24 * 365,
    });
    return json({ url: blob.url });
  } catch (e) {
    console.error(e);
    return json({ error: 'No se pudo subir la imagen' }, 500);
  }
}
