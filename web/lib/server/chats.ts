// Conversations and messages: chat list, direct / self / group chats,
// messages (text, image, voice), replies, edits, deletes, reactions,
// stars, pins, forwarding, search, media & links, export.
import {
  Ctx,
  Row,
  fail,
  intId,
  limit,
  ok,
  optText,
  ownedMedia,
  publicMember,
  readJson,
  requireMe,
  sql,
  text,
} from './core';
import { areFriends, blockState } from './social';

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

const VISIBLE = `(m.expires_at IS NULL OR m.expires_at > now())
  AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.message_id = m.id AND h.member_id = $1)`;

const MSG_SELECT = `
  SELECT m.*, s.display_name AS sender_name, s.username AS sender_username, s.avatar_url AS sender_avatar,
         r.id AS r_id, r.sender_id AS r_sender, r.kind AS r_kind, r.body AS r_body, r.deleted_at AS r_deleted,
         r.media_url AS r_media, rs.display_name AS r_sender_name,
         EXISTS (SELECT 1 FROM message_stars st WHERE st.message_id = m.id AND st.member_id = $1) AS starred,
         COALESCE((SELECT json_agg(json_build_object('memberId', mr.member_id, 'emoji', mr.emoji, 'name', ra.display_name) ORDER BY mr.created_at)
                     FROM message_reactions mr JOIN app_members ra ON ra.id = mr.member_id
                    WHERE mr.message_id = m.id), '[]'::json) AS reactions
    FROM messages m
    LEFT JOIN app_members s ON s.id = m.sender_id
    LEFT JOIN messages r ON r.id = m.reply_to_id
    LEFT JOIN app_members rs ON rs.id = r.sender_id`;

function serializeMessage(r: Row) {
  const deleted = !!r.deleted_at;
  return {
    id: r.id as number,
    conversationId: r.conversation_id as number,
    senderId: r.sender_id as number,
    senderName: (r.sender_name as string) || 'Deleted account',
    senderAvatar: (r.sender_avatar as string) || null,
    kind: r.kind as string,
    body: deleted ? null : ((r.body as string) ?? null),
    mediaUrl: deleted ? null : ((r.media_url as string) ?? null),
    durationMs: (r.duration_ms as number) ?? null,
    createdAt: iso(r.created_at),
    editedAt: iso(r.edited_at),
    deletedAt: iso(r.deleted_at),
    expiresAt: iso(r.expires_at),
    pinnedAt: iso(r.pinned_at),
    forwarded: !!r.forwarded,
    starred: !!r.starred,
    reactions: (r.reactions as unknown[]) || [],
    replyTo: r.r_id
      ? {
          id: r.r_id as number,
          senderId: r.r_sender as number,
          senderName: (r.r_sender_name as string) || 'Deleted account',
          kind: r.r_kind as string,
          body: r.r_deleted ? null : ((r.r_body as string) || '').slice(0, 200),
          mediaUrl: r.r_deleted ? null : ((r.r_media as string) ?? null),
          deleted: !!r.r_deleted,
        }
      : null,
  };
}

async function messagesWhere(meId: number, where: string, params: unknown[], order = 'ORDER BY m.id DESC', lim = 50) {
  const rows = await sql.query(`${MSG_SELECT} WHERE ${where} AND ${VISIBLE} ${order} LIMIT ${Math.max(1, Math.min(lim, 5000))}`, [meId, ...params]);
  return (rows as Row[]).map(serializeMessage);
}

export async function membership(convId: number, meId: number) {
  const rows = await sql`
    SELECT c.type, c.title, c.disappear_after_sec, c.created_at AS conv_created_at, cm.*
      FROM conversation_members cm JOIN conversations c ON c.id = cm.conversation_id
     WHERE cm.conversation_id = ${convId} AND cm.member_id = ${meId}`;
  if (!rows.length) fail(404, 'Chat not found.');
  return rows[0] as Row;
}

async function directOther(convId: number, meId: number): Promise<Row | null> {
  const rows = await sql`
    SELECT a.* FROM conversation_members cm JOIN app_members a ON a.id = cm.member_id
     WHERE cm.conversation_id = ${convId} AND cm.member_id <> ${meId} LIMIT 1`;
  return (rows[0] as Row) || null;
}

async function assertCanSend(cm: Row, meId: number) {
  if (cm.type !== 'direct') return;
  const other = await directOther(cm.conversation_id, meId);
  if (!other) fail(400, 'This account no longer exists.');
  const bs = await blockState(meId, other.id);
  if (bs.iBlocked) fail(403, 'You blocked this contact. Unblock them to send messages.');
  if (bs.blockedMe) fail(403, "You can't send messages to this contact.");
}

async function systemMessage(convId: number, senderId: number, body: string) {
  await sql`INSERT INTO messages (conversation_id, sender_id, kind, body) VALUES (${convId}, ${senderId}, 'system', ${body})`;
}

let lastCleanup = 0;
async function cleanupExpired() {
  if (Date.now() - lastCleanup < 60_000) return;
  lastCleanup = Date.now();
  await sql`
    WITH gone AS (DELETE FROM messages WHERE expires_at IS NOT NULL AND expires_at < now() - interval '1 minute' RETURNING id),
         r AS (DELETE FROM message_reactions WHERE message_id IN (SELECT id FROM gone)),
         s AS (DELETE FROM message_stars WHERE message_id IN (SELECT id FROM gone))
    SELECT count(*) FROM gone`;
}

