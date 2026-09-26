# Private beta checkpoint — September 15, 2026

Target: September 18, 2026, invite-only testing. Not yet approved for public release.

## Verified this session

- Production build and TypeScript pass. Existing Serato crate file-tracing warning remains.
- Full local verification suite passes against a separate production server on port 3001: enrollment, duplicate concurrent joins, host restore, playback restore, Serato parsing, refunds, disputes, checkout signature/ownership/amount checks and event replay.
- Database capacity tests pass, including a race for the final player spot, rollback and reconnect.
- Added host subscription regression coverage for all approved prices, invalid prices, renewal, cancellation, failed payment, ownership, delayed events and replacement checkout refresh.
- Fixed refresh after replacing a canceled subscription.
- Card availability now reads both counts in one database snapshot. Initial concurrent join run encountered an intermittent Prisma count error; subsequent full suite passed after this change. Continue observing under load; this is not a sustained load-test result.
- Created and verified a Stripe TEST-mode portal configuration for invoices, payment methods and cancellation at period end. Local env points to this explicit configuration.
- Actual Stripe TEST-mode subscription creation, end-of-period cancellation and resumption passed. Test subscription canceled, customer removed, test product archived.

## Current controls

Host subscription purchases remain disabled. No live customer charges or deployment were performed.
Existing games remain grandfathered. Agreed DJ and Other-host plan prices are unchanged.

## Remaining beta gates

1. Physical playback tests with Serato, Spotify Premium and Apple Music. User confirmed access to all three.
2. Real host-to-phone player rehearsal through reveal, marks, bingo, reconnect and game end.
3. Exercise the final Stripe-hosted plan-change confirmation and resulting webhook in the beta environment. Upgrades and billing-period changes within the same host category, keeping or increasing capacity, are implemented. Downgrades and DJ/Other category switches are not offered.
4. Check the updated free-practice join screen on a phone. API integration test verifies one free card, invalid quantity 400, and reconnect without a second purchase or seat.
5. Verify hosted environment, production database, public origin, auth callbacks and webhook delivery. Local Serato disk access will not automatically work for other DJs on a hosted server.
6. Choose test-only billing or live billing for the private beta, then configure/verify that environment. Test-mode portal configuration cannot be reused in live mode.
7. Address Serato crate tracing warning before production packaging is finalized.

## Serato rehearsal

Use existing game 6165b1f7-dfcd-46dc-8e59-1fe984875474. Serato Live Playlist must be Public via Edit Details, with Live Playlist On. Play two tracks in the game's track list and confirm each is detected once; check timer/reveal and caller/player views. Do not confuse browser audio playback with Serato track detection.

## Follow-up implementation and verification

- Join screen checks the game type before enabling enrollment. Practice offers only one free card; paid games retain existing card packages. No price is shown until the game code is verified.
- Local-library routes, Serato disk routes, local game creation and local audio/artwork now require the explicitly configured Mac library owner. Missing setup fails closed. The existing local game owner is configured in ignored local environment settings. Public Serato live detection and streaming game creation are separate from disk-library authorization.
- Added tests that exercise every protected route before disk/database work, owner/non-owner/anonymous access, and practice/paid/ended join options.
- Added Stripe-hosted upgrade confirmation. Opening the flow does not update a subscription or grant increased capacity; confirmed Stripe price determines entitlements. Tested actual Stripe TEST-mode confirmation session creation; final browser confirmation remains to be rehearsed.
- Production build and full verify suite pass after these changes. Isolated real database/API free-practice enrollment test also passes and cleans up its own fixtures.
- Paid subscriptions remain disabled. No deployment or live charges performed.

## Spotify return-address fix

- Allowed the explicit 127.0.0.1 loopback origin in the Next development server; browser sign-in UI now hydrates at the Spotify callback origin.
- Spotify page requires BTTB sign-in; protected data APIs return JSON 401 instead of a login document. Login/callback navigation continues to redirect normally.
- Spotify authorization starts on its configured callback origin. Loopback return URLs preserve the browser Host only for known aliases on the same port.
- Sign-in respects the requested return page instead of always forcing Dashboard.
- Playlist and token requests have timeouts; temporary upstream failures preserve Spotify cookies.
- TypeScript and regression tests pass. Browser verified the sign-in form and correct return URL. Actual playlist retrieval is pending user sign-in on 127.0.0.1.

