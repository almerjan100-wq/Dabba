/**
 * Route change detector for the AppGen preview.
 *
 * Standalone side-effect module. Imported once from `app/layout.tsx` (see
 * `ensureAppGenProviderInLayoutContent`). Posts `appgen:routeChanged`
 * to the parent window on every in-iframe navigation so the screens
 * dropdown's active indicator stays in sync.
 *
 * Designed to work even when `AppGenProvider` is missing or
 * mis-wrapped — uses raw browser APIs, not React.
 */

if (typeof window !== "undefined") {
  let lastRoute = "";

  const postRoute = () => {
    try {
      if (!window.parent || typeof window.parent.postMessage !== "function") return;
      const path = window.location.pathname || "/";
      if (path === lastRoute) return;
      lastRoute = path;
      window.parent.postMessage({ type: "appgen:routeChanged", path }, "*");
    } catch (e) {
      // Ignore — parent may be cross-origin or not present (production build).
    }
  };

  // Initial ping after layout settles — catches deep-linked iframe loads
  // (e.g. parent set iframe.src = .../pricing on mount).
  window.setTimeout(postRoute, 50);

  try { window.addEventListener("popstate", postRoute); } catch (e) {}
  try { window.addEventListener("hashchange", postRoute); } catch (e) {}

  // Wrap history methods. next/navigation's <Link> calls history.pushState
  // internally, so wrapping these is what catches every App-Router
  // navigation. Native browser back/forward is covered by popstate above.
  try {
    if (window.history && typeof window.history.pushState === "function") {
      const origPush = window.history.pushState.bind(window.history);
      window.history.pushState = function () {
        const result = origPush.apply(this, arguments);
        try { postRoute(); } catch (e) {}
        return result;
      };
    }
    if (window.history && typeof window.history.replaceState === "function") {
      const origReplace = window.history.replaceState.bind(window.history);
      window.history.replaceState = function () {
        const result = origReplace.apply(this, arguments);
        try { postRoute(); } catch (e) {}
        return result;
      };
    }
  } catch (e) {
    // history may be locked down in some embed contexts; skip.
  }

  // Respond to explicit polls from the parent — the screens dropdown uses
  // this as a defensive recovery path if any of the above signals were
  // missed (e.g. the listener attached after the initial pushState).
  try {
    window.addEventListener("message", (e) => {
      if (e && e.data && e.data.type === "appgen:requestRoute") postRoute();
    });
  } catch (e) {}
}

export {};
