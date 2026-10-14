// 1:1 voice calls. Signalling is offer/answer through the calls table
// (non-trickle ICE: each side sends its SDP after gathering candidates).
// Both sides heartbeat while connected; a silent side ends the call.
import { Ctx, Row, fail, intId, limit, ok, publicMember, readJson, requireMe, sql, text } from './core';
import { membership } from './chats';
import { blockState } from './social';

const RING_SECONDS = 45;
const HEARTBEAT_SECONDS = 30;

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

async function logCall(callId: number) {
  const rows = await sql`
    UPDATE calls SET logged = true
     WHERE id = ${callId} AND logged = false AND status IN ('ended', 'missed', 'declined', 'cancelled', 'failed')
     RETURNING *`;
  const c = rows[0] as Row | undefined;
  if (!c) return;
  const dur = c.answered_at && c.ended_at ? Math.max(0, new Date(c.ended_at).getTime() - new Date(c.answered_at).getTime()) : 0;
  await sql`INSERT INTO messages (conversation_id, sender_id, kind, body, duration_ms, created_at)
            VALUES (${c.conversation_id}, ${c.caller_id}, 'call', ${c.status}, ${dur}, ${c.created_at})`;
}

async function sweep() {
  const missed = await sql`
    UPDATE calls SET status = 'missed', ended_at = now()
     WHERE status = 'ringing' AND created_at < now() - make_interval(secs => ${RING_SECONDS}::int) RETURNING id`;
  const dropped = await sql`
    UPDATE calls SET status = 'ended', ended_at = now()
     WHERE status = 'active'
       AND (COALESCE(caller_seen_at, answered_at) < now() - make_interval(secs => ${HEARTBEAT_SECONDS}::int)
         OR COALESCE(callee_seen_at, answered_at) < now() - make_interval(secs => ${HEARTBEAT_SECONDS}::int))
     RETURNING id`;
  for (const r of [...missed, ...dropped] as Row[]) await logCall(r.id);
}

function serialize(c: Row, meId: number, peer: Row | null) {
  const caller = c.caller_id === meId;
  return {
    id: c.id as number,
    conversationId: c.conversation_id as number,
    direction: caller ? 'outgoing' : 'incoming',
    status: c.status as string,
    peer: publicMember(peer),
    offer: !caller ? (c.offer as string) || null : null,
    answer: caller ? (c.answer as string) || null : null,
    createdAt: iso(c.created_at),
    answeredAt: iso(c.answered_at),
    endedAt: iso(c.ended_at),
    durationSec:
      c.answered_at && c.ended_at ? Math.round((new Date(c.ended_at).getTime() - new Date(c.answered_at).getTime()) / 1000) : 0,
  };
}

async function loadCall(id: number, meId: number) {
  const rows = await sql`
    SELECT c.*, row_to_json(a.*) AS peer FROM calls c
      JOIN app_members a ON a.id = CASE WHEN c.caller_id = ${meId} THEN c.callee_id ELSE c.caller_id END
     WHERE c.id = ${id} AND (c.caller_id = ${meId} OR c.callee_id = ${meId})`;
  if (!rows.length) fail(404, 'Call not found.');
  return rows[0] as Row;
}

