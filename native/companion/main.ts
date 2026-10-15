import { createHash, randomBytes, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { seratoAdapter } from "../../lib/dj/serato";
import { findSeratoLibraries } from "../../lib/serato/finder";

type StoredConfig = {
  deviceId: string;
  credential?: string;
  baseUrl?: string;
};

type PairRequest = {
  ok?: boolean;
  code?: string;
  approveUrl?: string;
  expiresAt?: string;
  error?: string;
};

type PairStatus = {
  ok?: boolean;
  approved?: boolean;
  expired?: boolean;
  error?: string;
};

type SyncReply = {
  ok?: boolean;
  disconnected?: boolean;
  error?: string;
};

const LIBRARY_SCAN_MS = 30_000;
const TRACK_SYNC_MS = 2_000;
const HTTP_TIMEOUT_MS = 15_000;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sha(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function configRoot() {
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "BTTB Companion"
    );
  }

  if (process.platform === "win32") {
    return path.join(
      process.env.LOCALAPPDATA || os.homedir(),
      "BTTB Companion"
    );
  }

  return path.join(
    process.env.XDG_CONFIG_HOME ||
      path.join(os.homedir(), ".config"),
    "BTTB Companion"
  );
}

const configFile = path.join(configRoot(), "device.json");

async function loadConfig(): Promise<StoredConfig> {
  try {
    const parsed = JSON.parse(
      await fs.readFile(configFile, "utf8")
    ) as StoredConfig;

    if (parsed.deviceId) return parsed;
  } catch {
    // First run.
  }

  return {
    deviceId: randomUUID(),
  };
}

async function saveConfig(config: StoredConfig) {
  await fs.mkdir(configRoot(), {
    recursive: true,
    mode: 0o700,
  });

  const temp = `${configFile}.${process.pid}.tmp`;

  await fs.writeFile(
    temp,
    JSON.stringify(config, null, 2),
    {
      mode: 0o600,
    }
  );

  await fs.rename(temp, configFile);
}

