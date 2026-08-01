import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SeratoTrack = {
  id: string;
  artist: string;
  title: string;
  displayText: string;
  playedAtText: string | null;
};

type TrackCandidate = {
  artist: string;
  title: string;
  playedAtText: string | null;
};

const DEFAULT_LIVE_URL =
  "https://serato.com/playlists/IAMDJMIKEDOELO/live";

const NON_TRACK_TEXT =
  /(?:©|&copy;|all rights reserved|serato 19\d{2}|privacy|copyright|products|community|sign in|create account|do not sell|playlist by|serato dj playlists|terms of service|cookie policy)/i;

function respond(
  body: Record<string, unknown>,
  status = 200
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control":
        "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&copy;/gi, "©")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(Number(code))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCharCode(parseInt(code, 16))
    );
}

function cleanText(value: string) {
  return decodeHtml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u0027/gi, "'")
    .replace(/\\u0022/gi, '"')
    .replace(/\\n|\\r|\\t/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\s*[•·]\s*/, "")
    .trim();
}

function stripTagsToLines(value: string) {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(
        /<\/(?:div|li|p|td|tr|section|article|h\d|span)>/gi,
        "\n"
      )
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => cleanText(line))
    .filter(Boolean);
}

function isTimeLine(value: string) {
  return /^(?:\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]m)?|just now|\d+\s+(?:seconds?|minutes?|hours?)\s+ago)$/i.test(
    cleanText(value)
  );
}

function isValidTrackPart(value: string) {
  const cleaned = cleanText(value);

  if (
    cleaned.length < 1 ||
    cleaned.length > 220 ||
    NON_TRACK_TEXT.test(cleaned) ||
    /^https?:\/\//i.test(cleaned)
  ) {
    return false;
  }

  return true;
}

function splitArtistAndTitle(displayText: string) {
  const cleaned = cleanText(displayText);

  for (const separator of [" - ", " – ", " — "]) {
    const index = cleaned.indexOf(separator);

    if (index > 0) {
      const artist = cleanText(
        cleaned.slice(0, index)
      );
      const title = cleanText(
        cleaned.slice(index + separator.length)
      );

      if (
        isValidTrackPart(artist) &&
        isValidTrackPart(title)
      ) {
        return {
          artist,
          title,
        };
      }
    }
  }

  return null;
}

function createTrack(
  artistValue: string,
  titleValue: string,
  playedAtText: string | null
): SeratoTrack | null {
  const artist = cleanText(artistValue);
  const title = cleanText(titleValue);

  if (
    !isValidTrackPart(artist) ||
    !isValidTrackPart(title)
  ) {
    return null;
  }

  if (
    artist.toLowerCase() === title.toLowerCase() ||
    isTimeLine(artist) ||
    isTimeLine(title)
  ) {
    return null;
  }

  const displayText = `${artist} - ${title}`;

  const id = displayText
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  if (!id) {
    return null;
  }

  return {
    id,
    artist,
    title,
    displayText,
    playedAtText,
  };
}

function addCandidate(
  candidates: TrackCandidate[],
  artist: string,
  title: string,
  playedAtText: string | null = null
) {
  const cleanedArtist = cleanText(artist);
  const cleanedTitle = cleanText(title);

  if (
    !isValidTrackPart(cleanedArtist) ||
    !isValidTrackPart(cleanedTitle)
  ) {
    return;
  }

  candidates.push({
    artist: cleanedArtist,
    title: cleanedTitle,
    playedAtText: playedAtText
      ? cleanText(playedAtText)
      : null,
  });
}