function chatName(type: string, title: string | null, other: Row | null) {
  if (type === 'self') return 'Message yourself';
  if (type === 'group') return title || 'Group';
  return other?.display_name || 'Deleted account';
}

type Others = { readMin: number | null; seenMin: string | null; receipts: boolean | null } | null;
function tickStatus(id: number, createdAt: string, others: Others, myReceipts: boolean, type: string) {
  if (type === 'self') return 'read';
  if (!others || others.readMin == null) return 'sent';
  if (myReceipts && others.receipts && others.readMin >= id) return 'read';
  if (others.seenMin && new Date(others.seenMin).getTime() >= new Date(createdAt).getTime()) return 'delivered';
  return 'sent';
}

// ------------------------------------------------------------------ list
export async function listConversations({ req }: Ctx) {
  const me = await requireMe(req);
  await cleanupExpired();
  const rows = await sql`
    SELECT c.id, c.type, c.title, c.disappear_after_sec, c.created_at AS conv_created,
           cm.last_read_id, cm.muted, cm.muted_until, cm.archived, cm.pinned_at, cm.favorite, cm.wallpaper, cm.cleared_before_id,
           o.id AS o_id, o.username AS o_username, o.display_name AS o_name, o.avatar_url AS o_avatar,
           o.last_seen_at AS o_seen, o.about AS o_about,
           lm.id AS l_id, lm.kind AS l_kind, lm.body AS l_body, lm.sender_id AS l_sender, lm.created_at AS l_at,
           lm.deleted_at AS l_deleted, lm.duration_ms AS l_duration, ls.display_name AS l_sender_name,
           (SELECT count(*)::int FROM conversation_members x WHERE x.conversation_id = c.id) AS member_count,
           (SELECT count(*)::int FROM messages u
             WHERE u.conversation_id = c.id AND u.id > GREATEST(cm.last_read_id, COALESCE(cm.cleared_before_id, 0))
               AND u.sender_id <> ${me.id} AND u.deleted_at IS NULL AND u.kind <> 'system'
               AND (u.expires_at IS NULL OR u.expires_at > now())) AS unread,
           (SELECT string_agg(t.display_name, ', ') FROM conversation_members tm JOIN app_members t ON t.id = tm.member_id
             WHERE tm.conversation_id = c.id AND tm.member_id <> ${me.id} AND tm.typing_at > now() - interval '6 seconds') AS typing,
           (SELECT json_build_object('readMin', min(r.last_read_id), 'seenMin', min(ra.last_seen_at), 'receipts', bool_and(ra.read_receipts))
              FROM conversation_members r JOIN app_members ra ON ra.id = r.member_id
             WHERE r.conversation_id = c.id AND r.member_id <> ${me.id}) AS others
      FROM conversation_members cm
      JOIN conversations c ON c.id = cm.conversation_id
      LEFT JOIN LATERAL (
        SELECT a.* FROM conversation_members om JOIN app_members a ON a.id = om.member_id
         WHERE om.conversation_id = c.id AND om.member_id <> ${me.id} LIMIT 1
      ) o ON c.type = 'direct'
      LEFT JOIN LATERAL (
        SELECT m.* FROM messages m
         WHERE m.conversation_id = c.id AND m.id > COALESCE(cm.cleared_before_id, 0)
           AND (m.expires_at IS NULL OR m.expires_at > now())
           AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.message_id = m.id AND h.member_id = ${me.id})
         ORDER BY m.id DESC LIMIT 1
      ) lm ON true
      LEFT JOIN app_members ls ON ls.id = lm.sender_id
     WHERE cm.member_id = ${me.id}
     ORDER BY COALESCE(lm.created_at, c.created_at) DESC`;
  const now = Date.now();
  const myReceipts = me.read_receipts !== false;
  const items = (rows as Row[]).map((r) => {
    const other = r.o_id
      ? publicMember({ id: r.o_id, username: r.o_username, display_name: r.o_name, avatar_url: r.o_avatar, last_seen_at: r.o_seen, about: r.o_about })
      : null;
    const mutedUntil = r.muted_until ? new Date(r.muted_until).getTime() : 0;
    const last = r.l_id
      ? {
          id: r.l_id,
          kind: r.l_kind,
          body: r.l_deleted ? null : r.l_body,
          senderId: r.l_sender,
          senderName: r.l_sender_name || 'Deleted account',
          createdAt: iso(r.l_at),
          deleted: !!r.l_deleted,
          durationMs: r.l_duration ?? null,
          status: r.l_sender === me.id ? tickStatus(r.l_id, r.l_at, r.others, myReceipts, r.type) : null,
        }
      : null;
    return {
      id: r.id,
      type: r.type,
      title: r.title || null,
      name: chatName(r.type, r.title, r.o_id ? { display_name: r.o_name } : null),
      other,
      avatarUrl: r.type === 'direct' ? other?.avatarUrl || null : r.type === 'self' ? me.avatar_url || null : null,
      memberCount: r.member_count,
      lastMessage: last,
      unread: r.unread || 0,
      typing: r.typing || null,
      muted: !!r.muted || mutedUntil > now,
      mutedUntil: mutedUntil > now ? iso(r.muted_until) : null,
      archived: !!r.archived,
      pinned: !!r.pinned_at,
      pinnedAt: iso(r.pinned_at),
      favorite: !!r.favorite,
      wallpaper: r.wallpaper || null,
      disappearAfterSec: r.disappear_after_sec || null,
      updatedAt: iso(r.l_at || r.conv_created),
    };
  });
  return ok({ conversations: items });
}

