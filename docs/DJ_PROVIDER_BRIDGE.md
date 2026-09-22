# Unified DJ provider bridge

The `/dj` workspace (also available through the existing `/serato` URL) remembers the DJ software on the device. Serato, Rekordbox and Virtual DJ share the existing playlist selection, game creation, and DJ Console. Provider metadata changes names, symbols, connection buttons, and crate/playlist terminology.

`lib/dj/types.ts` defines the common adapter contract. `bridge.ts` loads the selected adapter server-side. Tracks retain provider identity, original IDs, paths, metadata and version information. Game playback configuration persists the provider so database restoration restores the same console behavior. DJ plan restrictions apply equally to all three providers.

## Local access

The app server must run on the DJ computer. All new disk routes require authentication and the configured `BTTB_LOCAL_LIBRARY_OWNER_ID`, then now-playing also checks game ownership and provider. A deployed web server cannot see a visiting DJ's laptop. A separately installed, authenticated desktop companion is still needed for that hosted deployment model; this change does not pretend that remote filesystem access exists.

- Serato: existing local/external-drive crate and smart-crate readers; local session history, with Serato 4 history support through the installed reader.
- Rekordbox: `rekordbox-connect` reads the native encrypted database using the application's local configuration. The database opens read-only. Ordinary playlists are supported; smart-playlist rule evaluation is not implemented. An idle connection closes after 60 seconds.
- VirtualDJ: native `My Lists` XML/virtual folders and legacy M3U playlists, enriched from `database.xml`; now-playing follows `History/tracklist.txt`. Defaults to `~/Documents/VirtualDJ`; `BTTB_VIRTUALDJ_PATH` can configure another local home. Custom tracklist formatting must retain the default `time : artist - title` form.

The console no longer requests the Serato Live Playlist webpage or asks DJs to publish a playlist. The old `/api/serato/live` endpoint and its regression tests remain for backward compatibility only; the shared console uses `/api/dj/[provider]/now-playing`.

## Detection behavior and validation

The first observation establishes a baseline and never calls a song. Later identical observations are ignored. Only a new detected song that uniquely matches the current game's playlist enters the existing countdown/called-track flow. Local history may be delayed by the DJ software; this is not a sample-accurate deck protocol. Validate timing on each intended software version before a paid event.

For laptop-only Rekordbox in PERFORMANCE mode, set Preferences → Advanced → Browse → Playback time setting to **1 second**. The 60-second default was confirmed on the development Mac while diagnosing delayed calls. BTTB cannot see a history row before Rekordbox writes it. Its adapter now polls that database every 500 ms and the Rekordbox console polls every 1 second; these intervals reduce BTTB’s additional delay, not Rekordbox’s configured threshold. Changing the setting in the running Rekordbox application is required; BTTB does not edit DJ software settings or databases. Retest with a different, newly played track after connecting. See [Rekordbox’s manual, page 240](https://cdn.rekordbox.com/files/20260409151936/rekordbox7.214_manual_EN.pdf).

`npm run test:dj-bridge` covers provider validation, stable identities, saved-source restoration, startup/repeat detection suppression, VirtualDJ XML/M3U fixtures, native adapter behavior, access-denied short circuits, and game creation across all providers. It is included in `npm run verify`. Existing regression tests remain in place.

On this development Mac, Serato's library is present. Rekordbox's database is unavailable and the default VirtualDJ folder is absent. Native Rekordbox SQLite loading passes, but actual Rekordbox/VirtualDJ playback and authenticated browser game creation require those applications/libraries and a signed-in host. The software selector and remembered choice were verified in the browser.

## Release readiness follow-up

Next.js and its lint configuration were upgraded to 16.3.5, with compatible dependency fixes and regenerated Prisma Client. The dependency audit reports zero known vulnerabilities. Scoped overrides use `deepmerge-ts@8.0.2` within `@prisma/config` and `mysql2@3.24.4` within Prisma until upstream updates those pins. Prisma remains on 7.10.0.

The deepmerge-ts 8 release changes Map-merging and custom type APIs. This project uses plain-object Prisma configuration, and the installed Prisma loader only calls the existing `deepmerge` function. Configuration validation, client generation, the production build, and regression verification exercise this compatibility. Revisit the overrides when upgrading Prisma. See the [upstream release notes](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0).

The full verification suite also runs against the production build on port 3001. When using the temporary test server, pass its same test-only `STRIPE_WEBHOOK_SECRET` to the test runner; local environment files may otherwise supply a different secret and correctly fail signature validation. Do not use test server payment settings for a real event.

The new provider modules and routes pass targeted ESLint. The console now renders playback errors directly instead of copying them into another state variable. Broader existing console/workspace lint still reports other pre-existing React effect-state findings; these require a separate state-management cleanup. Live hardware timing and signed-in host acceptance testing remain outstanding. No claim of full production readiness is made.

## Confirmed Rekordbox setup note

The DJ reported improved laptop-only detection after changing the playback-time threshold. Keep the 1-second setting instructions prominently visible on the Rekordbox DJ Console, including PERFORMANCE mode, the exact preferences path, the 60-second default delay, and a reminder to check with a different newly played song. The note remains visible after connecting.

### Playback save reliability and local player links

Played-song saves now stay in a per-game queue while the console is mounted. Failed requests retry every two seconds, including after the DJ changes songs. A successful response with zero matching tracks does not count as a saved song. Switching games or leaving the console stops network requests, but pending song IDs are saved synchronously in localStorage and retried when that same game console is reopened on the same browser and origin. Each song has its own game-scoped storage record so simultaneous tabs do not overwrite each other. Records are removed only after server acknowledgment; duplicate delivery remains idempotent. Corrupt records are ignored independently. If browser storage is blocked, cleared, or full, only in-memory retries are available. Already acknowledged songs remain in the database. No audio or library file paths are stored in this queue.

Local player join links retain the configured phone-accessible LAN address and use the active browser server port. This prevents a preview on port 3001 from sending players to a different server on port 3000. Configured public domains remain authoritative. Playback regression tests cover retries, skipped tracks, duplicate acknowledgments, game isolation, and local/public join origins.
