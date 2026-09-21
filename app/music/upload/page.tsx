"use client";

import Link from "next/link";
import { excludedDjSong } from "@/lib/serato/song-filter";
import Papa from "papaparse";
import { ChangeEvent, useMemo, useState } from "react";

type CsvRow = Record<string, string | undefined>;

type ImportedTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  bpm: string;
  key: string;
  length: string;
  filename: string;
};

const COLUMN_ALIASES = {
  title: ["title", "track title", "track", "song", "name"],
  artist: ["artist", "artist name", "artists"],
  album: ["album", "album name"],
  genre: ["genre"],
  bpm: ["bpm", "tempo"],
  key: ["key", "musical key"],
  length: ["length", "duration", "time"],
  filename: [
    "filename",
    "file name",
    "location",
    "path",
    "file path",
  ],
};

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function findValue(
  row: CsvRow,
  aliases: string[]
): string {
  const normalizedEntries = Object.entries(row).map(
    ([key, value]) => [
      normalizeHeader(key),
      String(value ?? "").trim(),
    ]
  );

  for (const alias of aliases) {
    const match = normalizedEntries.find(
      ([key]) => key === alias
    );

    if (match?.[1]) {
      return match[1];
    }
  }

  return "";
}

function createTrack(row: CsvRow, index: number): ImportedTrack | null {
  const title = findValue(row, COLUMN_ALIASES.title);
  const artist = findValue(row, COLUMN_ALIASES.artist);

  if (!title && !artist) {
    return null;
  }

  return {
    id: `${index}-${title}-${artist}`,
    title: title || "Untitled Track",
    artist: artist || "Unknown Artist",
    album: findValue(row, COLUMN_ALIASES.album),
    genre: findValue(row, COLUMN_ALIASES.genre),
    bpm: findValue(row, COLUMN_ALIASES.bpm),
    key: findValue(row, COLUMN_ALIASES.key),
    length: findValue(row, COLUMN_ALIASES.length),
    filename: findValue(row, COLUMN_ALIASES.filename),
  };
}

function removeDuplicates(
  tracks: ImportedTrack[]
): ImportedTrack[] {
  const seen = new Set<string>();

  return tracks.filter((track) => {
    const duplicateKey = `${track.title}|${track.artist}`
      .trim()
      .toLowerCase();

    if (seen.has(duplicateKey)) {
      return false;
    }

    seen.add(duplicateKey);
    return true;
  });
}