// ------------------------------------------------------------------ create
async function findOrCreateSelf(meId: number) {
  const existing = await sql`
    SELECT c.id FROM conversations c JOIN conversation_members cm ON cm.conversation_id = c.id
     WHERE c.type = 'self' AND cm.member_id = ${meId} ORDER BY c.id LIMIT 1`;
  if (existing.length) return existing[0].id as number;
  const rows = await sql`
    WITH c AS (INSERT INTO conversations (type) VALUES ('self') RETURNING id)
    INSERT INTO conversation_members (conversation_id, member_id) SELECT c.id, ${meId} FROM c RETURNING conversation_id`;
  return rows[0].conversation_id as number;
}

export async function openSelf({ req }: Ctx) {
  const me = await requireMe(req);
  return ok({ id: await findOrCreateSelf(me.id) });
}

export async function openDirect({ req }: Ctx) {
  const me = await requireMe(req);
  const b = await readJson(req);
  const other = intId(b.memberId, 'person');
  if (other === me.id) return ok({ id: await findOrCreateSelf(me.id) });
  const existing = await sql`
    SELECT c.id FROM conversations c
      JOIN conversation_members a ON a.conversation_id = c.id AND a.member_id = ${me.id}
      JOIN conversation_members b ON b.conversation_id = c.id AND b.member_id = ${other}
     WHERE c.type = 'direct' ORDER BY c.id LIMIT 1`;
  if (existing.length) return ok({ id: existing[0].id });
  if (!(await areFriends(me.id, other))) fail(403, 'You can only chat with friends. Send a friend request first.');
  const rows = await sql`
    WITH c AS (INSERT INTO conversations (type) VALUES ('direct') RETURNING id)
    INSERT INTO conversation_members (conversation_id, member_id)
    SELECT c.id, x FROM c, unnest(${[me.id, other]}::int[]) AS x RETURNING conversation_id`;
  return ok({ id: rows[0].conversation_id });
}

function idList(v: unknown, max = 30): number[] {
  if (!Array.isArray(v)) return [];
  const out = new Set<number>();
  for (const x of v) {
    const n = Number(x);
    if (Number.isInteger(n) && n > 0) out.add(n);
    if (out.size > max) fail(400, `You can pick up to ${max} people.`);
  }
  return Array.from(out);
}

async function assertAllFriends(meId: number, ids: number[]) {
  if (!ids.length) return;
  const rows = await sql`
    SELECT DISTINCT CASE WHEN from_id = ${meId} THEN to_id ELSE from_id END AS id FROM friend_requests
     WHERE status = 'accepted'
       AND ((from_id = ${meId} AND to_id = ANY(${ids}::int[])) OR (to_id = ${meId} AND from_id = ANY(${ids}::int[])))`;
  if (rows.length !== ids.length) fail(403, 'You can only add your friends.');
}

export async function createGroup({ req }: Ctx) {
  const me = await requireMe(req);
  const b = await readJson(req);
  await limit(`group:${me.id}`, 20, 3600);
  const title = text(b.title, 'Group name', { max: 60 });
  const ids = idList(b.memberIds).filter((x) => x !== me.id);
  if (!ids.length) fail(400, 'Pick at least one friend for the group.');
  await assertAllFriends(me.id, ids);
  const all = [me.id, ...ids];
  const rows = await sql`
    WITH c AS (INSERT INTO conversations (type, title) VALUES ('group', ${title}) RETURNING id),
         mm AS (INSERT INTO conversation_members (conversation_id, member_id) SELECT c.id, x FROM c, unnest(${all}::int[]) AS x)
    INSERT INTO messages (conversation_id, sender_id, kind, body)
    SELECT c.id, ${me.id}, 'system', ${`${me.display_name} created the group "${title}"`} FROM c
    RETURNING conversation_id`;
  return ok({ id: rows[0].conversation_id }, 201);
}

