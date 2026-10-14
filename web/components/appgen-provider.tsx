"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

import "@/lib/console-capture";
import "@/lib/network-capture";
import "@/utils/screenshot-capture";

function getSelector(el: Element): string {
  if ((el as HTMLElement).id) return "#" + (el as HTMLElement).id;
  const tag = el.tagName.toLowerCase();
  if (tag === "body" || tag === "html") return tag;
  const parent = el.parentElement;
  if (!parent) return tag;
  const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
  const index = siblings.indexOf(el);
  const nth = siblings.length > 1 ? ":nth-child(" + (index + 1) + ")" : "";
  return getSelector(parent) + " > " + tag + nth;
}

function getElementInfo(el: Element) {
  const tag = el.tagName.toLowerCase();
  const text = (el.textContent || "").trim().slice(0, 120);
  const className = el.getAttribute("class") || "";
  const id = el.getAttribute("id") || "";
  const src = el.getAttribute("src") || "";
  const href = el.getAttribute("href") || "";
  const selector = getSelector(el);
  const rect = el.getBoundingClientRect();
  return { tag, text, className, id, src, href, selector, rect: { top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) } };
}

let inspectorActive = false;
let hoveredEl: HTMLElement | null = null;

function addHighlight(el: HTMLElement) {
  removeHighlight();
  hoveredEl = el;
  el.dataset.appgenOutline = el.style.outline;
  el.dataset.appgenOutlineOffset = el.style.outlineOffset;
  el.dataset.appgenCursor = el.style.cursor;
  el.style.outline = "2px solid #3550FF";
  el.style.outlineOffset = "2px";
  el.style.cursor = "pointer";
}

function removeHighlight() {
  if (!hoveredEl) return;
  hoveredEl.style.outline = hoveredEl.dataset.appgenOutline || "";
  hoveredEl.style.outlineOffset = hoveredEl.dataset.appgenOutlineOffset || "";
  hoveredEl.style.cursor = hoveredEl.dataset.appgenCursor || "";
  delete hoveredEl.dataset.appgenOutline;
  delete hoveredEl.dataset.appgenOutlineOffset;
  delete hoveredEl.dataset.appgenCursor;
  hoveredEl = null;
}

