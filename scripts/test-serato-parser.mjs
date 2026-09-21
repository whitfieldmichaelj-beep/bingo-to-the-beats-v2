import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';

const exports = {};
let html = '';
let fetchCount = 0;
let fetchStatus = 200;
let fetchedUrl;
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/serato/live/route.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, {
  exports, URL, AbortSignal, console,
  require: name => name === "@/lib/billing/access" ? { subscriptionsEnabled: () => false } : name === "@clerk/nextjs/server" ? {} : ({ NextResponse: { json: (body, options) => ({ body, status: options.status }) } }),
  fetch: async (url, options) => {
    fetchCount++;
    fetchedUrl = url;
    assert.ok(options.signal, 'upstream requests have a timeout');
    return { ok: fetchStatus === 200, status: fetchStatus, text: async () => html };
  },
});
const request = url => ({ nextUrl: new URL(`https://bingo.example/api/serato/live?url=${encodeURIComponent(url)}`) });
const live = () => exports.GET(request('https://serato.com/playlists/Test/live'));
for (const url of ['http://serato.com/playlists/Test', 'https://evil.example/playlists/Test/live', 'https://serato.com:444/playlists/Test', 'https://user:pass@serato.com/playlists/Test', 'https://serato.com/playlists/Test/archive']) {
  assert.equal((await exports.GET(request(url))).status, 400);
}
assert.equal(fetchCount, 0, 'invalid URLs never reach the network');
html = '<div data-artist="Earth, Wind &amp; Fire" data-title="September"></div>';
let result = await exports.GET(request('https://serato.com/playlists/Test/live/?foo=bar#section'));
assert.equal(fetchedUrl, 'https://serato.com/playlists/Test/live');
assert.equal(result.body.track.artist, 'Earth, Wind & Fire');
assert.equal(result.body.track.title, 'September');
assert.equal(result.body.live, true);
html = '<div class="container playlists-container"><h1>Playlists</h1><div data-artist="Old Artist" data-title="Old Song"></div></div>';
result = await live();
assert.equal(result.body.live, false, 'profile listing must never be treated as a live broadcast');
assert.equal(result.body.track, null);
for (const page of ['<p>This user has no playlists</p>', '<div data-artist="Serato" data-title="DJ"></div>', '<p>No playlists are available</p>']) {
  html = page;
  assert.equal((await live()).body.live, false);
}
html = '';
assert.equal((await live()).status, 502);
fetchStatus = 503;
assert.equal((await live()).status, 502);
console.log('PASS Serato route: URL validation, normalization, real track extraction, offline profile, generic labels, empty response, and upstream failure');