// ------------------------------------------------------------------ info
export async function conversationInfo({ req, p }: Ctx) {
  const me = await requireMe(req);
  const cid = intId(p.id, 'chat');
  const cm = await membership(cid, me.id);
  const floor = cm.cleared_before_id || 0;
  const members = await sql`
    SELECT a.*, m.joined_at FROM conversation_members m JOIN app_members a ON a.id = m.member_id
     WHERE m.conversation_id = ${cid} ORDER BY (a.id = ${me.id}) DESC, lower(a.display_name)`;
  const counts = await sql.query(
    `SELECT count(*) FILTER (WHERE m.kind = 'image')::int AS media,
            count(*) FILTER (WHERE m.kind = 'text' AND m.body ~* 'https?://')::int AS links,
            count(*) FILTER (WHERE m.kind = 'audio')::int AS voice
       FROM messages m WHERE m.conversation_id = $2 AND m.id > $3 AND m.deleted_at IS NULL AND ${VISIBLE}`,
    [me.id, cid, floor],
  );
  let other: Row | null = null;
  let blocked = { iBlocked: false, blockedMe: false };
  let isFriend = true;
  if (cm.type === 'direct') {
    other = (members as Row[]).find((m) => m.id !== me.id) || null;
    if (other) {
      blocked = await blockState(me.id, other.id);
      isFriend = await areFriends(me.id, other.id);
    }
  }
  const mutedUntil = cm.muted_until ? new Date(cm.muted_until).getTime() : 0;
  return ok({
    id: cid,
    type: cm.type,
    title: cm.title || null,
    name: chatName(cm.type, cm.title, other),
    disappearAfterSec: cm.disappear_after_sec || null,
    createdAt: iso(cm.conv_created_at),
    members: (members as Row[]).map((m) => ({ ...publicMember(m), isMe: m.id === me.id, joinedAt: iso(m.joined_at) })),
    other: publicMember(other),
    blocked,
    isFriend,
    counts: counts[0] || { media: 0, links: 0, voice: 0 },
    prefs: {
      muted: !!cm.muted || mutedUntil > Date.now(),
      mutedUntil: mutedUntil > Date.now() ? iso(cm.muted_until) : null,
      mutedAlways: !!cm.muted,
      archived: !!cm.archived,
      pinned: !!cm.pinned_at,
      favorite: !!cm.favorite,
      wallpaper: cm.wallpaper || null,
    },
  });
}

const DISAPPEAR_OPTIONS = [0, 86400, 604800, 7776000];
const DISAPPEAR_LABEL: Record<number, string> = { 86400: '24 hours', 604800: '7 days', 7776000: '90 days' };

export async function patchConversation({ req, p }: Ctx) {
  const me = await requireMe(req);
  const cid = intId(p.id, 'chat');
  const cm = await membership(cid, me.id);
  const b = await readJson(req);
  if (b.title !== undefined) {
    if (cm.type !== 'group') fail(400, 'Only groups have a name.');
    const title = text(b.title, 'Group name', { max: 60 });
    if (title !== cm.title) {
      await sql`UPDATE conversations SET title = ${title} WHERE id = ${cid}`;
      await systemMessage(cid, me.id, `${me.display_name} renamed the group to "${title}"`);
    }
  }
  if (b.disappearAfterSec !== undefined) {
    const v = Number(b.disappearAfterSec) || 0;
    if (!DISAPPEAR_OPTIONS.includes(v)) fail(400, 'Invalid timer.');
    if ((cm.disappear_after_sec || 0) !== v) {
      await sql`UPDATE conversations SET disappear_after_sec = ${v || null} WHERE id = ${cid}`;
      await systemMessage(
        cid,
        me.id,
        v ? `${me.display_name} turned on disappearing messages. New messages will disappear after ${DISAPPEAR_LABEL[v]}.` : `${me.display_name} turned off disappearing messages.`,
      );
    }
  }
  return ok({ ok: true });
}

export async function setPrefs({ req, p }: Ctx) {
  const me = await requireMe(req);
  const cid = intId(p.id, 'chat');
  await membership(cid, me.id);
  const b = await readJson(req);
  const hasMute = b.mute !== undefined;
  let mutedVal = false;
  let mutedUntil: string | null = null;
  if (hasMute) {
    if (b.mute === 'always') mutedVal = true;
    else if (b.mute === '8h') mutedUntil = new Date(Date.now() + 8 * 3600_000).toISOString();
    else if (b.mute === '1w') mutedUntil = new Date(Date.now() + 7 * 86400_000).toISOString();
    else if (b.mute !== 'off') fail(400, 'Invalid mute option.');
  }
  const hasArch = b.archived !== undefined;
  const hasPin = b.pinned !== undefined;
  const hasFav = b.favorite !== undefined;
  const hasWall = b.wallpaper !== undefined;
  const wall = hasWall ? optText(b.wallpaper, 'Wallpaper', 40) || null : null;
  if (hasPin && b.pinned) {
    const pinned = await sql`SELECT count(*)::int AS n FROM conversation_members WHERE member_id = ${me.id} AND pinned_at IS NOT NULL AND conversation_id <> ${cid}`;
    if (pinned[0].n >= 3) fail(400, 'You can pin up to 3 chats.');
  }
  const rows = await sql`
    UPDATE conversation_members SET
      muted = CASE WHEN ${hasMute} THEN ${mutedVal} ELSE muted END,
      muted_until = CASE WHEN ${hasMute} THEN ${mutedUntil}::timestamptz ELSE muted_until END,
      archived = CASE WHEN ${hasArch} THEN ${!!b.archived} ELSE archived END,
      pinned_at = CASE WHEN ${hasPin} THEN (CASE WHEN ${!!b.pinned} THEN now() ELSE NULL END)
                       WHEN ${hasArch && !!b.archived} THEN NULL ELSE pinned_at END,
      favorite = CASE WHEN ${hasFav} THEN ${!!b.favorite} ELSE favorite END,
      wallpaper = CASE WHEN ${hasWall} THEN ${wall} ELSE wallpaper END
    WHERE conversation_id = ${cid} AND member_id = ${me.id} RETURNING *`;
  return ok({ ok: true, favorite: rows[0]?.favorite, archived: rows[0]?.archived });
}

