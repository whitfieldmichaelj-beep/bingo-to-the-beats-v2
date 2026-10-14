export function localWidgetRequest(request: { url: string; headers: Headers }): boolean {
  try {
    const url = new URL(request.url);
    const host = request.headers.get("host");
    if (!host) return false;
    const actual = new URL(`${url.protocol}//${host}`);
    return ["localhost", "127.0.0.1", "[::1]"].includes(actual.hostname)
      && actual.port === url.port && actual.pathname === "/" && !actual.username && !actual.password
      && request.headers.get("origin") === actual.origin
      && request.headers.get("content-type")?.split(";")[0] === "application/json";
  } catch { return false; }
}