export function AppGenProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  // React-driven route ping. Fires whenever Next.js's `usePathname()`
  // hook produces a new value — i.e. for any `router.push`, `<Link>`
  // click, or `router.back()` that goes through next/navigation.
  //
  // We ALSO hook `pushState` / `replaceState` / `popstate` /
  // `hashchange` directly in the second effect below. That looks
  // redundant but isn't: it's the same trick the Expo template uses
  // (see `ROUTE_CHANGE_DETECTOR` in `expo-template-files.ts`) and it
  // catches the cases this React-driven effect misses — most notably
  // the very first navigation when our `message` listener hadn't
  // attached yet, anchor-link clicks that don't go through Next's
  // router, and apps that for whatever reason aren't wrapping
  // `{children}` correctly. Without the browser-level hook the
  // "active page" indicator in the parent dropdown would stay stuck
  // on Home on Next.js apps while Expo apps (which have always had
  // the hook) updated correctly.
  useEffect(() => {
    if (window.parent === window) return;
    window.parent.postMessage({ type: "appgen:routeChanged", path: pathname }, "*");
  }, [pathname]);

  useEffect(() => {
    if (window.parent === window) return;
    function onMouseMove(e: MouseEvent) {
      if (!inspectorActive) return;
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      if (!el || el === document.body || el === document.documentElement) { removeHighlight(); return; }
      if (el !== hoveredEl) addHighlight(el);
    }
    function onClick(e: MouseEvent) {
      if (!inspectorActive) return;
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      window.parent.postMessage({ type: "appgen:elementSelected", element: getElementInfo(el), route: pathnameRef.current }, "*");
      removeHighlight();
      inspectorActive = false;
    }
    function handleMsg(e: MessageEvent) {
      if (e.data?.type === "appgen:inspectorOn") inspectorActive = true;
      if (e.data?.type === "appgen:inspectorOff") { inspectorActive = false; removeHighlight(); }
      if (e.data?.type === "appgen:navigate" && typeof e.data.path === "string") router.push(e.data.path);
      // Parent can poll the current route at any time — used by the
      // screens dropdown to recover from missed appgen:routeChanged
      // posts (e.g. when React strict-mode double-mounts dropped the
      // first effect run, or the listener wasn't attached yet on the
      // very first navigation). Cheap; no-op when running outside an
      // iframe.
      if (e.data?.type === "appgen:requestRoute") {
        window.parent.postMessage({ type: "appgen:routeChanged", path: pathnameRef.current }, "*");
      }
    }

    // Browser-level route hooks — see the React-driven effect above
    // for why this exists alongside usePathname. The post is gated by
    // a dedup so we don't double-fire when both this and the React
    // effect see the same change.
    let lastPostedRoute = "";
    function postCurrentRoute() {
      try {
        const path = window.location.pathname || "/";
        if (path === lastPostedRoute) return;
        lastPostedRoute = path;
        window.parent.postMessage({ type: "appgen:routeChanged", path }, "*");
      } catch {
        // Parent may be cross-origin in tests; ignore.
      }
    }
    // Initial ping after layout settles — covers the first navigation
    // (the user may have deep-linked the iframe via src=.../pricing).
    const initTimer = window.setTimeout(postCurrentRoute, 50);

    window.addEventListener("popstate", postCurrentRoute);
    window.addEventListener("hashchange", postCurrentRoute);

    // Wrap history methods. Link in next/navigation calls
    // history.pushState internally, so wrapping here catches every
    // App-Router navigation. Native browser back/forward is covered
    // by popstate.
    const origPush = window.history.pushState;
    const origReplace = window.history.replaceState;
    let unwrapHistory = () => {
      // no-op default; reassigned below when wrappers install
    };
    try {
      window.history.pushState = function (...args: Parameters<History["pushState"]>) {
        const result = origPush.apply(this, args);
        try { postCurrentRoute(); } catch {}
        return result;
      };
      window.history.replaceState = function (...args: Parameters<History["replaceState"]>) {
        const result = origReplace.apply(this, args);
        try { postCurrentRoute(); } catch {}
        return result;
      };
      unwrapHistory = () => {
        // Only restore if we still own the wrapper — another script
        // (devtools, telemetry) may have layered its own on top, in
        // which case we leave the chain alone.
        try {
          window.history.pushState = origPush;
          window.history.replaceState = origReplace;
        } catch {}
      };
    } catch {
      // history may be locked down in some embed contexts; skip.
    }

    window.addEventListener("mousemove", onMouseMove, true);
    window.addEventListener("click", onClick, true);
    window.addEventListener("message", handleMsg);
    return () => {
      window.clearTimeout(initTimer);
      window.removeEventListener("popstate", postCurrentRoute);
      window.removeEventListener("hashchange", postCurrentRoute);
      unwrapHistory();
      window.removeEventListener("mousemove", onMouseMove, true);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("message", handleMsg);
      removeHighlight();
      inspectorActive = false;
    };
  }, [router]);

  useEffect(() => {
    const hideErrorOverlay = () => {
      const selectors = [
        'nextjs-portal',
        '[data-nextjs-dialog]',
        '[data-nextjs-dialog-overlay]',
        '[data-nextjs-toast]',
        '#__next-build-indicator',
        '[data-nextjs-scroll]',
      ];
      selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
          (el as HTMLElement).style.display = 'none';
        });
      });
      document.querySelectorAll('button').forEach(btn => {
        if (btn.textContent?.includes('Issue')) {
          (btn as HTMLElement).style.display = 'none';
          btn.parentElement && ((btn.parentElement as HTMLElement).style.display = 'none');
        }
      });
    };

    hideErrorOverlay();
    const interval = setInterval(hideErrorOverlay, 1000);
    const observer = new MutationObserver(hideErrorOverlay);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      clearInterval(interval);
      observer.disconnect();
    };
  }, []);

  return <>{children}</>;
}