## Spotify reconnect navigation follow-up

The development log showed repeated failed RSC payload requests to /api/spotify/login. Both Spotify connect links now use ordinary browser navigation rather than Next Link. Authorization responses are no-store. The playlist page displays callback errors (including state mismatch) instead of masking them as disconnected. TypeScript and OAuth tests pass: canonical navigation, state validation, callback token cookies, and subsequent token read. Real reconnection still needs the user's Spotify authorization.

### Spotify playback — September 16
- Real OAuth now loads playlists after correcting local callback and registering it with Spotify.
- Added Spotify Connect play/pause and saved-position resume; countdown waits for accepted playback. Spotify clips use reveal/advance rather than local-audio crossfade.
- Playback regression checks cover pending/failed commands, cancellation, resume position and server guards. TypeScript passes.
- Real current game test returned no active Spotify device and correctly stayed paused. Mike must activate Spotify on the Mac, then Resume Game; audible playback still awaits real-device confirmation.

- Spotify wrong-computer fix: hosts must explicitly choose their playback device in the console. Every play/pause command now includes that device ID; no fallback to the account active device. Selection resets on page/game entry. TypeScript and playback regression checks pass. Spotify currently reports two identically named Firefox web players; local desktop device selection and audible test await Mike.

- Spotify clips now start at 60 seconds; resume adds elapsed clip time to that offset (test: 18 seconds elapsed resumes at 78 seconds). Playback regression tests and TypeScript pass. True nearest-downbeat alignment remains unimplemented: Spotify audio-analysis access is restricted, and BPM alone is not a beat grid. Clarification pending whether Mike wants audio inside BTTB or through Spotify desktop.

## DJ beta focus — September 16
Scope now prioritizes Serato DJ beta; streaming integrations are not beta release-approved. See DJ_BETA_READINESS.md. Added metadata-only hosted CSV import and compact console. Serato detected-track changes now drive the actual countdown, and browser audio/automatic next-song playback are disabled for Serato. Build and DJ route/timer tests pass; compact view inspected in browser. Verification uses disposable cloned game fixtures. Local Prisma TCP bridge limits connections to one even for local production builds after concurrent portal/prepared-statement failures. Hosted database load testing remains required.

Full isolated verification passed after aligning the temporary Stripe test signing key. Final out-of-order called-track correction passed targeted DJ tests and TypeScript. No deployment, live charges, or reopening of ended real games. Next gate: real Serato plus phone rehearsal; free five-player practice is the provisional test scope.

### Explicit practice repair — September 17
CSV/crate import now passes an explicit practice option to game persistence. It reserves five-player free access even when subscriptions are disabled or the host has a paid plan. Existing test game YP29AQ was incorrectly non-practice; its unpaid checkout was expired, game corrected to practice, and its sole pending one-card entry made free/active. No paid purchases existed. Live join-options endpoint confirms isPractice=true. TypeScript and import/capacity checks pass.


## Player-card recovery rehearsal — September 22, 2026

Browser rehearsal completed in a separate disposable free practice game, leaving the existing completed games unchanged. Joined through the player page, marked Down 4 U, confirmed one saved database mark, reloaded and observed the checked square, then completed the test game and verified the locked final-card view retained its checkmark. The final card exposes text rather than editable song controls.

The player marks endpoint and real-session regression cover ownership, played-song eligibility, save/clear/restore, and completion locking. Load/save requests have a 15-second timeout; failed loads offer a retry control. Earlier browser-only marks that were already lost remain unrecoverable. This desktop browser rehearsal supplements the earlier phone tests; it is not a new physical Safari test.

Corrected the free-practice join footer to say no payment is required. Paid games retain the Stripe payment wording. Remaining release checks include Virtual DJ physical playback, production packaging, and deployment readiness; no production release is claimed.

## Virtual DJ discovery — September 22, 2026

Fixed discovery of the current macOS Library/Application Support/VirtualDJ home and MyLists playlist directory, with legacy Documents and Library locations retained. Explicit BTTB_VIRTUALDJ_PATH remains authoritative and permission errors are surfaced. Regression fixtures cover current/legacy discovery, missing overrides, playlist import and history detection.

