// Account routes: signup (invite only), login, logout, profile, password,
// email, security question, recovery (no account enumeration), deletion.
import {
  Ctx,
  Row,
  clearKey,
  createSession,
  email as emailOf,
  fail,
  hashSecret,
  hit,
  keyedHash,
  limit,
  MEDIA_URL_RE,
  normalizeAnswer,
  ok,
  optText,
  password as passwordOf,
  peek,
  readJson,
  requireMe,
  safeEqual,
  selfMember,
  sql,
  text,
  username as usernameOf,
  verifyAnswer,
  verifySecret,
} from './core';

const LOCK_WINDOW = 15 * 60;
const DECOY_QUESTIONS = [
  'What was the name of your first school?',
  'What city were you born in?',
  "What is your mother's maiden name?",
  'What was the name of your first pet?',
  'What is your favourite food?',
  'Who was your childhood best friend?',
];

async function upgradeHash(memberId: number, column: 'password' | 'answer', plain: string) {
  const h = await hashSecret(column === 'answer' ? normalizeAnswer(plain) : plain);
  if (column === 'password') await sql`UPDATE app_members SET password_hash = ${h} WHERE id = ${memberId}`;
  else await sql`UPDATE app_members SET security_answer_hash = ${h} WHERE id = ${memberId}`;
}

export async function signup({ req, ip }: Ctx) {
  const b = await readJson(req);
  await limit(`signup:ip:${ip}`, 10, 3600, 'Too many sign-up attempts. Please try again later.');
  const expected = (process.env.INVITE_CODE || '').trim();
  if (!expected) fail(403, 'Sign-ups are closed right now.');
  if ((await peek(`invitefail:${ip}`, 3600)) >= 10) fail(429, 'Too many wrong invite codes. Try again in an hour.');
  const code = typeof b.inviteCode === 'string' ? b.inviteCode.trim() : '';
  if (!code || !safeEqual(code.toUpperCase(), expected.toUpperCase())) {
    await hit(`invitefail:${ip}`, 3600);
    fail(403, 'That invite code is not valid. Ask the person who invited you.');
  }
  const uname = usernameOf(b.username);
  const displayName = text(b.displayName, 'Name', { max: 40 });
  const mail = emailOf(b.email);
  const pw = passwordOf(b.password);
  const question = text(b.securityQuestion, 'Security question', { min: 5, max: 120 });
  const answer = text(b.securityAnswer, 'Security answer', { max: 100 });

  const taken = await sql`SELECT lower(username) = ${uname} AS u, lower(email) = ${mail} AS e FROM app_members WHERE lower(username) = ${uname} OR lower(email) = ${mail}`;
  if (taken.some((r: Row) => r.u)) fail(409, 'That username is taken. Try another one.');
  if (taken.some((r: Row) => r.e)) fail(409, 'That email is already registered. Try signing in instead.');

  const pwHash = await hashSecret(pw);
  const ansHash = await hashSecret(normalizeAnswer(answer));
  let rows: Row[];
  try {
    rows = await sql`
      INSERT INTO app_members (username, display_name, email, password_hash, security_question, security_answer_hash, last_seen_at)
      VALUES (${uname}, ${displayName}, ${mail}, ${pwHash}, ${question}, ${ansHash}, now())
      RETURNING *`;
  } catch (e) {
    if ((e as { code?: string }).code === '23505') fail(409, 'That username or email is already registered.');
    throw e;
  }
  const token = await createSession(rows[0].id);
  return ok({ token, member: selfMember(rows[0]) }, 201);
}