export async function markRead({ req, p }: Ctx) {
  const me = await requireMe(req);
  const cid = intId(p.id, 'chat');
  const b = await readJson(req);
  const lastId = Number(b.lastId) || 0;
  await sql`
    UPDATE conversation_members SET last_read_id = GREATEST(last_read_id,
      LEAST(${lastId}::int, (SELECT COALESCE(max(id), 0) FROM messages WHERE conversation_id = ${cid})))
     WHERE conversation_id = ${cid} AND member_id = ${me.id}`;
  return ok({ ok: true });
}

export async function setTyping({ req, p }: Ctx) {
  const me = await requireMe(req);
  const cid = intId(p.id, 'chat');
  const b = await readJson(req);
  await sql`UPDATE conversation_members SET typing_at = CASE WHEN ${b.typing !== false} THEN now() ELSE NULL END
             WHERE conversation_id = ${cid} AND member_id = ${me.id}`;
  return ok({ ok: true });
}

export async function clearChat({ req, p }: Ctx) {
  const me = await requireMe(req);
  const cid = intId(p.id, 'chat');
  await membership(cid, me.id);
  await sql`
    UPDATE conversation_members SET
      cleared_before_id = (SELECT COALESCE(max(id), 0) FROM messages WHERE conversation_id = ${cid}),
      last_read_id = GREATEST(last_read_id, (SELECT COALESCE(max(id), 0) FROM messages WHERE conversation_id = ${cid}))
     WHERE conversation_id = ${cid} AND member_id = ${me.id}`;
  return ok({ ok: true });
}

export async function leaveGroup({ req, p }: Ctx) {
  const me = await requireMe(req);
  const cid = intId(p.id, 'chat');
  const cm = await membership(cid, me.id);
  if (cm.type !== 'group') fail(400, 'You can only leave groups.');
  await systemMessage(cid, me.id, `${me.display_name} left`);
  await sql`DELETE FROM conversation_members WHERE conversation_id = ${cid} AND member_id = ${me.id}`;
  await sql`DELETE FROM conversations c WHERE c.id = ${cid} AND NOT EXISTS (SELECT 1 FROM conversation_members x WHERE x.conversation_id = c.id)`;
  return ok({ ok: true });
}

export async function addMembers({ req, p }: Ctx) {
  const me = await requireMe(req);
  const cid = intId(p.id, 'chat');
  const cm = await membership(cid, me.id);
  if (cm.type !== 'group') fail(400, 'You can only add people to groups.');
  const b = await readJson(req);
  const ids = idList(b.memberIds).filter((x) => x !== me.id);
  if (!ids.length) fail(400, 'Pick at least one friend.');
  await assertAllFriends(me.id, ids);
  const added = await sql`
    INSERT INTO conversation_members (conversation_id, member_id)
    SELECT ${cid}, x FROM unnest(${ids}::int[]) AS x
    ON CONFLICT DO NOTHING RETURNING member_id`;
  if (added.length) {
    const names = await sql`SELECT display_name FROM app_members WHERE id = ANY(${added.map((r: Row) => r.member_id)}::int[])`;
    await systemMessage(cid, me.id, `${me.display_name} added ${names.map((n: Row) => n.display_name).join(', ')}`);
  }
  return ok({ ok: true, added: added.length });
}