Read-only validation found the installed local library and its latest history entry, Down 4 U (Clean). No saved playlists were present in the supported playlist directories, so live game playback remains pending a user-created Virtual DJ playlist. The local historyDelay setting was 45 seconds; the console now explains the 1-second setting for faster history-based detection. No Virtual DJ files or settings were modified. Official setting reference: https://autoupdate.virtualdj.com/manuals/virtualdj/appendix/optionslist.html

Full isolated verification and production build passed. This validates local history access, not a completed physical Virtual DJ playback rehearsal.

## Virtual DJ external playlist and visible locations

Located BTTB TEST CRATE at /Volumes/T7 Serato D/VirtualDJ/MyLists/BTTB TEST CRATE.vdjfolder and loaded all 45 unique songs read-only. Virtual DJ adapter now discovers mounted macOS drive libraries and reads their metadata along with the Mac library. Explicit library overrides remain isolated. Tests cover external playlist loading, metadata, disconnected drives and unrelated volumes.

The authenticated local playlist response supplies detected library locations. The Virtual DJ setup page shows the Mac and external-drive locations, with a reminder to keep the music drive connected. On this machine these are /Users/djmikedoelo/Library/Application Support/VirtualDJ and /Volumes/T7 Serato D/VirtualDJ. Local music libraries were not modified.

Windows parity: the location guide now includes %LOCALAPPDATA%\VirtualDJ, %USERPROFILE%\Documents\VirtualDJ, external drive-letter examples and Virtual DJ's folder shortcut. Detected locations are labeled without assuming a Mac. Windows discovery tests simulate modern/legacy folders and mounted drive letters; a physical Windows playback rehearsal is still outstanding. Path reference: https://virtualdj.com/wiki/How%2Bto%2BTransfer%2BTo%2BA%2BNew%2BComputer.html

## Virtual DJ live playback rehearsal

User played songs from 80S-90S POP in game 1de1deae-e619-4c2f-ade2-74abc8b6a3ef (9FZAE9). Console visibly received Africa, Time of My Life and You Should Be Dancing, with the song reveal state observed. Found missing artist tags made the plain text history split Time of My Life incorrectly. Adapter now attaches a music file path from the matching final daily history entry only when both time and display text agree, and restores its original metadata. This uses the existing unique file matching rule; mismatched/incomplete history writes do not attach a path.

Targeted DJ bridge tests, TypeScript and production build passed. Live read-only check confirmed You Should Be Dancing carries a file path matching the saved game. Full regression was attempted twice but blocked during temporary fixture setup by local PostgreSQL prepared-statement and memory allocation errors. No full-suite pass is claimed for this change. The live user's game was not restarted or ended.

## Automatic DJ connection recovery

The shared DJ Console now connects when a non-completed local-DJ game is restored, retries failed/8-second-stalled requests every second, and keeps retry intent separate from connection health. It stores the last observed history ID per game/provider so newer history arriving during a reload can be detected without replaying an already-observed entry. Intentional Disconnect persists. Polling uses the latest callback without resetting the interval on every playback/session change. Repeated unchanged history no longer overwrites useful match/error messages.

Verified the live Virtual DJ console returns to CONNECTED after reload without clicking Connect. Read-only database/history comparison confirms exact saved file identity for both Bill Medley Time of My Life and Toto Africa Other. New native playback after this change still needs observation; no past song was manually marked as called. Bridge/recovery, playback, winner-completion tests, TypeScript and build passed. Full database regression remains outstanding after the earlier local DB memory failure and user-assisted restart.

## Already-selected song countdown fix

Live Bill Medley detection matched the correct file but left the timer ready at 30: the automatic-start effect depended on index/status changes, neither of which changed for an already-selected ready song. DJ detection now selects and starts the engine directly, with no second start queued for that effect. A regression test executes the actual console handler against the real timer engine and covers same selected song, subsequent songs and duplicate detections.

Playback and bridge/recovery tests, TypeScript and production build passed. Updated local app loaded. The previously stuck Bill Medley countdown was explicitly resumed through the UI for recovery (not claimed as a fresh automatic detection); the UI showed Countdown Running. Future fresh detections use the corrected handler.

## Completed Virtual DJ and phone acceptance test

