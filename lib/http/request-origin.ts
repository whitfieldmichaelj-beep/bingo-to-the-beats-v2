// Next's development proxy may normalize request.url to localhost even when
// the browser uses 127.0.0.1. Preserve only the explicitly allowed loopback
// aliases and the same port; never trust an arbitrary Host for redirects.
export function requestOrigin(request: { url: string; headers: Headers }) {
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