export async function login({ req, ip }: Ctx) {
  const b = await readJson(req);
  const identifier = text(b.identifier ?? b.username ?? b.email, 'Username or email', { max: 254 })
    .replace(/^@/, '')
    .toLowerCase();
  const pw = typeof b.password === 'string' ? b.password : '';
  if (!pw) fail(400, 'Enter your password.');
  await limit(`login:ip:${ip}`, 40, 600, 'Too many sign-in attempts. Please wait a few minutes.');
  const acctKey = `loginfail:acct:${identifier}`;
  const ipKey = `loginfail:ip:${ip}`;
  if ((await peek(acctKey, LOCK_WINDOW)) >= 5 || (await peek(ipKey, LOCK_WINDOW)) >= 20) {
    fail(429, 'Too many wrong attempts. For your safety, sign-in is paused for 15 minutes.');
  }
  const rows = await sql`SELECT * FROM app_members WHERE lower(username) = ${identifier} OR lower(email) = ${identifier} ORDER BY id LIMIT 1`;
  const m = rows[0];
  const v = await verifySecret(pw, m?.password_hash);
  if (!m || !v.ok) {
    const n = await hit(acctKey, LOCK_WINDOW);
    await hit(ipKey, LOCK_WINDOW);
    const left = Math.max(0, 5 - n);
    fail(401, left > 0 ? `Wrong username/email or password. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many wrong attempts. Sign-in is paused for 15 minutes.');
  }
  await clearKey(acctKey);
  if (v.legacy) await upgradeHash(m.id, 'password', pw);
  const token = await createSession(m.id);
  return ok({ token, member: selfMember(m) });
}

export async function logout({ req }: Ctx) {
  const me = await requireMe(req);
  await sql`DELETE FROM app_sessions WHERE token = ${me._th}`;
  return ok({ ok: true });
}

export async function getMe({ req }: Ctx) {
  const me = await requireMe(req);
  return ok({ member: selfMember(me) });
}

export async function patchMe({ req }: Ctx) {
  const me = await requireMe(req);
  const b = await readJson(req);
  let displayName = me.display_name as string;
  let about = me.about as string | null;
  let statusText = me.status_text as string | null;
  let avatarUrl = me.avatar_url as string | null;
  let readReceipts = me.read_receipts !== false;
  let hidePreviews = me.hide_previews === true;
  let uname = me.username as string;
  let unameChanged = false;

  if (b.displayName !== undefined) displayName = text(b.displayName, 'Name', { max: 40 });
  if (b.about !== undefined) about = optText(b.about, 'About', 140) || null;
  if (b.statusText !== undefined) statusText = optText(b.statusText, 'Status', 140) || null;
  if (b.readReceipts !== undefined) readReceipts = !!b.readReceipts;
  if (b.hidePreviews !== undefined) hidePreviews = !!b.hidePreviews;
  if (b.avatarUrl !== undefined) {
    if (b.avatarUrl === null || b.avatarUrl === '') avatarUrl = null;
    else {
      const mm = typeof b.avatarUrl === 'string' ? b.avatarUrl.match(MEDIA_URL_RE) : null;
      if (!mm) fail(400, 'Invalid picture.');
      const media = await sql`SELECT owner_id, mime FROM chat_media WHERE id = ${mm[1]}`;
      if (!media.length || media[0].owner_id !== me.id || !String(media[0].mime).startsWith('image/')) fail(400, 'Invalid picture.');
      avatarUrl = b.avatarUrl;
    }
  }
  if (b.username !== undefined) {
    const next = usernameOf(b.username);
    if (next !== uname) {
      await limit(`uname:${me.id}`, 3, 86400, 'You can change your username up to 3 times a day.');
      const taken = await sql`SELECT 1 FROM app_members WHERE lower(username) = ${next} AND id <> ${me.id}`;
      if (taken.length) fail(409, 'That username is taken. Try another one.');
      uname = next;
      unameChanged = true;
    }
  }
  let rows: Row[];
  try {
    rows = await sql`
      UPDATE app_members SET display_name = ${displayName}, about = ${about}, status_text = ${statusText},
        avatar_url = ${avatarUrl}, read_receipts = ${readReceipts}, hide_previews = ${hidePreviews},
        username = ${uname}, username_changed_at = CASE WHEN ${unameChanged} THEN now() ELSE username_changed_at END
      WHERE id = ${me.id} RETURNING *`;
  } catch (e) {
    if ((e as { code?: string }).code === '23505') fail(409, 'That username is taken. Try another one.');
    throw e;
  }
  return ok({ member: selfMember(rows[0]) });
}

export async function changePassword({ req }: Ctx) {
  const me = await requireMe(req);
  const b = await readJson(req);
  await limit(`pwchange:${me.id}`, 10, 3600);
  const current = typeof b.currentPassword === 'string' ? b.currentPassword : '';
  const next = passwordOf(b.newPassword, 'New password');
  const v = await verifySecret(current, me.password_hash);
  if (!v.ok) fail(400, 'Your current password is not correct.');
  await sql`UPDATE app_members SET password_hash = ${await hashSecret(next)} WHERE id = ${me.id}`;
  await sql`DELETE FROM app_sessions WHERE member_id = ${me.id} AND token <> ${me._th}`;
  return ok({ ok: true });
}

export async function changeEmail({ req }: Ctx) {
  const me = await requireMe(req);
  const b = await readJson(req);
  await limit(`emailchange:${me.id}`, 10, 3600);
  const mail = emailOf(b.email);
  const v = await verifySecret(typeof b.password === 'string' ? b.password : '', me.password_hash);
  if (!v.ok) fail(400, 'Your password is not correct.');
  const taken = await sql`SELECT 1 FROM app_members WHERE lower(email) = ${mail} AND id <> ${me.id}`;
  if (taken.length) fail(409, 'That email is already used by another account.');
  const rows = await sql`UPDATE app_members SET email = ${mail} WHERE id = ${me.id} RETURNING *`;
  return ok({ member: selfMember(rows[0]) });
}

export async function changeSecurity({ req }: Ctx) {
  const me = await requireMe(req);
  const b = await readJson(req);
  await limit(`secchange:${me.id}`, 10, 3600);
  const question = text(b.question, 'Security question', { min: 5, max: 120 });
  const answer = text(b.answer, 'Security answer', { max: 100 });
  const v = await verifySecret(typeof b.password === 'string' ? b.password : '', me.password_hash);
  if (!v.ok) fail(400, 'Your password is not correct.');
  const rows = await sql`UPDATE app_members SET security_question = ${question}, security_answer_hash = ${await hashSecret(normalizeAnswer(answer))} WHERE id = ${me.id} RETURNING *`;
  return ok({ member: selfMember(rows[0]) });
}

// --------------------------------------------------------------- recovery
async function recoveryTarget(mail: string) {
  const rows = await sql`SELECT * FROM app_members WHERE lower(email) = ${mail} ORDER BY id LIMIT 1`;
  return rows[0] as Row | undefined;
}

function decoyQuestion(mail: string) {
  const h = parseInt(keyedHash(`q:${mail}`).slice(0, 8), 16);
  return DECOY_QUESTIONS[h % DECOY_QUESTIONS.length];
}

export async function recoveryQuestion({ req, ip }: Ctx) {
  const b = await readJson(req);
  await limit(`reset:ip:${ip}`, 20, 3600, 'Too many attempts. Please try again later.');
  const mail = emailOf(b.email);
  const m = await recoveryTarget(mail);
  // Same response shape whether or not the account exists.
  const question = m?.security_question && m?.security_answer_hash ? (m.security_question as string) : decoyQuestion(mail);
  return ok({ question });
}

async function checkRecovery(mail: string, answer: string, ip: string) {
  const failKey = `resetfail:${mail}`;
  if ((await peek(failKey, 3600)) >= 5) fail(429, 'Too many wrong answers. Try again in an hour.');
  await limit(`reset:ip:${ip}`, 20, 3600, 'Too many attempts. Please try again later.');
  const m = await recoveryTarget(mail);
  const v = await verifyAnswer(answer, m?.security_answer_hash);
  if (!m || !m.security_question || !v.ok) {
    await hit(failKey, 3600);
    fail(400, "Those details don't match. Check the email and your answer.");
  }
  await clearKey(failKey);
  if (v.legacy) await upgradeHash(m.id, 'answer', answer);
  return m;
}

export async function recoveryReset({ req, ip }: Ctx) {
  const b = await readJson(req);
  const mail = emailOf(b.email);
  const answer = text(b.answer, 'Answer', { max: 100 });
  const next = passwordOf(b.newPassword, 'New password');
  const m = await checkRecovery(mail, answer, ip);
  await sql`UPDATE app_members SET password_hash = ${await hashSecret(next)} WHERE id = ${m.id}`;
  await sql`DELETE FROM app_sessions WHERE member_id = ${m.id}`;
  await clearKey(`loginfail:acct:${mail}`);
  if (m.username) await clearKey(`loginfail:acct:${String(m.username).toLowerCase()}`);
  const token = await createSession(m.id);
  return ok({ token, member: selfMember(m) });
}

export async function recoveryUsername({ req, ip }: Ctx) {
  const b = await readJson(req);
  const mail = emailOf(b.email);
  const answer = text(b.answer, 'Answer', { max: 100 });
  const m = await checkRecovery(mail, answer, ip);
  return ok({ username: m.username });
}

// --------------------------------------------------------------- danger zone
async function removeMemberData(id: number, deleteAccount: boolean) {
  const statements = [
    sql`DELETE FROM message_reactions WHERE member_id = ${id}`,
    sql`DELETE FROM message_stars WHERE member_id = ${id}`,
    sql`DELETE FROM message_hidden WHERE member_id = ${id}`,
    sql`DELETE FROM friend_requests WHERE from_id = ${id} OR to_id = ${id}`,
    sql`DELETE FROM conversations WHERE type = 'self' AND id IN (SELECT conversation_id FROM conversation_members WHERE member_id = ${id})`,
    sql`DELETE FROM conversation_members WHERE member_id = ${id}`,
  ];
  if (deleteAccount) {
    statements.push(
      sql`DELETE FROM message_reactions WHERE message_id IN (SELECT id FROM messages WHERE sender_id = ${id})`,
      sql`DELETE FROM message_stars WHERE message_id IN (SELECT id FROM messages WHERE sender_id = ${id})`,
      sql`DELETE FROM blocks WHERE blocker_id = ${id} OR blocked_id = ${id}`,
      sql`DELETE FROM member_blocks WHERE blocker_id = ${id} OR blocked_id = ${id}`,
      sql`DELETE FROM group_call_signals WHERE from_id = ${id} OR to_id = ${id}`,
      sql`DELETE FROM group_call_participants WHERE member_id = ${id}`,
      sql`DELETE FROM chat_media WHERE owner_id = ${id}`,
      sql`DELETE FROM app_members WHERE id = ${id}`,
    );
  }
  statements.push(
    sql`DELETE FROM conversations c WHERE NOT EXISTS (SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = c.id)`,
  );
  await sql.transaction(statements);
}

export async function clearAll({ req }: Ctx) {
  const me = await requireMe(req);
  await limit(`clearall:${me.id}`, 5, 3600);
  await removeMemberData(me.id, false);
  return ok({ ok: true });
}

export async function deleteAccount({ req }: Ctx) {
  const me = await requireMe(req);
  const b = await readJson(req);
  await limit(`delete:${me.id}`, 5, 3600);
  const v = await verifySecret(typeof b.password === 'string' ? b.password : '', me.password_hash);
  if (!v.ok) fail(400, 'Your password is not correct.');
  await removeMemberData(me.id, true);
  return ok({ ok: true });
}
