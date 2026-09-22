import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.BTTB_PHONE_TEST === "1" ? ".next-phone-test" : ".next",
  serverExternalPackages: ["rekordbox-connect", "better-sqlite3-multiple-ciphers", "serato-connect"],
  allowedDevOrigins: ["127.0.0.1", ...(process.env.NEXT_PUBLIC_APP_URL ? [new URL(process.env.NEXT_PUBLIC_APP_URL).hostname] : [])],
};

export default nextConfig;