User confirmed fresh Toto – Africa Other detection started automatically, its player-card square could be marked, and the mark survived a phone refresh. Game 9FZAE9 / 1de1deae-e619-4c2f-ade2-74abc8b6a3ef produced a valid Any Line claim for Michael Whitfield, Card #1. The server verified all five songs were called: Bill Medley Time of My Life, Never Gonna Give You Up, Every Breath You Take, You Should Be Dancing, and Africa Other. Verified the practice winner through the console and observed automatic game completion. User then confirmed the phone's ended-game view and retained final marks.

## Local verification reliability

Reworked isolated fixture creation to batch database inserts, fetch card squares together, and use unique named queries instead of the unnamed prepared-statement slot that previously failed. This reduces setup traffic substantially while preserving the same cards and songs. Added tests for batch bounds, parameter binding, column consistency and failure propagation. Local application database connections now time out after five seconds instead of waiting indefinitely. These are reliability mitigations, not proof that the underlying local Prisma database memory issue is resolved.

Validation: the complete isolated verification suite passed after the fixture changes, including all previously outstanding DJ recovery/countdown checks and player/payment regressions. Production build passed. Temporary test data was removed. Sustained soak testing and a real Windows playback rehearsal remain separate release checks.

## Console polling reliability

The console now shares one player-roster request loop between its totals and player list. Completed games fetch final player and BINGO results once rather than continuing regular polling. Hidden/offline BINGO checks pause, returning to the page refreshes active games, overlapping requests are coalesced, and requests time out after ten seconds. Cleanup aborts requests and prevents stale BINGO responses from updating an unmounted game. Player-roster requests also have a ten-second timeout.

Validation: new polling tests cover overlapping requests, hidden pages, final results without continued polling, cleanup and timeout recovery. TypeScript, production build and the full isolated verification suite passed. The initial suite run was interrupted by editing its script while it ran; the clean rerun passed and removed its temporary fixture. This is bounded regression validation, not sustained soak testing or Windows hardware acceptance.

## Mac stability rehearsal and provider startup fix

Opening the Virtual DJ workspace initially mounted Serato before restoring the selected provider, triggering an unnecessary full Serato library read. During this rehearsal an unwanted Serato playlist request took 2.9 minutes while other requests slowed or timed out. The workspace now waits for URL/device selection before mounting a provider; unavailable browser storage still permits the URL selection and a safe default. A regression test executes the actual page through initial render and restoration for Virtual DJ, Rekordbox, saved preferences and blocked storage.

After restart with the fix, a 301-second read-only check completed 300 successful reads with zero failures (95th percentile 315ms, maximum 1359ms). Each read checked the saved called-song API and actual local Virtual DJ history; no game writes were performed by the probe. No Serato playlist requests appeared in this run. Earlier interrupted runs failed, so this result is bounded post-fix evidence, not proof that all prolonged-use issues are resolved.

Created free five-card rehearsal TGCRNX (18970290-5201-4764-826d-ed2573b7924c), 80S-90S POP, 34 usable songs. Creation returned successfully in 1.4 seconds. Console connected to Virtual DJ, displayed Miss You Much and Holiday, and showed Holiday automatically matched and revealed. Read-only database inspection confirmed both called songs persisted. The game remains available for continued playback. Three-song/longer live acceptance and Windows hardware testing remain incomplete; user has no Windows PC available.

Validation: startup and polling regression tests, changed-file lint, production build and the full isolated verification suite passed; temporary verification data was removed.

Live follow-up: the requested three-song rehearsal exceeded its target. Read-only database inspection confirmed six distinct called songs in TGCRNX: Miss You Much, Holiday, Lets Go Crazy, You Should Be Dancing, Sledgehammer, and Dont Wanna Fall In Love (7 inch Remix). The console showed Sledgehammer matched automatically with the timer at zero / Song Revealed; player Mike joined with one free card. This passes the bounded multi-song detection/persistence check. It does not replace extended event-length testing or Windows hardware acceptance.

## Recently Played duplicate correction

Each matched DJ detection previously inserted both a raw-history row and a matched playlist row. It now inserts only the matched row; unmatched and manual observations still appear once. Existing adjacent raw/matched display pairs are filtered conservatively, preserving different artists, versions and separate plays. Console reload now restores its history from saved called-song timestamps rather than clearing the list. Verified the live TGCRNX console displays its eight saved songs once after reload.

Playback/history regression tests, production build and the complete isolated verification suite passed. No called-song or player-card records were changed by this display correction.