export async function iceServers({ req }: Ctx) {
  await requireMe(req);
  const servers: Array<Record<string, unknown>> = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];
  if (process.env.TURN_URLS) {
    servers.push({ urls: process.env.TURN_URLS.split(','), username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  } else {
    // Free public relay used as a fallback when a direct connection is impossible.
    servers.push({
      urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    });
  }
  return ok({ iceServers: servers });
}

export async function startCall({ req }: Ctx) {
  const me = await requireMe(req);
  await limit(`call:${me.id}`, 15, 600, 'Too many calls. Please wait a few minutes.');
  const b = await readJson(req, 512 * 1024);
  const cid = intId(b.conversationId, 'chat');
  const cm = await membership(cid, me.id);
  if (cm.type !== 'direct') fail(400, 'Voice calls work in one-to-one chats.');
  const offer = text(b.offer, 'Offer', { max: 200_000, trim: false });
  const others = await sql`SELECT a.* FROM conversation_members x JOIN app_members a ON a.id = x.member_id WHERE x.conversation_id = ${cid} AND x.member_id <> ${me.id}`;
  const peer = others[0] as Row | undefined;
  if (!peer) fail(400, 'This account no longer exists.');
  const bs = await blockState(me.id, peer.id);
  if (bs.iBlocked) fail(403, 'Unblock this contact to call them.');
  if (bs.blockedMe) fail(403, "You can't call this contact.");
  await sweep();
  const busy = await sql`
    SELECT 1 FROM calls WHERE status IN ('ringing', 'active')
       AND (caller_id = ${peer.id} OR callee_id = ${peer.id} OR caller_id = ${me.id} OR callee_id = ${me.id}) LIMIT 1`;
  if (busy.length) fail(409, `${peer.display_name} is on another call.`);
  const rows = await sql`
    INSERT INTO calls (conversation_id, caller_id, callee_id, status, offer, caller_seen_at)
    VALUES (${cid}, ${me.id}, ${peer.id}, 'ringing', ${offer}, now()) RETURNING *`;
  return ok({ call: serialize(rows[0], me.id, peer) }, 201);
}

export async function incomingCall({ req }: Ctx) {
  const me = await requireMe(req);
  await sweep();
  const rows = await sql`
    SELECT c.*, row_to_json(a.*) AS peer FROM calls c JOIN app_members a ON a.id = c.caller_id
     WHERE c.callee_id = ${me.id} AND c.status = 'ringing'
       AND c.created_at > now() - make_interval(secs => ${RING_SECONDS}::int)
     ORDER BY c.id DESC LIMIT 1`;
  if (!rows.length) return ok({ call: null });
  const c = rows[0] as Row;
  const call = serialize(c, me.id, c.peer);
  return ok({ call: { ...call, offer: null } });
}

export async function getCall({ req, p }: Ctx) {
  const me = await requireMe(req);
  const id = intId(p.id, 'call');
  await sweep();
  let c = await loadCall(id, me.id);
  if (c.status === 'active' || c.status === 'ringing') {
    if (c.caller_id === me.id) await sql`UPDATE calls SET caller_seen_at = now() WHERE id = ${id}`;
    else await sql`UPDATE calls SET callee_seen_at = now() WHERE id = ${id}`;
    c = await loadCall(id, me.id);
  }
  return ok({ call: serialize(c, me.id, c.peer) });
}

export async function answerCall({ req, p }: Ctx) {
  const me = await requireMe(req);
  const id = intId(p.id, 'call');
  const b = await readJson(req, 512 * 1024);
  const answer = text(b.answer, 'Answer', { max: 200_000, trim: false });
  const rows = await sql`
    UPDATE calls SET status = 'active', answer = ${answer}, answered_at = now(), callee_seen_at = now()
     WHERE id = ${id} AND callee_id = ${me.id} AND status = 'ringing' RETURNING id`;
  if (!rows.length) fail(409, 'This call has already ended.');
  const c = await loadCall(id, me.id);
  return ok({ call: serialize(c, me.id, c.peer) });
}

export async function endCall({ req, p }: Ctx) {
  const me = await requireMe(req);
  const id = intId(p.id, 'call');
  const b = await readJson(req);
  const failed = b.reason === 'failed';
  await sql`
    UPDATE calls SET
      status = CASE
        WHEN status = 'ringing' AND ${failed} THEN 'failed'
        WHEN status = 'ringing' AND caller_id = ${me.id} THEN 'cancelled'
        WHEN status = 'ringing' THEN 'declined'
        WHEN status = 'active' THEN 'ended'
        ELSE status END,
      ended_at = COALESCE(ended_at, now()),
      ended_by = COALESCE(ended_by, ${me.id})
     WHERE id = ${id} AND (caller_id = ${me.id} OR callee_id = ${me.id})`;
  await logCall(id);
  const c = await loadCall(id, me.id);
  return ok({ call: serialize(c, me.id, c.peer) });
}

export async function callHistory({ req }: Ctx) {
  const me = await requireMe(req);
  await sweep();
  const rows = await sql`
    SELECT c.*, row_to_json(a.*) AS peer FROM calls c
      JOIN app_members a ON a.id = CASE WHEN c.caller_id = ${me.id} THEN c.callee_id ELSE c.caller_id END
     WHERE c.caller_id = ${me.id} OR c.callee_id = ${me.id}
     ORDER BY c.id DESC LIMIT 100`;
  return ok({ calls: (rows as Row[]).map((c) => serialize(c, me.id, c.peer)).map(({ offer, answer, ...rest }) => rest) });
}
