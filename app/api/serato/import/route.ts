import { NextRequest, NextResponse } from "next/server";
import { localLibraryAccessResponse } from "@/lib/auth/local-library";
import { requestOrigin } from "@/lib/http/request-origin";
import { readUploadedSeratoCrate } from "@/lib/serato/smart-crates";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const denied = await localLibraryAccessResponse();
  if (denied) return denied;
  if (request.headers.get("origin") !== requestOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !/\.(?:crate|scrate)$/i.test(file.name)) return NextResponse.json({ error: "Select a .crate or .scrate file." }, { status: 400 });
    if (!file.size || file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "Select a nonempty crate file smaller than 5 MB." }, { status: 400 });
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.subarray(0, 4).toString("ascii") !== "vrsn") return NextResponse.json({ error: "This is not a recognized Serato crate file." }, { status: 400 });
    const tracks = await readUploadedSeratoCrate(buffer);
    return NextResponse.json({ tracks: tracks.map(track => ({ id: track.id, title: track.title, artist: track.artist, album: track.album ?? "", bpm: String(track.bpm ?? ""), genre: "", key: "", length: "", filename: "" })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read this crate." }, { status: 422 });
  }
}
