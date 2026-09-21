import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// A server-side disk library belongs to one configured host. Never expose a
// shared process cache or the server's filesystem to another signed-in host.
export async function localLibraryAccessResponse() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, message: "Sign in to access local music.", error: "Sign in to access local music." }, { status: 401 });
  const owner = process.env.BTTB_LOCAL_LIBRARY_OWNER_ID?.trim();
  if (!owner) return NextResponse.json({ ok: false, message: "Local music is not enabled on this server. Use a connected music service.", error: "Local music is not enabled on this server. Use a connected music service." }, { status: 503 });
  if (userId !== owner) return NextResponse.json({ ok: false, message: "This music library belongs to another host.", error: "This music library belongs to another host." }, { status: 403 });
  return null;
}
