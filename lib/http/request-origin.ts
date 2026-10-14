// Next's development proxy may normalize request.url to localhost even when
// the browser uses 127.0.0.1. Preserve only the explicitly allowed loopback
// aliases and the same port; never trust an arbitrary Host for redirects.
export function requestOrigin(request: { url: string; headers: Headers }) {
  // Hosted requests can arrive with an internal localhost URL. Use the
  // configured public origin rather than trusting client-controlled headers.
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_APP_URL) {
    const configured = new URL(process.env.NEXT_PUBLIC_APP_URL);
    if (!["http:", "https:"].includes(configured.protocol) || configured.username || configured.password) {
      throw new Error("NEXT_PUBLIC_APP_URL must be an HTTP(S) URL without credentials.");
    }
    return configured.origin;
  }
  const url = new URL(request.url);
  const host = request.headers.get("host");
  if (host && ["localhost", "127.0.0.1"].includes(url.hostname)) {
    try {
      const actual = new URL(`${url.protocol}//${host}`);
      if (["localhost", "127.0.0.1"].includes(actual.hostname) && actual.port === url.port && !actual.username && !actual.password && actual.pathname === "/" && !actual.search && !actual.hash) return actual.origin;
    } catch { /* Keep the server-provided origin for malformed hosts. */ }
  }
  return url.origin;
}

