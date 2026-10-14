// Media upload (photos + voice notes) and download with Range support.
// Files are identified by magic bytes; SVG/HTML/scripts are rejected.
import { NextResponse } from 'next/server';
import { Ctx, fail, limit, ok, randomId, requireMe, sniffMime, sql } from './core';

// Hosted functions accept request bodies up to ~4.5 MB.
const MAX_BYTES = 4.4 * 1024 * 1024;

export async function uploadMedia({ req }: Ctx) {
  const me = await requireMe(req);
  await limit(`media:${me.id}`, 40, 600, 'Too many uploads. Please wait a few minutes.');
  const ct = req.headers.get('content-type') || '';
  let buf: Buffer;
  if (ct.includes('multipart/form-data')) {
    const fd = await req.formData();
    const f = fd.get('file');
    if (!f || typeof f === 'string') fail(400, 'No file received.');
    if (f.size > MAX_BYTES) fail(413, 'That file is too big (max 4 MB).');
    buf = Buffer.from(await f.arrayBuffer());
  } else {
    const ab = await req.arrayBuffer();
    if (ab.byteLength > MAX_BYTES) fail(413, 'That file is too big (max 4 MB).');
    buf = Buffer.from(ab);
  }
  if (!buf.length) fail(400, 'The file was empty.');
  const mime = sniffMime(buf);
  if (!mime) fail(415, 'That file type is not supported. Send a photo (JPG, PNG, WEBP, GIF, HEIC) or a voice note.');
  const id = randomId(16);
  await sql`INSERT INTO chat_media (id, owner_id, mime, size_bytes, data)
            VALUES (${id}, ${me.id}, ${mime}, ${buf.length}, decode(${buf.toString('base64')}, 'base64'))`;
  return ok({ id, url: `/api/media/${id}`, mime, size: buf.length }, 201);
}

export async function getMedia({ req, p }: Ctx) {
  const id = p.id || '';
  if (!/^[a-f0-9]{32}$/.test(id)) fail(404, 'Not found.');
  const rows = await sql`SELECT mime, encode(data, 'base64') AS b64 FROM chat_media WHERE id = ${id}`;
  if (!rows.length) fail(404, 'Not found.');
  const buf = Buffer.from(rows[0].b64 as string, 'base64');
  const mime = rows[0].mime as string;
  const headers: Record<string, string> = {
    'Content-Type': mime,
    'Cache-Control': 'private, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Content-Disposition': 'inline',
    'Accept-Ranges': 'bytes',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  };
  const range = req.headers.get('range');
  const m = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : buf.length - Number(m[2]);
    let end = m[1] && m[2] ? Number(m[2]) : buf.length - 1;
    start = Math.max(0, start);
    end = Math.min(buf.length - 1, end);
    if (start > end || start >= buf.length) {
      return new NextResponse(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${buf.length}` } });
    }
    const chunk = buf.subarray(start, end + 1);
    return new NextResponse(new Uint8Array(chunk), {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${buf.length}`, 'Content-Length': String(chunk.length) },
    });
  }
  return new NextResponse(new Uint8Array(buf), { status: 200, headers: { ...headers, 'Content-Length': String(buf.length) } });
}