// ------------------------------------------------------------------ messages
export async function listMessages({ req, p, url }: Ctx) {
  const me = await requireMe(req);
  const cid = intId(p.id, 'chat');
  const cm = await membership(cid, me.id);
  const floor = cm.cleared_before_id || 0;
  const before = Number(url.searchParams.get('before')) || 0;
  const after = Number(url.searchParams.get('after')) || 0;
  const lim = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || 40, 100));
  let messages;
  if (after) messages = await messagesWhere(me.id, 'm.conversation_id = $2 AND m.id > GREATEST($3::int, $4::int)', [cid, floor, after], 'ORDER BY m.id ASC', 200);
  else if (before) messages = await messagesWhere(me.id, 'm.conversation_id = $2 AND m.id > $3 AND m.id < $4', [cid, floor, before], 'ORDER BY m.id DESC', lim);
  else messages = await messagesWhere(me.id, 'm.conversation_id = $2 AND m.id > $3', [cid, floor], 'ORDER BY m.id DESC', lim);
  messages.sort((a, b) => b.id - a.id);

  if (url.searchParams.get('markRead') === '1' && messages.length && !before) {
    const maxId = messages[0].id;
    await sql`UPDATE conversation_members SET last_read_id = GREATEST(last_read_id, ${maxId}::int), typing_at = typing_at
               WHERE conversation_id = ${cid} AND member_id = ${me.id}`;
  }
  const meta = await sql`
    SELECT
      (SELECT json_build_object('readMin', min(r.last_read_id), 'seenMin', min(ra.last_seen_at), 'receipts', bool_and(ra.read_receipts))
         FROM conversation_members r JOIN app_members ra ON ra.id = r.member_id
        WHERE r.conversation_id = ${cid} AND r.member_id <> ${me.id}) AS others,
      (SELECT string_agg(t.display_name, ', ') FROM conversation_members tm JOIN app_members t ON t.id = tm.member_id
        WHERE tm.conversation_id = ${cid} AND tm.member_id <> ${me.id} AND tm.typing_at > now() - interval '6 seconds') AS typing,
      (SELECT json_build_object('id', m.id, 'kind', m.kind, 'body', m.body, 'senderName', s.display_name)
         FROM messages m JOIN app_members s ON s.id = m.sender_id
        WHERE m.conversation_id = ${cid} AND m.pinned_at IS NOT NULL AND m.deleted_at IS NULL AND m.id > ${floor}
          AND (m.expires_at IS NULL OR m.expires_at > now())
        ORDER BY m.pinned_at DESC LIMIT 1) AS pinned,
      (SELECT json_build_object('id', a.id, 'lastSeenAt', a.last_seen_at, 'name', a.display_name, 'avatarUrl', a.avatar_url, 'username', a.username)
         FROM conversation_members om JOIN app_members a ON a.id = om.member_id
        WHERE om.conversation_id = ${cid} AND om.member_id <> ${me.id} LIMIT 1) AS other,
      (SELECT count(*)::int FROM conversation_members x WHERE x.conversation_id = ${cid}) AS member_count,
      (SELECT title FROM conversations WHERE id = ${cid}) AS title,
      (SELECT disappear_after_sec FROM conversations WHERE id = ${cid}) AS disappear`;
  const m0 = meta[0] as Row;
  const other = m0.other as Row | null;
  const others = m0.others as Others;
  const myReceipts = me.read_receipts !== false;
  for (const msg of messages as Array<ReturnType<typeof serializeMessage> & { status?: string }>) {
    if (msg.senderId === me.id && msg.kind !== 'system') msg.status = tickStatus(msg.id, msg.createdAt as string, others, myReceipts, cm.type);
  }
  const lastSeenAt = other?.lastSeenAt ? new Date(other.lastSeenAt).toISOString() : null;
  return ok({
    messages,
    hasMore: !after && messages.length >= lim,
    chat: {
      id: cid,
      type: cm.type,
      name: chatName(cm.type, m0.title, other ? { display_name: other.name } : null),
      memberCount: m0.member_count,
      disappearAfterSec: m0.disappear || null,
      wallpaper: cm.wallpaper || null,
      other: other
        ? { id: other.id, name: other.name, avatarUrl: other.avatarUrl, username: other.username, lastSeenAt, online: lastSeenAt ? Date.now() - new Date(lastSeenAt).getTime() < 40_000 : false }
        : null,
    },
    typing: m0.typing || null,
    pinned: m0.pinned || null,
    lastReadId: cm.last_read_id || 0,
  });
}

export async function sendMessage({ req, p }: Ctx) {
  const me = await requireMe(req);
  const cid = intId(p.id, 'chat');
  await limit(`msg:${me.id}`, 60, 60, 'You are sending messages too fast. Please slow down.');
  const cm = await membership(cid, me.id);
  await assertCanSend(cm, me.id);
  const b = await readJson(req);
  const kind = (b.kind as string) || 'text';
  let body: string | null = null;
  let mediaUrl: string | null = null;
  let durationMs: number | null = null;
  if (kind === 'text') {
    body = text(b.body, 'Message', { max: 4000 });
  } else if (kind === 'image') {
    mediaUrl = await ownedMedia(b.mediaUrl, me.id, 'image');
    body = optText(b.body, 'Caption', 1000) || null;
  } else if (kind === 'audio') {
    mediaUrl = await ownedMedia(b.mediaUrl, me.id, 'audio');
    durationMs = Math.max(0, Math.min(Math.round(Number(b.durationMs) || 0), 3_600_000));
  } else fail(400, 'Unsupported message type.');
  let replyTo: number | null = null;
  if (b.replyToId) {
    replyTo = intId(b.replyToId, 'reply');
    const r = await sql`SELECT 1 FROM messages WHERE id = ${replyTo} AND conversation_id = ${cid}`;
    if (!r.length) replyTo = null;
  }
  const disappear = Number(cm.disappear_after_sec) || 0;
  const rows = await sql`
    INSERT INTO messages (conversation_id, sender_id, kind, body, media_url, duration_ms, reply_to_id, expires_at)
    VALUES (${cid}, ${me.id}, ${kind}, ${body}, ${mediaUrl}, ${durationMs}, ${replyTo},
            CASE WHEN ${disappear}::int > 0 THEN now() + make_interval(secs => ${disappear}::int) ELSE NULL END)
    RETURNING id`;
  const id = rows[0].id as number;
  await sql`UPDATE conversation_members SET last_read_id = GREATEST(last_read_id, ${id}::int), typing_at = NULL
             WHERE conversation_id = ${cid} AND member_id = ${me.id}`;
  const [msg] = await messagesWhere(me.id, 'm.id = $2', [id]);
  return ok({ message: { ...msg, status: cm.type === 'self' ? 'read' : 'sent' } }, 201);
}

async function messageAccess(msgId: number, meId: number) {
  const rows = await sql`
    SELECT m.*, c.type AS conv_type FROM messages m
      JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.member_id = ${meId}
      JOIN conversations c ON c.id = m.conversation_id
     WHERE m.id = ${msgId} AND (m.expires_at IS NULL OR m.expires_at > now())`;
  if (!rows.length) fail(404, 'Message not found.');
  return rows[0] as Row;
}

