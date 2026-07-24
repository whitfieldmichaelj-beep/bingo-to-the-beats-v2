// app/api/tidal/login/route.ts

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      provider: "tidal",
      message: "TIDAL login has not been implemented yet.",
    },
    { status: 501 }
  );
}