function extractCombinedTextTracks(
  html: string,
  candidates: TrackCandidate[]
) {
  const blockPatterns = [
    /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi,
    /<li\b[^>]*>([\s\S]*?)<\/li>/gi,
    /<article\b[^>]*>([\s\S]*?)<\/article>/gi,
    /<section\b[^>]*>([\s\S]*?)<\/section>/gi,
    /<div\b[^>]*class=["'][^"']*(?:track|playlist-entry|playlist_item|playlist-item|played|song)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi,
  ];

  for (const pattern of blockPatterns) {
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(html))) {
      const lines = stripTagsToLines(match[1]);
      const playedAtText =
        lines.find(isTimeLine) ?? null;

      for (const line of lines) {
        const parts = splitArtistAndTitle(line);

        if (parts) {
          addCandidate(
            candidates,
            parts.artist,
            parts.title,
            playedAtText
          );
        }
      }
    }
  }

  const plainLines = stripTagsToLines(html);

  for (
    let index = 0;
    index < plainLines.length;
    index += 1
  ) {
    const parts = splitArtistAndTitle(
      plainLines[index]
    );

    if (!parts) {
      continue;
    }

    const nearby = [
      plainLines[index - 2],
      plainLines[index - 1],
      plainLines[index + 1],
      plainLines[index + 2],
    ].filter(Boolean) as string[];

    addCandidate(
      candidates,
      parts.artist,
      parts.title,
      nearby.find(isTimeLine) ?? null
    );
  }
}

function extractAttributeTracks(
  html: string,
  candidates: TrackCandidate[]
) {
  const attributePatterns = [
    /data-artist=["']([^"']+)["'][^>]*data-title=["']([^"']+)["']/gi,
    /data-title=["']([^"']+)["'][^>]*data-artist=["']([^"']+)["']/gi,
    /data-track-artist=["']([^"']+)["'][^>]*data-track-title=["']([^"']+)["']/gi,
    /data-track-title=["']([^"']+)["'][^>]*data-track-artist=["']([^"']+)["']/gi,
  ];

  let match: RegExpExecArray | null;

  while (
    (match = attributePatterns[0].exec(html))
  ) {
    addCandidate(candidates, match[1], match[2]);
  }

  while (
    (match = attributePatterns[1].exec(html))
  ) {
    addCandidate(candidates, match[2], match[1]);
  }

  while (
    (match = attributePatterns[2].exec(html))
  ) {
    addCandidate(candidates, match[1], match[2]);
  }

  while (
    (match = attributePatterns[3].exec(html))
  ) {
    addCandidate(candidates, match[2], match[1]);
  }
}