export async function editMessage({ req, p }: Ctx) {
  const me = await requireMe(req);
  const id = intId(p.id, 'message');
  const b = await readJson(req);
  const body = text(b.body, 'Message', { max: 4000 });
  const rows = await sql`
    UPDATE messages SET body = ${body}, edited_at = now()
     WHERE id = ${id} AND sender_id = ${me.id} AND kind = 'text' AND deleted_at IS NULL
       AND created_at > now() - interval '15 minutes' RETURNING id`;
  if (!rows.length) fail(400, 'You can only edit your own text messages within 15 minutes.');
  const [msg] = await messagesWhere(me.id, 'm.id = $2', [id]);
  return ok({ message: msg });
}

export async function deleteMessage({ req, p, url }: Ctx) {
  const me = await requireMe(req);
  const id = intId(p.id, 'message');
  const m = await messageAccess(id, me.id);
  if (url.searchParams.get('for') === 'everyone') {
    if (m.sender_id !== me.id) fail(403, 'You can only delete your own messages for everyone.');
    await sql.transaction([
      sql`UPDATE messages SET deleted_at = now(), body = NULL, media_url = NULL, pinned_at = NULL WHERE id = ${id}`,
      sql`DELETE FROM message_reactions WHERE message_id = ${id}`,
      sql`DELETE FROM message_stars WHERE message_id = ${id}`,
    ]);
  } else {
    await sql`INSERT INTO message_hidden (member_id, message_id) VALUES (${me.id}, ${id}) ON CONFLICT DO NOTHING`;
    await sql`DELETE FROM message_stars WHERE message_id = ${id} AND member_id = ${me.id}`;
  }
  return ok({ ok: true });
}

export async function reactMessage({ req, p }: Ctx) {
  const me = await requireMe(req);
  const id = intId(p.id, 'message');
  await limit(`react:${me.id}`, 120, 60);
  const m = await messageAccess(id, me.id);
  if (m.deleted_at || m.kind === 'system') fail(400, 'You cannot react to this message.');
  const b = await readJson(req);
  const emoji = typeof b.emoji === 'string' ? b.emoji.trim() : '';
  if (!emoji) await sql`DELETE FROM message_reactions WHERE message_id = ${id} AND member_id = ${me.id}`;
  else {
    if (emoji.length > 16) fail(400, 'Invalid reaction.');
    await sql`INSERT INTO message_reactions (message_id, member_id, emoji) VALUES (${id}, ${me.id}, ${emoji})
              ON CONFLICT (message_id, member_id) DO UPDATE SET emoji = EXCLUDED.emoji, created_at = now()`;
  }
  return ok({ ok: true });
}

export async function starMessage({ req, p }: Ctx) {
  const me = await requireMe(req);
  const id = intId(p.id, 'message');
  await messageAccess(id, me.id);
  const b = await readJson(req);
  if (b.starred === false) await sql`DELETE FROM message_stars WHERE member_id = ${me.id} AND message_id = ${id}`;
  else await sql`INSERT INTO message_stars (member_id, message_id) VALUES (${me.id}, ${id}) ON CONFLICT DO NOTHING`;
  return ok({ ok: true });
}

export async function pinMessage({ req, p }: Ctx) {
  const me = await requireMe(req);
  const id = intId(p.id, 'message');
  const m = await messageAccess(id, me.id);
  if (m.deleted_at || m.kind === 'system') fail(400, 'You cannot pin this message.');
  const b = await readJson(req);
  await sql`UPDATE messages SET pinned_at = CASE WHEN ${b.pinned !== false} THEN now() ELSE NULL END WHERE id = ${id}`;
  return ok({ ok: true });
}

export async function forwardMessage({ req }: Ctx) {
  const me = await requireMe(req);
  const b = await readJson(req);
  await limit(`fwd:${me.id}`, 30, 600);
  const src = await messageAccess(intId(b.messageId, 'message'), me.id);
  if (src.deleted_at || !['text', 'image', 'audio'].includes(src.kind)) fail(400, 'This message cannot be forwarded.');
  const targets = idList(b.conversationIds, 5);
  if (!targets.length) fail(400, 'Pick at least one chat.');
  let sent = 0;
  for (const cid of targets) {
    const cm = await membership(cid, me.id);
    await assertCanSend(cm, me.id);
    const disappear = Number(cm.disappear_after_sec) || 0;
    await sql`
      INSERT INTO messages (conversation_id, sender_id, kind, body, media_url, duration_ms, forwarded, expires_at)
      VALUES (${cid}, ${me.id}, ${src.kind}, ${src.body}, ${src.media_url}, ${src.duration_ms}, true,
              CASE WHEN ${disappear}::int > 0 THEN now() + make_interval(secs => ${disappear}::int) ELSE NULL END)`;
    sent++;
  }
  return ok({ ok: true, sent });
}

