import { NextResponse } from "next/server";
import os from "node:os";
import path from "node:path";
import { access, readdir, stat } from "node:fs/promises";
import { constants } from "node:fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SeratoLibraryLocation = {
  id: string;
  name: string;
  volumePath: string;
  seratoPath: string;
  subcratesPath: string;
  isExternal: boolean;
  readable: boolean;
  crateCount: number;
};

async function exists(targetPath: string) {
  try {
    await access(targetPath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(targetPath: string) {
  try {
    return (await stat(targetPath)).isDirectory();
  } catch {
    return false;
  }
}

async function countCrates(subcratesPath: string) {
  try {
    const entries = await readdir(subcratesPath, { withFileTypes: true });
    return entries.filter(
      (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".crate")
    ).length;
  } catch {
    return 0;
  }
}

function makeId(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function inspectLibrary(
  name: string,
  volumePath: string,
  seratoPath: string,
  isExternal: boolean
): Promise<SeratoLibraryLocation | null> {
  if (!(await isDirectory(seratoPath))) return null;

  const subcratesPath = path.join(seratoPath, "Subcrates");

  return {
    id: makeId(`${isExternal ? "external" : "local"}-${volumePath}`),
    name,
    volumePath,
    seratoPath,
    subcratesPath,
    isExternal,
    readable: await exists(seratoPath),
    crateCount: await countCrates(subcratesPath),
  };
}

async function scanLocalLibrary() {
  const homePath = os.homedir();
  return inspectLibrary(
    "Macintosh HD",
    homePath,
    path.join(homePath, "Music", "_Serato_"),
    false
  );
}

async function scanExternalLibraries() {
  const volumesRoot = "/Volumes";
  if (!(await isDirectory(volumesRoot))) return [];

  let entries;
  try {
    entries = await readdir(volumesRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const libraries = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const volumePath = path.join(volumesRoot, entry.name);
        return inspectLibrary(
          entry.name,
          volumePath,
          path.join(volumePath, "_Serato_"),
          true
        );
      })
  );

  return libraries.filter(
    (library): library is SeratoLibraryLocation => library !== null
  );
}

export async function GET() {
  try {
    const [localLibrary, externalLibraries] = await Promise.all([
      scanLocalLibrary(),
      scanExternalLibraries(),
    ]);

    const libraries = [
      ...(localLibrary ? [localLibrary] : []),
      ...externalLibraries,
    ];

    return NextResponse.json(
      {
        ok: true,
        scannedAt: new Date().toISOString(),
        platform: process.platform,
        volumesRoot: "/Volumes",
        libraryCount: libraries.length,
        externalLibraryCount: externalLibraries.length,
        libraries,
        message:
          libraries.length > 0
            ? `Found ${libraries.length} Serato library location${libraries.length === 1 ? "" : "s"}.`
            : "No Serato libraries were found. Confirm that the drive is mounted and contains an _Serato_ folder at its root.",
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("Serato drive scan failed:", error);

    return NextResponse.json(
      {
        ok: false,
        libraries: [],
        message:
          error instanceof Error
            ? error.message
            : "BTTB could not scan for Serato libraries.",
      },
      { status: 500 }
    );
  }
}
