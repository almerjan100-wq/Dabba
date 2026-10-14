// @ts-nocheck
/**
 * AppGen server request error logger (DEV ONLY).
 *
 * Logs uncaught server-side errors (route handlers, server components) with the
 * originating request's method + path and a short stack, prefixed with
 * [appgen:server-error] so the AI agent can find them in the dev-server log:
 *   tail -n 200 /tmp/backend_startup.log | grep appgen:server-error   (Expo backend)
 *   tail -n 200 /tmp/nextjs_startup.log  | grep appgen:server-error   (web apps)
 *
 * This file is managed by AppGen and regenerated on boot. Safe to delete; it
 * only affects dev-time error visibility, never production behaviour.
 */

export async function onRequestError(err, request, context) {
  try {
    var payload = {
      tag: "appgen:server-error",
      time: new Date().toISOString(),
      method: request && request.method,
      path: request && request.path,
      routerKind: context && context.routerKind,
      routePath: context && context.routePath,
      message: err && err.message ? err.message : String(err),
      stack:
        err && err.stack
          ? String(err.stack).split("\n").slice(0, 8).join("\n")
          : undefined,
    };
    console.error("[appgen:server-error] " + JSON.stringify(payload));
  } catch (e) {
    // Never let logging throw inside the error hook.
  }
}

export function register() {}