export async function starredMessages({ req }: Ctx) {
  const me = await requireMe(req);
  const ids = await sql`
    SELECT st.message_id FROM message_stars st
      JOIN messages m ON m.id = st.message_id
      JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.member_id = ${me.id}
     WHERE st.member_id = ${me.id} AND m.deleted_at IS NULL ORDER BY st.created_at DESC LIMIT 200`;
  const list = ids.length
    ? await messagesWhere(me.id, 'm.id = ANY($2::int[])', [ids.map((r: Row) => r.message_id)], 'ORDER BY m.id DESC', 200)
    : [];
  const convIds = Array.from(new Set(list.map((m) => m.conversationId)));
  const convs = convIds.length
    ? await sql`
        SELECT c.id, c.type, c.title,
               (SELECT a.display_name FROM conversation_members om JOIN app_members a ON a.id = om.member_id
                 WHERE om.conversation_id = c.id AND om.member_id <> ${me.id} LIMIT 1) AS other_name
          FROM conversations c WHERE c.id = ANY(${convIds}::int[])`
    : [];
  const names = new Map<number, string>((convs as Row[]).map((c) => [c.id, chatName(c.type, c.title, c.other_name ? { display_name: c.other_name } : null)]));
  return ok({ messages: list.map((m) => ({ ...m, chatName: names.get(m.conversationId) || 'Chat' })) });
}

export async function searchMessages({ req, p, url }: Ctx) {
  const me = await requireMe(req);
  const cid = intId(p.id, 'chat');
  const cm = await membership(cid, me.id);
  const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
  if (!q) return ok({ messages: [] });
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const list = await messagesWhere(
    me.id,
    `m.conversation_id = $2 AND m.id > $3 AND m.deleted_at IS NULL AND m.kind IN ('text', 'image') AND m.body ILIKE $4`,
    [cid, cm.cleared_before_id || 0, pattern],
    'ORDER BY m.id DESC',
    60,
  );
  return ok({ messages: list });
}

const LINK_RE = /https?:\/\/[^\s<>"')\]]+/gi;

export async function mediaAndLinks({ req, p }: Ctx) {
  const me = await requireMe(req);
  const cid = intId(p.id, 'chat');
  const cm = await membership(cid, me.id);
  const rows = await sql.query(
    `SELECT m.id, m.kind, m.media_url, m.body, m.created_at, m.duration_ms, s.display_name AS sender_name
       FROM messages m LEFT JOIN app_members s ON s.id = m.sender_id
      WHERE m.conversation_id = $2 AND m.id > $3 AND m.deleted_at IS NULL AND ${VISIBLE}
        AND (m.kind IN ('image', 'audio') OR (m.kind = 'text' AND m.body ~* 'https?://'))
      ORDER BY m.id DESC LIMIT 400`,
    [me.id, cid, cm.cleared_before_id || 0],
  );
  const media: unknown[] = [];
  const voice: unknown[] = [];
  const links: unknown[] = [];
  for (const r of rows as Row[]) {
    const base = { messageId: r.id, createdAt: iso(r.created_at), senderName: r.sender_name || 'Deleted account' };
    if (r.kind === 'image') media.push({ ...base, url: r.media_url, caption: r.body || null });
    else if (r.kind === 'audio') voice.push({ ...base, url: r.media_url, durationMs: r.duration_ms });
    else for (const link of String(r.body).match(LINK_RE) || []) links.push({ ...base, url: link });
  }
  return ok({ media, voice, links });
}

function fmtStamp(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
function fmtDur(ms: number | null) {
  const s = Math.round((ms || 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export async function exportChat({ req, p }: Ctx) {
  const me = await requireMe(req);
  const cid = intId(p.id, 'chat');
  await limit(`export:${me.id}`, 6, 60, 'Please wait a minute before exporting again.');
  const cm = await membership(cid, me.id);
  const other = cm.type === 'direct' ? await directOther(cid, me.id) : null;
  const name = chatName(cm.type, cm.title, other);
  const rows = await sql.query(
    `SELECT m.*, s.display_name AS sender_name FROM messages m LEFT JOIN app_members s ON s.id = m.sender_id
      WHERE m.conversation_id = $2 AND m.id > $3 AND ${VISIBLE} ORDER BY m.id DESC LIMIT 5000`,
    [me.id, cid, cm.cleared_before_id || 0],
  );
  const lines: string[] = [
    cm.type === 'self' ? 'Dabba — notes to self' : cm.type === 'group' ? `Dabba group chat: ${name}` : `Dabba chat with ${name}`,
    `Exported ${fmtStamp(new Date())} · ${rows.length} message${rows.length === 1 ? '' : 's'}`,
    '',
  ];
  for (const r of (rows as Row[]).reverse()) {
    const who = r.sender_name || 'Deleted account';
    const at = fmtStamp(new Date(r.created_at));
    let line: string;
    if (r.deleted_at) line = 'This message was deleted';
    else if (r.kind === 'image') line = `<photo>${r.body ? ` ${r.body}` : ''}`;
    else if (r.kind === 'audio') line = `<voice message ${fmtDur(r.duration_ms)}>`;
    else if (r.kind === 'call') line = `<voice call · ${r.body || 'ended'}${r.duration_ms ? ` · ${fmtDur(r.duration_ms)}` : ''}>`;
    else if (r.kind === 'system') {
      lines.push(`[${at}] — ${r.body} —`);
      continue;
    } else line = `${r.forwarded ? '(forwarded) ' : ''}${r.body || ''}${r.edited_at ? ' (edited)' : ''}`;
    lines.push(`[${at}] ${who}: ${line}`);
  }
  const safe = name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'chat';
  return ok({ filename: `dabba-${safe}.txt`, text: lines.join('\n') });
}
