// People: exact-username search (no public directory), friend requests,
// friends list and blocking.
import { Ctx, Row, fail, intId, limit, ok, publicMember, readJson, requireMe, sql, username as usernameOf } from './core';

export async function areFriends(a: number, b: number): Promise<boolean> {
  if (a === b) return true;
  const rows = await sql`
    SELECT 1 FROM friend_requests
     WHERE status = 'accepted'
       AND ((from_id = ${a} AND to_id = ${b}) OR (from_id = ${b} AND to_id = ${a}))
     LIMIT 1`;
  return rows.length > 0;
}

export async function blockState(me: number, other: number) {
  const rows = await sql`
    SELECT blocker_id FROM blocks
     WHERE (blocker_id = ${me} AND blocked_id = ${other}) OR (blocker_id = ${other} AND blocked_id = ${me})`;
  return {
    iBlocked: rows.some((r: Row) => r.blocker_id === me),
    blockedMe: rows.some((r: Row) => r.blocker_id === other),
  };
}

async function relation(me: number, other: number) {
  if (me === other) return { relation: 'self' as const, requestId: null };
  const rows = await sql`
    SELECT id, from_id, status FROM friend_requests
     WHERE ((from_id = ${me} AND to_id = ${other}) OR (from_id = ${other} AND to_id = ${me}))
       AND status IN ('pending', 'accepted')
     ORDER BY (status = 'accepted') DESC, id DESC`;
  const accepted = rows.find((r: Row) => r.status === 'accepted');
  if (accepted) return { relation: 'friend' as const, requestId: accepted.id as number };
  const incoming = rows.find((r: Row) => r.from_id === other);
  if (incoming) return { relation: 'incoming' as const, requestId: incoming.id as number };
  const outgoing = rows.find((r: Row) => r.from_id === me);
  if (outgoing) return { relation: 'outgoing' as const, requestId: outgoing.id as number };
  return { relation: 'none' as const, requestId: null };
}

export async function searchUser({ req, url }: Ctx) {
  const me = await requireMe(req);
  await limit(`search:${me.id}`, 60, 600, 'Too many searches. Please wait a few minutes.');
  const raw = (url.searchParams.get('u') || '').trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(raw)) return ok({ user: null });
  const rows = await sql`SELECT * FROM app_members WHERE lower(username) = ${raw} LIMIT 1`;
  const u = rows[0];
  if (!u) return ok({ user: null });
  const b = await blockState(me.id, u.id);
  if (b.blockedMe) return ok({ user: null });
  const rel = await relation(me.id, u.id);
  return ok({ user: { ...publicMember(u), ...rel, iBlocked: b.iBlocked } });
}

export async function listFriends({ req }: Ctx) {
  const me = await requireMe(req);
  const rows = await sql`
    SELECT fr.id AS request_id, fr.from_id, fr.to_id, fr.status, fr.created_at AS requested_at, a.*
      FROM friend_requests fr
      JOIN app_members a ON a.id = CASE WHEN fr.from_id = ${me.id} THEN fr.to_id ELSE fr.from_id END
     WHERE (fr.from_id = ${me.id} OR fr.to_id = ${me.id}) AND fr.status IN ('pending', 'accepted')
     ORDER BY lower(a.display_name)`;
  const seen = new Set<number>();
  const friends: unknown[] = [];
  const incoming: unknown[] = [];
  const outgoing: unknown[] = [];
  for (const r of rows as Row[]) {
    const person = { ...publicMember(r), requestId: r.request_id, requestedAt: r.requested_at };
    if (r.status === 'accepted') {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      friends.push(person);
    } else if (r.to_id === me.id) incoming.push(person);
    else outgoing.push(person);
  }
  const blockedRows = await sql`SELECT a.* FROM blocks b JOIN app_members a ON a.id = b.blocked_id WHERE b.blocker_id = ${me.id}`;
  return ok({ friends, incoming, outgoing, blocked: (blockedRows as Row[]).map(publicMember) });
}

export async function sendRequest({ req }: Ctx) {
  const me = await requireMe(req);
  const b = await readJson(req);
  await limit(`fr:${me.id}`, 30, 3600, 'Too many friend requests. Please try again later.');
  let target: Row | undefined;
  if (b.memberId !== undefined) {
    target = (await sql`SELECT * FROM app_members WHERE id = ${intId(b.memberId, 'person')}`)[0];
  } else {
    const u = usernameOf(b.username);
    target = (await sql`SELECT * FROM app_members WHERE lower(username) = ${u}`)[0];
  }
  if (!target) fail(404, 'No one has that username.');
  if (target.id === me.id) fail(400, "That's you!");
  const bs = await blockState(me.id, target.id);
  if (bs.blockedMe) fail(404, 'No one has that username.');
  if (bs.iBlocked) fail(400, 'You blocked this person. Unblock them first.');
  const rel = await relation(me.id, target.id);
  if (rel.relation === 'friend') return ok({ status: 'friends', requestId: rel.requestId });
  if (rel.relation === 'incoming') {
    await sql`UPDATE friend_requests SET status = 'accepted', responded_at = now() WHERE id = ${rel.requestId}`;
    return ok({ status: 'friends', requestId: rel.requestId });
  }
  if (rel.relation === 'outgoing') return ok({ status: 'pending', requestId: rel.requestId });
  const rows = await sql`
    INSERT INTO friend_requests (from_id, to_id, status) VALUES (${me.id}, ${target.id}, 'pending')
    ON CONFLICT (from_id, to_id) DO UPDATE SET status = 'pending', created_at = now(), responded_at = NULL
    RETURNING id`;
  return ok({ status: 'pending', requestId: rows[0].id });
}

export async function respondRequest({ req }: Ctx) {
  const me = await requireMe(req);
  const b = await readJson(req);
  const id = intId(b.requestId, 'request');
  const rows = await sql`
    UPDATE friend_requests SET status = ${b.accept ? 'accepted' : 'declined'}, responded_at = now()
     WHERE id = ${id} AND to_id = ${me.id} AND status = 'pending' RETURNING id`;
  if (!rows.length) fail(404, 'That request is no longer available.');
  return ok({ ok: true });
}

export async function cancelRequest({ req }: Ctx) {
  const me = await requireMe(req);
  const b = await readJson(req);
  await sql`DELETE FROM friend_requests WHERE id = ${intId(b.requestId, 'request')} AND from_id = ${me.id} AND status = 'pending'`;
  return ok({ ok: true });
}

export async function removeFriend({ req }: Ctx) {
  const me = await requireMe(req);
  const b = await readJson(req);
  const other = intId(b.memberId, 'person');
  await sql`DELETE FROM friend_requests WHERE (from_id = ${me.id} AND to_id = ${other}) OR (from_id = ${other} AND to_id = ${me.id})`;
  return ok({ ok: true });
}

export async function setBlock({ req }: Ctx) {
  const me = await requireMe(req);
  const b = await readJson(req);
  const other = intId(b.memberId, 'person');
  if (other === me.id) fail(400, "You can't block yourself.");
  if (b.block) {
    await sql`INSERT INTO blocks (blocker_id, blocked_id) VALUES (${me.id}, ${other}) ON CONFLICT DO NOTHING`;
    await sql`DELETE FROM friend_requests WHERE status = 'pending' AND ((from_id = ${me.id} AND to_id = ${other}) OR (from_id = ${other} AND to_id = ${me.id}))`;
  } else {
    await sql`DELETE FROM blocks WHERE blocker_id = ${me.id} AND blocked_id = ${other}`;
  }
  return ok({ ok: true, blocked: !!b.block });
}
