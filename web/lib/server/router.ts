import { NextRequest, NextResponse } from 'next/server';
import { Ctx, HttpError, clientIp } from './core';
import * as account from './account';
import * as social from './social';
import * as chats from './chats';
import * as media from './media';
import * as calls from './calls';

type Handler = (c: Ctx) => Promise<Response>;

const ROUTES: Array<[string, string, Handler]> = [
  ['GET', 'health', async () => NextResponse.json({ ok: true, time: new Date().toISOString() })],
  // account
  ['POST', 'account/signup', account.signup],
  ['POST', 'account/login', account.login],
  ['POST', 'account/logout', account.logout],
  ['GET', 'account/me', account.getMe],
  ['PATCH', 'account/me', account.patchMe],
  ['POST', 'account/password', account.changePassword],
  ['POST', 'account/email', account.changeEmail],
  ['POST', 'account/security', account.changeSecurity],
  ['POST', 'account/recover/question', account.recoveryQuestion],
  ['POST', 'account/recover/reset', account.recoveryReset],
  ['POST', 'account/recover/username', account.recoveryUsername],
  ['POST', 'account/clear-all', account.clearAll],
  ['POST', 'account/delete', account.deleteAccount],
  // people
  ['GET', 'users/search', social.searchUser],
  ['GET', 'friends', social.listFriends],
  ['POST', 'friends/request', social.sendRequest],
  ['POST', 'friends/respond', social.respondRequest],
  ['POST', 'friends/cancel', social.cancelRequest],
  ['POST', 'friends/remove', social.removeFriend],
  ['POST', 'blocks', social.setBlock],
  // chats
  ['GET', 'conversations', chats.listConversations],
  ['POST', 'conversations/self', chats.openSelf],
  ['POST', 'conversations/direct', chats.openDirect],
  ['POST', 'conversations/group', chats.createGroup],
  ['GET', 'conversations/:id', chats.conversationInfo],
  ['PATCH', 'conversations/:id', chats.patchConversation],
  ['POST', 'conversations/:id/prefs', chats.setPrefs],
  ['POST', 'conversations/:id/read', chats.markRead],
  ['POST', 'conversations/:id/typing', chats.setTyping],
  ['POST', 'conversations/:id/clear', chats.clearChat],
  ['POST', 'conversations/:id/leave', chats.leaveGroup],
  ['POST', 'conversations/:id/members', chats.addMembers],
  ['GET', 'conversations/:id/messages', chats.listMessages],
  ['POST', 'conversations/:id/messages', chats.sendMessage],
  ['GET', 'conversations/:id/search', chats.searchMessages],
  ['GET', 'conversations/:id/media', chats.mediaAndLinks],
  ['GET', 'conversations/:id/export', chats.exportChat],
  ['GET', 'messages/starred', chats.starredMessages],
  ['POST', 'messages/forward', chats.forwardMessage],
  ['PATCH', 'messages/:id', chats.editMessage],
  ['DELETE', 'messages/:id', chats.deleteMessage],
  ['POST', 'messages/:id/react', chats.reactMessage],
  ['POST', 'messages/:id/star', chats.starMessage],
  ['POST', 'messages/:id/pin', chats.pinMessage],
  // media
  ['POST', 'media', media.uploadMedia],
  ['GET', 'media/:id', media.getMedia],
  // calls
  ['GET', 'calls', calls.callHistory],
  ['POST', 'calls', calls.startCall],
  ['GET', 'calls/ice', calls.iceServers],
  ['GET', 'calls/incoming', calls.incomingCall],
  ['GET', 'calls/:id', calls.getCall],
  ['POST', 'calls/:id/answer', calls.answerCall],
  ['POST', 'calls/:id/end', calls.endCall],
];

const COMPILED = ROUTES.map(([method, pattern, handler]) => ({ method, parts: pattern.split('/'), handler }));

function match(parts: string[], slug: string[]): Record<string, string> | null {
  if (parts.length !== slug.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith(':')) params[parts[i].slice(1)] = decodeURIComponent(slug[i]);
    else if (parts[i] !== slug[i]) return null;
  }
  return params;
}

export async function dispatch(req: NextRequest, slug: string[]): Promise<Response> {
  const method = req.method.toUpperCase();
  let pathMatched = false;
  for (const r of COMPILED) {
    const params = match(r.parts, slug);
    if (!params) continue;
    pathMatched = true;
    if (r.method !== method) continue;
    try {
      return await r.handler({ req, p: params, ip: clientIp(req), url: new URL(req.url) });
    } catch (e) {
      if (e instanceof HttpError) {
        return NextResponse.json({ error: e.message, ...(e.extra || {}) }, { status: e.status, headers: { 'Cache-Control': 'no-store' } });
      }
      console.error(`[api] ${method} /api/${slug.join('/')} failed:`, e);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
  }
  return NextResponse.json({ error: pathMatched ? 'Method not allowed.' : 'Not found.' }, { status: pathMatched ? 405 : 404 });
}