export default function CsvUploadPage() {
  const [excludedCount, setExcludedCount] = useState(0);
  function prepareTracks(input: ImportedTrack[]) {
    const eligible = input.filter(track => !excludedDjSong(track.title, track.filename));
    setExcludedCount(input.length - eligible.length);
    return removeDuplicates(eligible);
  }
  const [creating, setCreating] = useState(false);
  const [cardCount, setCardCount] = useState(5);
  async function createDjGame() {
    setCreating(true); setError("");
    try {
      const response = await fetch("/api/game/create/serato-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tracks: tracks.map(({ title, artist }) => ({ title, artist })), name: fileName.replace(/\.(csv|crate|scrate)$/i, ""), cardCount, clipLength: 30 }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create game.");
      window.location.assign(`/dj-console?gameId=${encodeURIComponent(data.game.id)}`);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create game."); setCreating(false); }
  }
  const [fileName, setFileName] = useState("");
  const [tracks, setTracks] = useState<ImportedTrack[]>([]);
  const [error, setError] = useState("");
  const [isParsing, setIsParsing] = useState(false);

  const previewTracks = useMemo(
    () => tracks.slice(0, 50),
    [tracks]
  );

  async function handleFileChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    setError("");
    setTracks([]);
    setExcludedCount(0);
    setFileName("");

    if (!file) {
      return;
    }

    if (/\.(crate|scrate)$/i.test(file.name)) {
      if (!file.size || file.size > 5 * 1024 * 1024) { setError("Choose a crate file smaller than 5 MB."); return; }
      setIsParsing(true); setFileName(file.name);
      try {
        const form = new FormData(); form.append("file", file);
        const response = await fetch("/api/serato/import", { method: "POST", body: form, signal: AbortSignal.timeout(60000) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || data.message || "Could not read this crate.");
        setTracks(prepareTracks(data.tracks));
      } catch (err) { setError(err instanceof Error ? err.message : "Could not read this crate."); }
      finally { setIsParsing(false); }
      return;
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Please choose a .crate, .scrate, or .csv file.");
      return;
    }

    if (file.size > 500000) { setError("Choose a CSV smaller than 500 KB."); return; }
    setFileName(file.name);
    setIsParsing(true);

    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: normalizeHeader,

      complete(results) {
        const parsedTracks = results.data
          .map(createTrack)
          .filter(
            (track): track is ImportedTrack =>
              track !== null
          );

        const uniqueTracks =
          prepareTracks(parsedTracks);

        setTracks(uniqueTracks);
        sessionStorage.setItem(
  "bttbPlaylist",
  JSON.stringify(uniqueTracks)
);
        setIsParsing(false);

        if (uniqueTracks.length === 0) {
          setError(
            "No eligible songs remain. Use Title and Artist columns and include songs other than acapella, instrumental, or intro/outro edits."
          );
        }
      },

      error(parseError) {
        console.error("CSV parsing error:", parseError);
        setIsParsing(false);
        setError(
          "The CSV could not be read. Please export it again and retry."
        );
      },
    });
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "72px 24px 100px",
        background:
          "radial-gradient(circle at top, #0c4a6e 0%, #111827 44%, #030712 100%)",
        color: "white",
      }}
    >
      <section
        style={{
          width: "min(100%, 1100px)",
          margin: "0 auto",
        }}
      >
        <Link
          href="/music"
          style={{
            color: "#7dd3fc",
            textDecoration: "none",
            fontWeight: 800,
          }}
        >
          ← Back to Music Providers
        </Link>

        <p style={{ marginTop: 24 }}>Keep your external music drive connected. On this Mac, crate files are matched against your Serato library. Smart crates use their last saved song list; open the crate in Serato first to update it. This does not upload your audio.</p>
        <header
          style={{
            maxWidth: "760px",
            margin: "34px auto 0",
            textAlign: "center",
          }}
        >
          <p
            style={{
              margin: 0,
              color: "#38bdf8",
              fontSize: "14px",
              fontWeight: 900,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            Serato Crate Import
          </p>

          <h1
            style={{
              margin: "14px 0 0",
              fontSize: "clamp(42px, 7vw, 70px)",
              lineHeight: 1,
              letterSpacing: "-0.04em",
            }}
          >
            Upload your DJ playlist
          </h1>

          <p
            style={{
              margin: "22px auto 0",
              maxWidth: "680px",
              color: "#cbd5e1",
              fontSize: "18px",
              lineHeight: 1.7,
            }}
          >
            Select a Serato .crate or .scrate file, or a CSV from your DJ
            library. BTTB will identify the track title, artist,
            BPM, genre, key, and other available information.
          </p>
        </header>

        <section
          style={{
            marginTop: "44px",
            padding: "34px",
            borderRadius: "24px",
            background: "rgba(15, 23, 42, 0.94)",
            border: "1px solid rgba(56, 189, 248, 0.38)",
          }}
        >
          <label
            htmlFor="playlistCsv"
            style={{
              display: "block",
              padding: "44px 24px",
              textAlign: "center",
              borderRadius: "20px",
              border: "2px dashed #0ea5e9",
              background: "rgba(14, 165, 233, 0.08)",
              cursor: "pointer",
            }}
          >
            <span
              style={{
                display: "block",
                fontSize: "42px",
              }}
            >
              ↑
            </span>

            <strong
              style={{
                display: "block",
                marginTop: "14px",
                fontSize: "22px",
              }}
            >
              Choose a Serato crate or song list
            </strong>

            <span
              style={{
                display: "block",
                marginTop: "8px",
                color: "#94a3b8",
              }}
            >
              .crate, .scrate, or .csv
            </span>

            <input
              id="playlistCsv"
              type="file"
              accept=".crate,.scrate,.csv,text/csv"
              disabled={isParsing || creating}
              onChange={handleFileChange}
              style={{
                display: "none",
              }}
            />
          </label>

          {fileName && (
            <p
              style={{
                margin: "18px 0 0",
                textAlign: "center",
                color: "#bae6fd",
                fontWeight: 800,
              }}
            >
              Selected: {fileName}
            </p>
          )}

          {isParsing && (
            <p
              style={{
                margin: "22px 0 0",
                textAlign: "center",
                color: "#cbd5e1",
              }}
            >
              Reading playlist…
            </p>
          )}

          {error && (
            <div
              style={{
                marginTop: "24px",
                padding: "18px",
                borderRadius: "16px",
                background: "rgba(244, 63, 94, 0.12)",
                border: "1px solid rgba(244, 63, 94, 0.35)",
                color: "#fda4af",
              }}
            >
              {error}
            </div>
          )}
        </section>

        {tracks.length > 0 && (
          <section
            style={{
              marginTop: "30px",
              padding: "30px",
              borderRadius: "24px",
              background: "rgba(15, 23, 42, 0.94)",
              border: "1px solid #334155",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "end",
                flexWrap: "wrap",
                gap: "16px",
              }}
            >
              <div>
                <p
                  style={{
                    margin: 0,
                    color: "#38bdf8",
                    fontSize: "13px",
                    fontWeight: 900,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  Import Complete — {excludedCount} excluded edits
                </p>

                <h2
                  style={{
                    margin: "9px 0 0",
                    fontSize: "32px",
                  }}
                >
                  {tracks.length} eligible tracks
                </h2>
              </div>

              <div>
                <p>Play music in Serato on this Mac. BTTB follows its local play history; this import contains song names only.</p>
                <label>Game size <select value={cardCount} onChange={event => setCardCount(Number(event.target.value))} style={{ color: "#172554", backgroundColor: "#e0f2fe", colorScheme: "light", border: "2px solid #38bdf8", borderRadius: "10px", padding: "10px 12px", margin: "8px 0 8px 8px", fontWeight: 700, maxWidth: "100%", cursor: "pointer" }}><option value={5}>Free practice — 5 players</option><option value={100}>DJ plan — 100 players</option><option value={200}>DJ Pro Plus — 200 players</option></select></label>
                <button type="button" disabled={creating || tracks.length < 25 || tracks.length > 500} onClick={() => void createDjGame()} style={{ padding: 14, marginLeft: 12, background: "#a3e635", color: "#172554", borderRadius: 16 }}>{creating ? "Creating…" : "Create DJ Game"}</button>
                <p>Requires 25–500 unique songs. Open Serato, connect from the DJ Console, then play a new song.</p>
              </div>
            </div>

            <div
              style={{
                marginTop: "26px",
                overflowX: "auto",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: "760px",
                }}
              >
                <thead>
                  <tr>
                    {[
                      "#",
                      "Title",
                      "Artist",
                      "BPM",
                      "Genre",
                      "Key",
                    ].map((heading) => (
                      <th
                        key={heading}
                        style={{
                          padding: "13px",
                          textAlign: "left",
                          borderBottom: "1px solid #475569",
                          color: "#94a3b8",
                          fontSize: "13px",
                        }}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {previewTracks.map((track, index) => (
                    <tr key={track.id}>
                      <td style={tableCellStyle}>
                        {index + 1}
                      </td>
                      <td style={tableCellStyle}>
                        <strong>{track.title}</strong>
                      </td>
                      <td style={tableCellStyle}>
                        {track.artist}
                      </td>
                      <td style={tableCellStyle}>
                        {track.bpm || "—"}
                      </td>
                      <td style={tableCellStyle}>
                        {track.genre || "—"}
                      </td>
                      <td style={tableCellStyle}>
                        {track.key || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {tracks.length > previewTracks.length && (
              <p
                style={{
                  margin: "20px 0 0",
                  color: "#94a3b8",
                  textAlign: "center",
                }}
              >
                Showing the first {previewTracks.length} of{" "}
                {tracks.length} tracks.
              </p>
            )}
          </section>
        )}
      </section>
    </main>
  );
}

const tableCellStyle = {
  padding: "15px 13px",
  borderBottom: "1px solid #1e293b",
  color: "#e2e8f0",
};