## Caller Screen game binding and played-song history

Caller windows now open with an explicit game ID, read game-specific saved snapshots, and ignore broadcasts from other games. A one-second storage check recovers missed browser events. The game snapshot used for the join code is also saved per game. Legacy caller URLs bind once to the initial game instead of following whichever console broadcasts next.

The caller previously preferred a slice of playlist positions for its recent-song list, which is incorrect when a DJ plays songs out of order. It now uses the console's actual played IDs, includes the current song once on reveal, and excludes skipped songs. Restored played IDs are ordered by saved call timestamps. Browser validation showed TGCRNX's actual last five songs on its linked Caller Screen, including Catch Me (I'm Falling) and Talking In Your Sleep, with the correct player/join code. A fresh countdown/reveal check is pending user playback.

Tests exercise two competing games, missed messages, unavailable BroadcastChannel, listener cleanup, scoped publishing and out-of-order history. Full isolated verification and production build passed.

## Caller completion display and live confirmation

User confirmed the live Caller Screen now shows the played song. Completed callers now show Game complete instead of hidden-song/countdown/listening instructions, retain final history, and stop periodic roster polling. Regression tests cover completion with and without a current song and restoring the latest game-specific snapshot after remount. Caller, polling, winner-completion tests and production build passed. Current live game was not ended for testing.

## Automatic last-square BINGO

Saving the last selected square now checks the configured winning pattern against the player's purchased card and server-called songs. Under the same game row lock and transaction, a valid pattern saves the marks, verifies the winner, marks the card WINNER, and completes the game. Later mark writes are locked. A pending manual claim can no longer downgrade a verified winner.

The winning player immediately sees Game Ended and the winner's saved name/card number. Other player screens receive the same result through their existing one-second played-song polling; reload restores the winner and final marks. The DJ's existing verified-winner listener handles console completion. No live rehearsal game was ended for testing.

Validation: focused marks tests and real isolated practice integration cover incomplete versus completed patterns, called-song eligibility, winner announcement, final saved marks, and completion locks. Production build and full isolated verification passed. Changed backend files lint clean; the player page retains its pre-existing five lint errors and five warnings (identical before/after), with no added diagnostics.

## Visible winner on Caller Screen and retained results

User clarified that the missing announcement was on the Caller Screen. It previously displayed only Game complete. The caller now reads the saved verified winner for its bound game, prominently shows the name and card number, retries failed requests, and stops result polling after confirmation. Confirmed in the live TGCRNX caller: Mike wins!, BINGO! Card #5 • Game over, with final song history retained. No winner records were changed.

Player completion also has a prominent winner headline and a permanent game-specific results link; completion heartbeats include winner details. /game/results?gameId=... displays verified results without requiring the old player session. Completed player results take precedence over a stale session-change notice.

Validation: full isolated regression suite passed for heartbeat/results changes, including real completion heartbeat and public result-page checks. Additional actual-component tests passed for caller winners with/without a current track and player result rendering/session-change races. Final production build passed and live caller browser verification showed the winner.

## No-charge multi-player rehearsal

Phone-test mode now rejects live or unknown Stripe keys before constructing the payment client. The rehearsal launcher uses a placeholder test key; no paid checkout is needed for free practice. Guard tests cover both standard and restricted live/test key prefixes.

A separate temporary practice game exercised five independent signed player sessions through the local app and database. All five joined, an existing player reconnected without duplicate allocation, a sixth was blocked, the winning selection completed the game, and every player's heartbeat and saved-card read returned the same verified winner. Other players' marks remained unchanged. No Stripe checkout or live-game mutation occurred. Temporary game and account fixtures were deleted. This is simulated multi-player coverage, not yet a real multi-device or full-capacity event test.


## September 26 — installed beta reliability update

Applied the reviewed reliability package to the existing Mac project, preserving the approved console and provider design. Called-song saves now recheck ownership and completed/cancelled status inside the same game-row lock used by winner confirmation. The browser song-save queue has a ten-second deadline covering response headers and body, retains pending songs after timeouts, and ignores late acknowledgments from timed-out attempts.

The existing local Prisma default service was listening but read-only database connections repeatedly timed out. With Mike's approval, stopped and restarted only that existing service using Prisma's stop/start commands. No database reset, deletion, migration, Mac restart, payment configuration change or music-library change was performed. Connectivity returned. This is recovery evidence, not a resolution of the earlier prolonged-use database issue.

Validation completed on the Mac:
- All 38 focused handler/queue tests passed, including real loopback HTTP with the unmodified ten-second deadline. Handler concurrency dependencies are modeled, not a PostgreSQL concurrency/load test.
- Existing non-database regression scripts, TypeScript and changed-application-file lint passed.
- Production build passed in a detached validation worktree using next build --webpack. Original running app build directories were not replaced.
- Full npm run verify passed against that production-built app at localhost:3012 with the local database, disposable game fixtures and test-only payment credentials. The temporary server was stopped afterward.
- The five-player API/database rehearsal passed within the suite and three more times afterward. Each run verified distinct card ownership, reconnect, capacity, saved marks, the same winner reaching all sessions and completion locking. These are signed test sessions, not five physical devices.
- Before/after checksums for IDs and relevant game, card, purchase, winner, marked-square and called-song state were unchanged across six core tables. Temporary fixture data was removed.

The first full run revealed a pre-existing flaky test assumption: test-multiplayer-rehearsal.mjs used the first fixture card rather than the card actually allocated by enrollment. The test now uses the returned card ID and additionally asserts retained ownership on reconnect, five distinct assigned cards and rejection of another player's card even after its song has played. Production allocation and ownership rules were not weakened. The corrected complete rerun passed.

Remaining private-beta gates: real multi-device and event-length operation, acceptance of the invited DJs' software/computer versions, and repeatable supported tester setup. A separately authenticated hosted desktop companion, public self-service deployment validation, Windows hardware acceptance and live billing are not completed or release-approved by these tests.


## September 26 — supported Mac private-beta launcher

Added BTTB Private Beta.command and beta:start/beta:check to the existing product, not a replacement app. The launcher validates installed tooling and existing auth/library-owner/player-session settings, performs a read-only local database query, discovers a current private LAN address, and opens the existing Dashboard. It uses a separate .next-private-beta build directory and default port 3010. Normal .next and phone-test behavior are preserved. A matching second launch reuses the identified session; conflicting source/network settings or an unrelated port fail safely. Shutdown signals only the process group created by that invocation, not saved arbitrary PIDs or other applications.

The child always uses the existing phone-test guard, a nonfunctional test-only Stripe key, disabled subscription purchases and payment bypass, and a fresh in-memory webhook-signing secret. Original environment files, account secrets and prices are not rewritten. The readiness route returns only an identity/safety marker; it is unavailable outside launcher mode. This remains development-mode, trusted-local-network, no-charge testing for an already-provisioned Mac, not a signed installer or hosted desktop companion.

Validation in an isolated Mac worktree:
- Seventeen new behavioral startup/readiness tests passed, including private-network selection, stale-address rejection, live-key override, credential redaction, occupied ports, configuration guards and fingerprint changes.
- Actual launcher preflight, server start, matching second-launch reuse, controlled shutdown, invalid provisioning and conflicting-session refusal passed. The actual server rejected a known public test webhook signature with HTTP 400 after the per-launch signing-secret improvement.
- Changed-file lint, TypeScript, production build (webpack), and the complete isolated verification suite passed. The final full verification included the updated startup tests. Six-table before/after checksums of existing game data remained unchanged; temporary fixtures were removed.
- A ten-minute read-only observation completed 600 reads: 599 matched the initial final-game snapshot; one raw response signature differed at 232 seconds. Successful-read p95 was about 119 ms. The inconsistent response body was not retained, so this is NOT a clean stability pass and does NOT establish data loss or its cause. Keep this gate open.
- A subsequent one-minute run captured 378 identical API payloads. Its initial direct-database expectation was wrong because the raw pg driver interpreted timestamp-without-time-zone values in the Mac's local timezone. Recomparison to SQL-formatted stored timestamps matched all 378 captured responses. No stored timestamps, Prisma behavior, or application code were changed to force a match. This does not erase or explain the earlier single inconsistency.

See PRIVATE_BETA_STARTUP.md for supported startup, safety, recovery and separate-tester provisioning requirements. Remaining gates are real multi-device play, event-length active operation with retained mismatch diagnostics, and acceptance/setup on the invited testers' actual computers. No private-beta or public-release approval is claimed from a launcher or a short read-only check.
