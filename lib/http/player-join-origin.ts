function isLocalHost(host: string) {
  if (["localhost", "127.0.0.1", "[::1]"].includes(host)) return true;
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  return parts[0] === 10 || (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31);
}

/** Keep the phone-accessible LAN hostname, but use the active local server port. */
export function playerJoinOrigin(browserOrigin: string, configuredUrl?: string) {
  const browser = new URL(browserOrigin);
  if (!configuredUrl?.trim()) return browser.origin;
  try {
    const configured = new URL(configuredUrl.trim());
    if (!["http:", "https:"].includes(configured.protocol)) return browser.origin;
    if (isLocalHost(browser.hostname) && isLocalHost(configured.hostname)) {
      configured.port = browser.port;
      configured.protocol = browser.protocol;
    }
    return configured.origin;
  } catch {
    return browser.origin;
  }
}
