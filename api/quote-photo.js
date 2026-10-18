import { put, list, del } from '@vercel/blob';
import { json } from './_lib/auth.js';
import { PREFIX } from './_lib/store.js';
import { readImage, MIME } from './_lib/image.js';

// Photos customers attach to a quote request; the WhatsApp message links to them
const QUOTE_PREFIX = PREFIX + 'cotizaciones/';
const KEEP_DAYS = 90;

// Only accept uploads coming from the site's own quote form
function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || new URL(origin).host === new URL(request.url).host;
}

async function removeOldQuotes() {
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  const { blobs } = await list({ prefix: QUOTE_PREFIX, limit: 1000 });
  const old = blobs.filter(b => new Date(b.uploadedAt).getTime() < cutoff);
  if (old.length) await del(old.map(b => b.url));
}

export async function POST(request) {
  if (!sameOrigin(request)) return json({ error: 'Forbidden' }, 403);
  const img = await readImage(request);
  if (img.error) return json({ error: img.error }, img.status);
  const kind = new URL(request.url).searchParams.get('kind') === 'door' ? 'puerta' : 'tablero';

  try {
    const blob = await put(`${QUOTE_PREFIX}${kind}.${img.ext}`, img.buf, {
      access: 'public', contentType: MIME[img.ext], addRandomSuffix: true,
    });
    // Housekeeping now and then, so old quote photos don't pile up
    if (Math.random() < 0.05) await removeOldQuotes().catch(e => console.error(e));
    return json({ url: blob.url });
  } catch (e) {
    console.error(e);
    return json({ error: 'Upload failed' }, 500);
  }
}
