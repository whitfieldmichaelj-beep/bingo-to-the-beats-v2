from pathlib import Path
import json

route = Path("app/api/serato/live/route.ts")
test_file = Path("scripts/test-serato-parser.mjs")
verify_file = Path("scripts/verify-local.sh")
package_file = Path("package.json")

if not route.exists():
    raise SystemExit("STOPPED: app/api/serato/live/route.ts not found.")

text = route.read_text()

# 1. Add generic page labels that must never be treated as songs.
if "const GENERIC_TRACK_PARTS" not in text:
    marker = '''const NON_TRACK_TEXT =
  /(?:©|&copy;|all rights reserved|serato 19\\d{2}|privacy|copyright|products|community|sign in|create account|do not sell|playlist by|serato dj playlists|terms of service|cookie policy)/i;
'''

    if marker not in text:
        raise SystemExit(
            "STOPPED: expected NON_TRACK_TEXT block was not found."
        )

    addition = marker + '''
const GENERIC_TRACK_PARTS = new Set([
  "serato",
  "dj",
  "serato dj",
  "live",
  "playlist",
  "live playlist",
  "track",
  "tracks",
  "now playing",
  "certified dj schools",
  "blog",
  "support",
  "products",
  "community",
  "artists",
]);
'''

    text = text.replace(marker, addition, 1)

# 2. Reject those labels inside the existing validator.
if "GENERIC_TRACK_PARTS.has(cleaned.toLowerCase())" not in text:
    old = '''    cleaned.length < 1 ||
    cleaned.length > 220 ||
    NON_TRACK_TEXT.test(cleaned) ||
    /^https?:\\/\\//i.test(cleaned)
'''

    new = '''    cleaned.length < 1 ||
    cleaned.length > 220 ||
    NON_TRACK_TEXT.test(cleaned) ||
    GENERIC_TRACK_PARTS.has(cleaned.toLowerCase()) ||
    /^https?:\\/\\//i.test(cleaned)
'''

    if old not in text:
        raise SystemExit(
            "STOPPED: expected isValidTrackPart block was not found."
        )

    text = text.replace(old, new, 1)

route.write_text(text)

# 3. Add regression test.
test_file.write_text(r'''import fs from "node:fs";
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
''')

# 4. Register the regression test.
pkg = json.loads(package_file.read_text())
pkg.setdefault("scripts", {})
pkg["scripts"]["test:serato-parser"] = (
    "node scripts/test-serato-parser.mjs"
)
package_file.write_text(json.dumps(pkg, indent=2) + "\n")

# 5. Include it in npm run verify.
verify = verify_file.read_text()

if "npm run test:serato-parser" not in verify:
    marker = 'echo "Running host resume tests..."'

    if marker not in verify:
        raise SystemExit(
            "STOPPED: could not find host resume marker in verify-local.sh."
        )

    block = '''echo "Running Serato parser tests..."
npm run test:serato-parser
echo

'''

    verify = verify.replace(marker, block + marker, 1)
    verify_file.write_text(verify)

print("PASS Serato parser repair installed")
print("PASS Serato regression test installed")
print("PASS npm run verify updated")
