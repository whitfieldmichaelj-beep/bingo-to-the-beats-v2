import { NextResponse } from "next/server";
import { getSeratoLibrary } from "@/lib/serato/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await getSeratoLibrary();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Serato library error:", error);

    return NextResponse.json(
      {
        ok: false,
        message: "Unable to load the Serato library.",
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      { status: 500 }
    );
  }
}