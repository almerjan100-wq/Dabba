/**
 * AppGen network request interceptor (DEV ONLY). appgen-network-capture v2
 *
 * Wraps fetch + XMLHttpRequest in the preview and forwards request/response
 * metadata to the AppGen editor so the AI agent can inspect failing API calls
 * (status, body, headers, CORS/network failures). Stripped from production
 * builds. Do not edit — this file is regenerated on every sandbox boot.
 */
// @ts-nocheck

if (typeof window !== "undefined" && window.parent !== window) {
  var MAX_BODY = 4000;
  var REDACT = ["authorization", "cookie", "set-cookie", "x-api-key", "x-auth-token"];

  var post = function (entry) {
    try {
      window.parent.postMessage({ type: "appgen:network", entry: entry }, "*");
    } catch (e) {}
  };

  var truncate = function (s) {
    if (typeof s !== "string") return undefined;
    return s.length > MAX_BODY ? s.slice(0, MAX_BODY) + "...[truncated]" : s;
  };

  var headersToObj = function (h) {
    var o = {};
    if (!h || typeof h.forEach !== "function") return o;
    try {
      h.forEach(function (value, key) {
        o[key] = REDACT.indexOf(String(key).toLowerCase()) >= 0 ? "[redacted]" : value;
      });
    } catch (e) {}
    return o;
  };

  // Dev/HMR/internal/telemetry traffic we don't want cluttering the history.
  // `/cdn-cgi/` covers Cloudflare RUM (`/cdn-cgi/rum?`) + challenge beacons,
  // which otherwise flood the log and hide real app API calls.
  var isInternal = function (url) {
    if (!url) return false;
    if (/^wss?:/i.test(url)) return true;
    return /(\/_next\/|__nextjs|hot-update|webpack-hmr|\/_expo\/|\/\.expo\/|symbolicate|\/node_modules\/|\/cdn-cgi\/)/.test(url);
  };

  // ---- fetch ----------------------------------------------------------------
  if (typeof window.fetch === "function") {
    var origFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      init = init || {};
      var url = typeof input === "string" ? input : (input && input.url) || String(input);
      var method = String(init.method || (input && input.method) || "GET").toUpperCase();
      if (isInternal(url)) return origFetch(input, init);
      var started = Date.now();
      var reqBody = typeof init.body === "string" ? truncate(init.body) : undefined;
      return origFetch(input, init).then(function (res) {
        var emit = function (body) {
          post({
            kind: "fetch",
            url: url,
            method: method,
            status: res.status,
            statusText: res.statusText,
            ok: res.ok,
            responseType: res.type,
            requestBody: reqBody,
            responseHeaders: headersToObj(res.headers),
            responseBody: truncate(body),
            durationMs: Date.now() - started,
            timestamp: started,
          });
        };
        try {
          res.clone().text().then(emit).catch(function () { emit(undefined); });
        } catch (e) {
          emit(undefined);
        }
        return res;
      }).catch(function (err) {
        post({
          kind: "fetch",
          url: url,
          method: method,
          error: err && err.message ? err.message : String(err),
          likelyCors: typeof TypeError !== "undefined" && err instanceof TypeError,
          durationMs: Date.now() - started,
          timestamp: started,
        });
        throw err;
      });
    };
  }

  // ---- XMLHttpRequest -------------------------------------------------------
  if (typeof XMLHttpRequest !== "undefined" && XMLHttpRequest.prototype) {
    var proto = XMLHttpRequest.prototype;
    var origOpen = proto.open;
    var origSend = proto.send;
    proto.open = function (method, url) {
      try {
        this.__appgenNet = { method: String(method || "GET").toUpperCase(), url: url, started: 0 };
      } catch (e) {}
      return origOpen.apply(this, arguments);
    };
    proto.send = function (body) {
      var meta = this.__appgenNet;
      if (meta && !isInternal(meta.url)) {
        meta.started = Date.now();
        meta.reqBody = typeof body === "string" ? truncate(body) : undefined;
        var xhr = this;
        try {
          this.addEventListener("loadend", function () {
            var respBody;
            try {
              if (xhr.responseType === "" || xhr.responseType === "text") {
                respBody = truncate(xhr.responseText);
              }
            } catch (e) {}
            post({
              kind: "xhr",
              url: meta.url,
              method: meta.method,
              status: xhr.status,
              statusText: xhr.statusText,
              ok: xhr.status >= 200 && xhr.status < 400,
              requestBody: meta.reqBody,
              responseBody: respBody,
              error: xhr.status === 0 ? "Request failed (status 0 - likely CORS, network error, or aborted)" : undefined,
              likelyCors: xhr.status === 0,
              durationMs: Date.now() - meta.started,
              timestamp: meta.started,
            });
          });
        } catch (e) {}
      }
      return origSend.apply(this, arguments);
    };
  }
}