async function requestJson<T>(
  url: string,
  options: RequestInit = {}
): Promise<{ status: number; data: T }> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    HTTP_TIMEOUT_MS
  );

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    const data = await response
      .json()
      .catch(() => ({})) as T;

    return {
      status: response.status,
      data,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function openExternal(url: string) {
  try {
    if (process.platform === "darwin") {
      spawn("open", [url], {
        detached: true,
        stdio: "ignore",
      }).unref();
      return;
    }

    if (process.platform === "win32") {
      spawn(
        "cmd",
        ["/c", "start", "", url],
        {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        }
      ).unref();
      return;
    }

    spawn("xdg-open", [url], {
      detached: true,
      stdio: "ignore",
    }).unref();
  } catch {
    // The approval URL is also printed for manual opening.
  }
}

function stablePlaylistId(localId: string) {
  return `companion-serato-playlist-${sha(localId).slice(0, 32)}`;
}

function stableTrackId(localId: string) {
  return `companion-serato-track-${sha(localId).slice(0, 32)}`;
}

function safeTrack(track: Awaited<
  ReturnType<typeof seratoAdapter.listPlaylists>
>[number]["tracks"][number]) {
  const id = stableTrackId(
    track.id || track.sourceTrackId || track.fileName
  );

  return {
    id,
    sourceTrackId: id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    version: track.version,
    duration: track.duration,
    key: track.key,
    bpm: track.bpm,
    fileName: track.fileName,
  };
}

function safePlaylist(
  playlist: Awaited<
    ReturnType<typeof seratoAdapter.listPlaylists>
  >[number]
) {
  const tracks = playlist.tracks.map(safeTrack);

  return {
    id: stablePlaylistId(playlist.id),
    name: playlist.name,
    trackCount: tracks.length,
    tracks,
  };
}

function safeDetection(
  track: Awaited<
    ReturnType<typeof seratoAdapter.nowPlaying>
  >
) {
  if (!track) return null;

  return {
    id: `companion-serato-live-${sha(track.id).slice(0, 32)}`,
    title: track.title,
    artist: track.artist,
    displayText:
      track.displayText ||
      `${track.artist} - ${track.title}`,
    playedAtText: track.playedAtText,
  };
}

function libraryLabel(libraryPath: string) {
  if (process.platform === "darwin") {
    const match = libraryPath.match(/^\/Volumes\/([^/]+)/);
    return match?.[1] || "This Mac";
  }

  if (process.platform === "win32") {
    const root = path.win32.parse(libraryPath).root;
    return root || "This PC";
  }

  return "This computer";
}

function companionBaseUrl(config: StoredConfig) {
  const argumentIndex =
    process.argv.indexOf("--url");
  const argumentUrl =
    argumentIndex >= 0
      ? process.argv[argumentIndex + 1]
      : "";

  const value =
    argumentUrl ||
    process.env.BTTB_COMPANION_URL ||
    config.baseUrl ||
    process.env.BTTB_PUBLIC_URL ||
    "";

  if (!value) {
    throw new Error(
      "BTTB Companion needs a BTTB URL. Start it with --url https://your-bttb-site."
    );
  }

  return value.replace(/\/$/, "");
}

async function pairingIsActive(
  baseUrl: string,
  credential: string
) {
  try {
    const reply =
      await requestJson<SyncReply>(
        `${baseUrl}/api/companion/heartbeat`,
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${credential}`,
          },
        }
      );

    return (
      reply.status === 200 &&
      reply.data.ok === true
    );
  } catch {
    return false;
  }
}

async function pairCompanion(
  config: StoredConfig,
  baseUrl: string
) {
  const pollKey =
    randomBytes(32).toString("base64url");
  const credential =
    randomBytes(32).toString("base64url");

  const reply =
    await requestJson<PairRequest>(
      `${baseUrl}/api/companion/request`,
      {
        method: "POST",
        body: JSON.stringify({
          deviceId: config.deviceId,
          deviceName: os.hostname(),
          secretHash: sha(pollKey),
          tokenHash: sha(credential),
        }),
      }
    );

  const data = reply.data;

  if (
    reply.status !== 200 ||
    !data.ok ||
    !data.code ||
    !data.approveUrl
  ) {
    throw new Error(
      data.error ||
        "BTTB could not start Companion pairing."
    );
  }

  console.log("");
  console.log("BTTB Companion pairing code:");
  console.log(`    ${data.code}`);
  console.log("");
  console.log(
    "Approve this code in the BTTB browser window."
  );
  console.log(data.approveUrl);
  console.log("");

  openExternal(data.approveUrl);

  const expiresAt =
    Date.parse(data.expiresAt || "") ||
    Date.now() + 10 * 60_000;

  while (Date.now() < expiresAt) {
    await sleep(2_000);

    const statusReply =
      await requestJson<PairStatus>(
        `${baseUrl}/api/companion/status`,
        {
          method: "POST",
          body: JSON.stringify({
            secret: pollKey,
          }),
        }
      );

    if (
      statusReply.status === 200 &&
      statusReply.data.approved
    ) {
      const next: StoredConfig = {
        ...config,
        credential,
        baseUrl,
      };

      await saveConfig(next);
      console.log(
        "BTTB Companion paired successfully."
      );
      return next;
    }

    if (
      statusReply.status === 410 ||
      statusReply.data.expired
    ) {
      throw new Error(
        "The Companion pairing code expired. Restart the Companion to try again."
      );
    }
  }

  throw new Error(
    "The Companion pairing code expired. Restart the Companion to try again."
  );
}

class PairingRevokedError extends Error {}

async function readLibrarySnapshot() {
  const [
    playlists,
    libraries,
    detection,
  ] = await Promise.all([
    seratoAdapter.listPlaylists(),
    findSeratoLibraries(),
    seratoAdapter
      .nowPlaying()
      .catch(() => null),
  ]);

  const safePlaylists =
    playlists.map(safePlaylist);

  const labels = Array.from(
    new Set(
      libraries.map(libraryLabel)
    )
  );

  const currentTrack =
    safeDetection(detection);

  return {
    playlists: safePlaylists,
    libraryLabels: labels,
    currentTrack,
    fingerprint: sha(
      JSON.stringify({
        playlists: safePlaylists,
        libraryLabels: labels,
      })
    ),
  };
}

async function readCurrentTrack() {
  try {
    return safeDetection(
      await seratoAdapter.nowPlaying()
    );
  } catch {
    return null;
  }
}

async function sendSync(
  baseUrl: string,
  credential: string,
  payload: Record<string, unknown>
) {
  const reply =
    await requestJson<SyncReply>(
      `${baseUrl}/api/companion/sync`,
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${credential}`,
        },
        body: JSON.stringify(payload),
      }
    );

  if (
    reply.status === 401 ||
    reply.data.disconnected
  ) {
    throw new PairingRevokedError(
      "This BTTB pairing is no longer active."
    );
  }

  if (
    reply.status !== 200 ||
    !reply.data.ok
  ) {
    throw new Error(
      reply.data.error ||
        `Companion sync failed with status ${reply.status}.`
    );
  }
}

async function heartbeat(
  baseUrl: string,
  credential: string
) {
  const reply =
    await requestJson<SyncReply>(
      `${baseUrl}/api/companion/heartbeat`,
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${credential}`,
        },
      }
    );

  if (
    reply.status === 401 ||
    reply.data.disconnected
  ) {
    throw new PairingRevokedError(
      "This BTTB pairing is no longer active."
    );
  }

  if (
    reply.status !== 200 ||
    !reply.data.ok
  ) {
    throw new Error(
      reply.data.error ||
        `Companion heartbeat failed with status ${reply.status}.`
    );
  }
}

async function disconnect(
  baseUrl: string,
  credential: string
) {
  try {
    await requestJson<SyncReply>(
      `${baseUrl}/api/companion/disconnect`,
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${credential}`,
        },
      }
    );
  } catch {
    // Heartbeat expiry is the fail-safe if the process cannot notify BTTB.
  }
}

async function clearCredential(
  config: StoredConfig
) {
  const next: StoredConfig = {
    deviceId: config.deviceId,
    baseUrl: config.baseUrl,
  };
  await saveConfig(next);
  return next;
}

