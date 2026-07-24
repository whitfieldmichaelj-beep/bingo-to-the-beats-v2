// app/api/tidal/callback/route.ts

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    success: false,
    provider: "tidal",
    message: "TIDAL authentication has not been implemented yet.",
  });
}