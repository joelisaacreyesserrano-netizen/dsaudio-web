import { put, list, del } from '@vercel/blob';

// Small JSON records in Blob. Every write creates a new file under the record's
// folder and removes the older ones, so a read never gets a stale CDN copy.

export async function listAll(prefix) {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}

const newest = files => files.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))[0];

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('No se pudo leer ' + url);
  return res.json();
}

export async function readRecord(folder) {
  const file = newest(await listAll(folder + '/'));
  return file ? fetchJSON(file.url) : null;
}

export async function writeRecord(folder, data) {
  const before = await listAll(folder + '/');
  await put(`${folder}/${Date.now()}.json`, JSON.stringify(data), {
    access: 'public', contentType: 'application/json', addRandomSuffix: false,
  });
  if (before.length) await del(before.map(b => b.url));
  return data;
}

export async function deleteRecord(folder) {
  const files = await listAll(folder + '/');
  if (files.length) await del(files.map(b => b.url));
}

// Reads the newest version of every record under a parent folder
export async function readAllRecords(parent, limit = 300) {
  const byId = new Map();
  for (const b of await listAll(parent + '/')) {
    const id = b.pathname.slice(parent.length + 1).split('/')[0];
    const cur = byId.get(id);
    if (!cur || new Date(b.uploadedAt) > new Date(cur.uploadedAt)) byId.set(id, b);
  }
  const latest = [...byId.values()]
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
    .slice(0, limit);
  const out = await Promise.all(latest.map(b => fetchJSON(b.url).catch(() => null)));
  return out.filter(Boolean);
}
