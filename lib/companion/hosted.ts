export function hostedCompanionRequired() {
  return Boolean(
    process.env.RAILWAY_ENVIRONMENT_ID ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_SERVICE_ID
  );
}

export const COMPANION_NOT_CONNECTED_MESSAGE =
  "BTTB Companion is required for hosted Serato. It runs on the DJ computer to read Serato crates and now-playing metadata; audio files are not uploaded. Start BTTB Companion, then follow the pairing screen to log out and sign back in once before the connection is approved.";
