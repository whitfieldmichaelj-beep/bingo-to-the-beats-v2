"use client";

import Link from "next/link";
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
  const [fileName, setFileName] = useState("");
  const [tracks, setTracks] = useState<ImportedTrack[]>([]);
  const [error, setError] = useState("");
  const [isParsing, setIsParsing] = useState(false);

  const previewTracks = useMemo(
    () => tracks.slice(0, 50),
    [tracks]
  );

  function handleFileChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    setError("");
    setTracks([]);
    setFileName("");

    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Please choose a CSV file.");
      return;
    }

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
          removeDuplicates(parsedTracks);

        setTracks(uniqueTracks);
        setIsParsing(false);

        if (uniqueTracks.length === 0) {
          setError(
            "No valid song titles or artists were found. Confirm that the CSV contains Title and Artist columns."
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
            Serato and CSV Import
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
            Upload a CSV exported from Serato or another DJ
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
              Choose a Serato CSV file
            </strong>

            <span
              style={{
                display: "block",
                marginTop: "8px",
                color: "#94a3b8",
              }}
            >
              CSV files only
            </span>

            <input
              id="playlistCsv"
              type="file"
              accept=".csv,text/csv"
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
                  Import Complete
                </p>

                <h2
                  style={{
                    margin: "9px 0 0",
                    fontSize: "32px",
                  }}
                >
                  {tracks.length} tracks found
                </h2>
              </div>

              <Link
                href="/game/new"
                style={{
                  padding: "14px 22px",
                  borderRadius: "999px",
                  background: "#a3e635",
                  color: "#172554",
                  textDecoration: "none",
                  fontWeight: 900,
                }}
              >
                Continue to Game Setup
              </Link>
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