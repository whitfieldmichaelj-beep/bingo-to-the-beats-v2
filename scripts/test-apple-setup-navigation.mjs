// Exercise the direct Apple create button with a controlled music catalog and
// server response. No Apple account, real game, or payment is touched.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const tracks = Array.from({ length: 30 }, (_, index) => ({
  id: `i.fixture-${index}`, type: 'library-songs',
  attributes: { name: `Test song ${index}`, artistName: 'Fixture artist', playParams: { id: `i.fixture-${index}`, isLibrary: true, catalogId: `catalog-${index}` } },
}));
const game = { id: 'apple-setup-fixture', joinCode: 'TEST01', playlistId: 'p.fixture', playlistName: 'Fixture playlist',
  tracks: tracks.map((track, index) => ({ id: track.id, gameTrackId: `track-${index}`, title: track.attributes.name, artist: 'Fixture artist' })) };
const local = new Map(), session = new Map();
const storage = map => ({ setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) });
const messages = [];
let finish, fail, requestBody;
const finished = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
const mocks = {
  react: { useState: () => [false, () => {}] },
  'next/navigation': { useRouter: () => ({ push: finish }) },
};
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync('components/apple/AppleDirectCreateButton.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  exports, require: name => mocks[name] ?? require(name),
  window: { MusicKit: { getInstance: () => ({ isAuthorized: true, api: { music: async () => ({ data: { data: tracks } }) } }) } },
  localStorage: storage(local), sessionStorage: storage(session),
  console: { error: (...args) => fail(new Error(args.map(String).join(' '))) },
  fetch: async (url, options) => {
    assert.equal(url, '/api/game/create-streaming'); requestBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true, game }) };
  },
});
const button = exports.default({ playlistId: 'p.fixture', playlistName: 'Fixture playlist', cardCount: 25, clipLength: 30, winningPattern: 'four-corners', shuffle: false, onMessage: message => messages.push(message) });
assert.match(button.props.children, /Entry/);
const deadline = setTimeout(() => fail(new Error(`Creation did not navigate: ${messages.join('; ')}`)), 2000);
try {
  button.props.onClick();
  assert.equal(await finished, '/game/setup?gameId=apple-setup-fixture', 'direct Apple creation must stop at entry/prize setup before the console');
  assert.equal(requestBody.source, 'apple'); assert.equal(requestBody.tracks.length, 30);
  const saved = JSON.parse(local.get('bttb-v2-game-session'));
  assert.equal(saved.sessionId, game.id); assert.equal(saved.status, 'ready');
  assert.equal(saved.tracks[0].appleLibraryId, tracks[0].id);
  assert.equal(saved.tracks[0].appleCatalogId, 'catalog-0');
  console.log('PASS Apple direct creation opens Entry & Prize Setup and preserves its saved game/music metadata');
} finally { clearTimeout(deadline); }