async function runCompanion(
  config: StoredConfig,
  baseUrl: string,
  onCredential: (credential: string) => void
) {
  let current = config;

  if (
    !current.credential ||
    !(await pairingIsActive(
      baseUrl,
      current.credential
    ))
  ) {
    current =
      await clearCredential(current);
    current =
      await pairCompanion(
        current,
        baseUrl
      );
  }

  const credential =
    current.credential;

  if (!credential) {
    throw new Error(
      "BTTB Companion pairing did not produce a credential."
    );
  }

  onCredential(credential);

  console.log(
    "BTTB Companion connected. Reading Serato crates..."
  );

  let lastLibraryScan = 0;
  let lastLibraryFingerprint = "";
  let lastTrackFingerprint = "";
  let lastHeartbeat = 0;

  while (true) {
    try {
      const now = Date.now();

      if (
        now - lastLibraryScan >=
          LIBRARY_SCAN_MS
      ) {
        const snapshot =
          await readLibrarySnapshot();

        if (
          !lastLibraryFingerprint ||
          snapshot.fingerprint !== lastLibraryFingerprint
        ) {
          await sendSync(
            baseUrl,
            credential,
            {
              playlists:
                snapshot.playlists,
              libraryLabels:
                snapshot.libraryLabels,
              currentTrack:
                snapshot.currentTrack,
            }
          );
        } else {
          await sendSync(
            baseUrl,
            credential,
            {
              currentTrack:
                snapshot.currentTrack,
            }
          );
        }

        lastLibraryScan = now;
        lastLibraryFingerprint =
          snapshot.fingerprint;
        lastTrackFingerprint =
          sha(
            JSON.stringify(
              snapshot.currentTrack
            )
          );

        const trackCount =
          snapshot.playlists.reduce(
            (total, playlist) =>
              total +
              playlist.trackCount,
            0
          );

        console.log(
          `Synced ${snapshot.playlists.length} Serato crates / ${trackCount} crate tracks.`
        );
      } else {
        const currentTrack =
          await readCurrentTrack();
        const fingerprint =
          sha(
            JSON.stringify(
              currentTrack
            )
          );

        if (
          fingerprint !==
          lastTrackFingerprint
        ) {
          await sendSync(
            baseUrl,
            credential,
            {
              currentTrack,
            }
          );

          lastTrackFingerprint =
            fingerprint;

          if (currentTrack) {
            console.log(
              `Now playing: ${currentTrack.artist} — ${currentTrack.title}`
            );
          }
        } else if (
          now - lastHeartbeat >=
          20_000
        ) {
          await heartbeat(
            baseUrl,
            credential
          );
          lastHeartbeat = now;
        }
      }

      await sleep(TRACK_SYNC_MS);
    } catch (error) {
      if (
        error instanceof
        PairingRevokedError
      ) {
        await clearCredential(
          current
        );
        console.log(
          "BTTB Companion disconnected. This computer's Serato library is no longer shared with the signed-out account."
        );
        return;
      }

      console.warn(
        "BTTB Companion sync warning:",
        error instanceof Error
          ? error.message
          : String(error)
      );

      try {
        await heartbeat(
          baseUrl,
          credential
        );
      } catch (
        heartbeatError
      ) {
        if (
          heartbeatError instanceof
          PairingRevokedError
        ) {
          await clearCredential(
            current
          );
          console.log(
            "BTTB Companion disconnected. This computer's Serato library is no longer shared with the signed-out account."
          );
          return;
        }
      }

      await sleep(5_000);
    }
  }
}

async function main() {
  if (process.argv.includes("--scan-only")) {
    const snapshot =
      await readLibrarySnapshot();
    const trackCount =
      snapshot.playlists.reduce(
        (total, playlist) =>
          total + playlist.trackCount,
        0
      );

    console.log(
      JSON.stringify(
        {
          ok: true,
          playlistCount:
            snapshot.playlists.length,
          trackCount,
          libraryLabels:
            snapshot.libraryLabels,
          nowPlaying:
            snapshot.currentTrack
              ? {
                  title:
                    snapshot.currentTrack.title,
                  artist:
                    snapshot.currentTrack.artist,
                }
              : null,
        },
        null,
        2
      )
    );
    return;
  }

  const config =
    await loadConfig();
  const baseUrl =
    companionBaseUrl(config);

  await saveConfig({
    ...config,
    baseUrl,
  });

  let activeCredential =
    config.credential;

  const shutdown = async () => {
    if (activeCredential) {
      await disconnect(
        baseUrl,
        activeCredential
      );
    }
    process.exit(0);
  };

  process.once(
    "SIGINT",
    () => {
      void shutdown();
    }
  );
  process.once(
    "SIGTERM",
    () => {
      void shutdown();
    }
  );

  await runCompanion(
    {
      ...config,
      baseUrl,
    },
    baseUrl,
    (credential) => {
      activeCredential = credential;
    }
  );
}

main().catch((error) => {
  console.error(
    "BTTB Companion stopped:",
    error instanceof Error
      ? error.message
      : String(error)
  );
  process.exitCode = 1;
});
