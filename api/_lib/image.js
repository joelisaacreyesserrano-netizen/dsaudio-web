export const MAX_BYTES = 4 * 1024 * 1024;
const SIGNATURES = { jpg: [0xff, 0xd8, 0xff], png: [0x89, 0x50, 0x4e, 0x47], webp: [0x52, 0x49, 0x46, 0x46] };
export const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

// Returns the file extension if the bytes are a JPG/PNG/WebP image, else undefined
export function sniff(buf) {
  return Object.keys(SIGNATURES).find(ext => SIGNATURES[ext].every((b, i) => buf[i] === b));
}

export async function readImage(request) {
  const buf = new Uint8Array(await request.arrayBuffer());
  if (!buf.length) return { error: 'Archivo vacío', status: 400 };
  if (buf.length > MAX_BYTES) return { error: 'La imagen es demasiado grande', status: 413 };
  const ext = sniff(buf);
  if (!ext) return { error: 'Formato no permitido. Usa JPG, PNG o WebP.', status: 415 };
  return { buf, ext };
}
