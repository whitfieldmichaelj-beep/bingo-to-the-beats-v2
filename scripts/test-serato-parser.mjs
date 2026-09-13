import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync(
  "app/api/serato/live/route.ts",
  "utf8"
);

assert.match(source, /const GENERIC_TRACK_PARTS/);
assert.match(source, /"serato"/);
assert.match(source, /"dj"/);
assert.match(
  source,
  /GENERIC_TRACK_PARTS\.has\(cleaned\.toLowerCase\(\)\)/
);

console.log(
  "PASS Serato parser rejects generic Serato/DJ page labels"
);
