import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["rekordbox-connect", "better-sqlite3-multiple-ciphers", "serato-connect"],
  allowedDevOrigins: ["127.0.0.1", "192.168.1.239"],
};

export default nextConfig;