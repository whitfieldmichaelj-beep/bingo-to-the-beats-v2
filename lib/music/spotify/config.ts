const REQUIRED_SPOTIFY_SCOPES = [
  "user-read-private",
  "user-read-email",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-read-playback-state",
  "user-read-currently-playing",
  "user-modify-playback-state",
] as const;

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getSpotifyConfig() {
  return {
    clientId: requireEnvironmentVariable("SPOTIFY_CLIENT_ID"),
    clientSecret: requireEnvironmentVariable("SPOTIFY_CLIENT_SECRET"),
    redirectUri: requireEnvironmentVariable("SPOTIFY_REDIRECT_URI"),
    scopes: [...REQUIRED_SPOTIFY_SCOPES],
  };
}