function extractClassBasedTracks(
  html: string,
  candidates: TrackCandidate[]
) {
  const blockPattern =
    /<(?:div|li|article|section|tr)\b[^>]*>([\s\S]*?)<\/(?:div|li|article|section|tr)>/gi;

  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = blockPattern.exec(html))) {
    const block = blockMatch[1];

    const artistMatch =
      block.match(
        /<[^>]*class=["'][^"']*(?:artist|performer|track-artist|song-artist)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i
      ) ??
      block.match(
        /<(?:meta|span|div)[^>]*(?:itemprop=["']byArtist["']|itemprop=["']artist["'])[^>]*(?:content=["']([^"']+)["']|>([\s\S]*?)<\/(?:span|div)>)/i
      );

    const titleMatch =
      block.match(
        /<[^>]*class=["'][^"']*(?:title|track-title|song-title|track-name)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i
      ) ??
      block.match(
        /<(?:meta|span|div)[^>]*(?:itemprop=["']name["'])[^>]*(?:content=["']([^"']+)["']|>([\s\S]*?)<\/(?:span|div)>)/i
      );

    if (!artistMatch || !titleMatch) {
      continue;
    }

    const artist =
      artistMatch[1] ?? artistMatch[2] ?? "";
    const title =
      titleMatch[1] ?? titleMatch[2] ?? "";

    const lines = stripTagsToLines(block);
    const playedAtText =
      lines.find(isTimeLine) ?? null;

    addCandidate(
      candidates,
      artist,
      title,
      playedAtText
    );
  }
}

function extractJsonTracks(
  html: string,
  candidates: TrackCandidate[]
) {
  const normalized = decodeHtml(html)
    .replace(/\\u0026/gi, "&")
    .replace(/\\u0027/gi, "'")
    .replace(/\\u0022/gi, '"')
    .replace(/\\"/g, '"');

  const jsonPairPatterns = [
    /"artist"\s*:\s*"([^"]+)"[\s\S]{0,600}?"title"\s*:\s*"([^"]+)"/gi,
    /"title"\s*:\s*"([^"]+)"[\s\S]{0,600}?"artist"\s*:\s*"([^"]+)"/gi,
    /"artistName"\s*:\s*"([^"]+)"[\s\S]{0,600}?"trackName"\s*:\s*"([^"]+)"/gi,
    /"trackName"\s*:\s*"([^"]+)"[\s\S]{0,600}?"artistName"\s*:\s*"([^"]+)"/gi,
    /"performer"\s*:\s*"([^"]+)"[\s\S]{0,600}?"name"\s*:\s*"([^"]+)"/gi,
  ];

  let match: RegExpExecArray | null;

  while (
    (match = jsonPairPatterns[0].exec(normalized))
  ) {
    addCandidate(candidates, match[1], match[2]);
  }

  while (
    (match = jsonPairPatterns[1].exec(normalized))
  ) {
    addCandidate(candidates, match[2], match[1]);
  }

  while (
    (match = jsonPairPatterns[2].exec(normalized))
  ) {
    addCandidate(candidates, match[1], match[2]);
  }

  while (
    (match = jsonPairPatterns[3].exec(normalized))
  ) {
    addCandidate(candidates, match[2], match[1]);
  }

  while (
    (match = jsonPairPatterns[4].exec(normalized))
  ) {
    addCandidate(candidates, match[1], match[2]);
  }
}

function extractAdjacentLineTracks(
  html: string,
  candidates: TrackCandidate[]
) {
  const lines = stripTagsToLines(html);

  for (
    let index = 0;
    index < lines.length - 1;
    index += 1
  ) {
    const first = lines[index];
    const second = lines[index + 1];

    if (
      !isValidTrackPart(first) ||
      !isValidTrackPart(second) ||
      isTimeLine(first) ||
      isTimeLine(second)
    ) {
      continue;
    }

    const context = [
      lines[index - 2],
      lines[index - 1],
      lines[index + 2],
      lines[index + 3],
    ].filter(Boolean) as string[];

    const surroundingText = context
      .join(" ")
      .toLowerCase();

    const likelyTrackArea =
      /track|song|played|playlist|now playing|live/i.test(
        surroundingText
      );

    if (!likelyTrackArea) {
      continue;
    }

    const playedAtText =
      context.find(isTimeLine) ?? null;

    addCandidate(
      candidates,
      first,
      second,
      playedAtText
    );
  }
}

function extractMetaTrack(
  html: string,
  candidates: TrackCandidate[]
) {
  const metaValues: string[] = [];

  const metaPattern =
    /<meta\b[^>]*(?:property|name)=["'](?:og:title|twitter:title|description|og:description)["'][^>]*content=["']([^"']+)["'][^>]*>/gi;

  let match: RegExpExecArray | null;

  while ((match = metaPattern.exec(html))) {
    metaValues.push(cleanText(match[1]));
  }

  for (const value of metaValues) {
    const parts = splitArtistAndTitle(value);

    if (parts) {
      addCandidate(
        candidates,
        parts.artist,
        parts.title
      );
    }
  }
}

function extractTracks(html: string) {
  const candidates: TrackCandidate[] = [];

  extractAttributeTracks(html, candidates);
  extractJsonTracks(html, candidates);
  extractClassBasedTracks(html, candidates);
  extractCombinedTextTracks(html, candidates);
  extractMetaTrack(html, candidates);

  if (candidates.length === 0) {
    extractAdjacentLineTracks(html, candidates);
  }

  const tracks: SeratoTrack[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const track = createTrack(
      candidate.artist,
      candidate.title,
      candidate.playedAtText
    );

    if (!track || seen.has(track.id)) {
      continue;
    }

    seen.add(track.id);
    tracks.push(track);
  }

  return tracks;
}

function validateLiveUrl(rawUrl: string) {
  const url = new URL(rawUrl);

  if (
    !["serato.com", "www.serato.com"].includes(
      url.hostname.toLowerCase()
    )
  ) {
    throw new Error(
      "Only serato.com Live Playlist URLs are allowed."
    );
  }

  if (
    !url.pathname
      .toLowerCase()
      .startsWith("/playlists/")
  ) {
    throw new Error(
      "This is not a Serato playlist URL."
    );
  }

  if (!url.pathname.toLowerCase().endsWith("/live")) {
    url.pathname = `${url.pathname.replace(
      /\/+$/,
      ""
    )}/live`;
  }

  return url.toString();
}

export async function GET(request: NextRequest) {
  const requestedUrl =
    request.nextUrl.searchParams.get("url") ??
    DEFAULT_LIVE_URL;

  let liveUrl: string;

  try {
    liveUrl = validateLiveUrl(requestedUrl);
  } catch (error) {
    return respond(
      {
        ok: false,
        live: false,
        track: null,
        tracks: [],
        message:
          error instanceof Error
            ? error.message
            : "Invalid Serato Live Playlist URL.",
      },
      400
    );
  }

  try {
    const response = await fetch(liveUrl, {
      cache: "no-store",
      redirect: "follow",
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      return respond(
        {
          ok: false,
          live: false,
          track: null,
          tracks: [],
          sourceUrl: liveUrl,
          message: `Serato returned HTTP ${response.status}.`,
        },
        502
      );
    }

    const html = await response.text();

    if (!html.trim()) {
      return respond(
        {
          ok: false,
          live: false,
          track: null,
          tracks: [],
          sourceUrl: liveUrl,
          message:
            "Serato returned an empty response.",
        },
        502
      );
    }

    const noPlaylist =
      /This user has no playlists/i.test(html) ||
      /No playlists(?: are available)?/i.test(html);

    if (noPlaylist) {
      return respond({
        ok: true,
        live: false,
        sourceUrl: liveUrl,
        fetchedAt: new Date().toISOString(),
        track: null,
        tracks: [],
        message:
          "Serato is reachable, but this account is not publishing a Live Playlist. Start Live Playlist in Serato DJ Pro and play a new song.",
      });
    }

    const tracks = extractTracks(html);

    if (tracks.length === 0) {
      const plainLines = stripTagsToLines(html);

      return respond({
        ok: true,
        live: false,
        sourceUrl: liveUrl,
        fetchedAt: new Date().toISOString(),
        track: null,
        tracks: [],
        diagnostics: {
          htmlLength: html.length,
          pageTitle:
            html.match(
              /<title[^>]*>([\s\S]*?)<\/title>/i
            )?.[1]
              ? cleanText(
                  html.match(
                    /<title[^>]*>([\s\S]*?)<\/title>/i
                  )?.[1] ?? ""
                )
              : null,
          sampleLines: plainLines
            .filter(
              (line) =>
                !NON_TRACK_TEXT.test(line)
            )
            .slice(0, 30),
        },
        message:
          "Serato is reachable, but no valid track was found. Diagnostic page information is included in this response.",
      });
    }

    return respond({
      ok: true,
      live: true,
      sourceUrl: liveUrl,
      fetchedAt: new Date().toISOString(),
      track: tracks[0],
      tracks: tracks.slice(0, 20),
      message: "Serato Live Playlist is active.",
    });
  } catch (error) {
    console.error("Serato Live API error:", error);

    return respond(
      {
        ok: false,
        live: false,
        track: null,
        tracks: [],
        sourceUrl: liveUrl,
        message:
          error instanceof Error
            ? error.message
            : "Bingo to the Beats could not reach Serato.",
      },
      502
    );
  }
}