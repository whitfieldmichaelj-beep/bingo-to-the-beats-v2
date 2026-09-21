# Unified DJ provider bridge

The `/dj` workspace (also available through the existing `/serato` URL) remembers the DJ software on the device. Serato, Rekordbox and VirtualDJ share the existing playlist selection, game creation, and DJ Console. Provider metadata changes names, symbols, connection buttons, and crate/playlist terminology.

`lib/dj/types.ts` defines the common adapter contract. `bridge.ts` loads the selected adapter server-side. Tracks retain provider identity, original IDs, paths, metadata and version information. Game playback configuration persists the provider so database restoration restores the same console behavior. DJ plan restrictions apply equally to all three providers.

## Local access

The app server must run on the DJ computer. All new disk routes require authentication and the configured `BTTB_LOCAL_LIBRARY_OWNER_ID`, then now-playing also checks game ownership and provider. A deployed web server cannot see a visiting DJ's laptop. A separately installed, authenticated desktop companion is still needed for that hosted deployment model; this change does not pretend that remote filesystem access exists.

- Serato: existing local/external-drive crate and smart-crate readers; local session history, with Serato 4 history support through the installed reader.
- Rekordbox: `rekordbox-connect` reads the native encrypted database using the application's local configuration. The database opens read-only. Ordinary playlists are supported; smart-playlist rule evaluation is not implemented. An idle connection closes after 60 seconds.
- VirtualDJ: native `My Lists` XML/virtual folders and legacy M3U playlists, enriched from `database.xml`; now-playing follows `History/tracklist.txt`. Defaults to `~/Documents/VirtualDJ`; `BTTB_VIRTUALDJ_PATH` can configure another local home. Custom tracklist formatting must retain the default `time : artist - title` form.

The console no longer requests the Serato Live Playlist webpage or asks DJs to publish a playlist. The old `/api/serato/live` endpoint and its regression tests remain for backward compatibility only; the shared console uses `/api/dj/[provider]/now-playing`.

## Detection behavior and validation

The first observation establishes a baseline and never calls a song. Later identical observations are ignored. Only a new detected song that uniquely matches the current game's playlist enters the existing countdown/called-track flow. Local history may be delayed by the DJ software; this is not a sample-accurate deck protocol. Validate timing on each intended software version before a paid event.

`npm run test:dj-bridge` covers provider validation, stable identities, saved-source restoration, startup/repeat detection suppression, VirtualDJ XML/M3U fixtures, native adapter behavior, access-denied short circuits, and game creation across all providers. It is included in `npm run verify`. Existing regression tests remain in place.

On this development Mac, Serato's library is present. Rekordbox's database is unavailable and the default VirtualDJ folder is absent. Native Rekordbox SQLite loading passes, but actual Rekordbox/VirtualDJ playback and authenticated browser game creation require those applications/libraries and a signed-in host. The software selector and remembered choice were verified in the browser.
