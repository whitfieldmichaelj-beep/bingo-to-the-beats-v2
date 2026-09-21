# DJ beta readiness — September 16, 2026

## Scope
Serato plays the music through the DJ's equipment. BTTB imports song metadata, generates cards, follows a public Serato Live Playlist, and manages the bingo game. Spotify and Apple Music are outside this beta scope. Existing streaming work is retained, not release-approved.

## Implemented in this pass
- Hosted-compatible CSV song-list creation at /music/upload: 25–500 unique songs, artist/title only, no audio files or server filesystem access. Five-player practice and plan-controlled larger games.
- DJ selection now leads to song-list import, with the existing Mac library workspace as another option.
- Serato detection selects the matching playback-engine track and starts its countdown. No duplicate browser audio; auto advancement waits for the next Serato detection.
- Compact View in the current console: essential controls, song, timer, connection state and game code. A normal browser window is not Always on Top; a desktop companion remains future work.
- Verification now creates and cleans up an isolated local test game rather than depending on a user's game remaining open.

## Private-beta acceptance rehearsal (requires Mike's Mac and a phone)
1. Export a CSV with Title/Artist (or supported equivalent headers) for 25 or more distinct songs. Import it, choose five-player practice, create the game. End the existing active game first if prompted.
2. In Serato, enable Live Playlist; on its website choose Edit Details > Public, save, and complete Start Live Playlist.
3. In BTTB connect that DJ's live URL. Play two songs from the imported set, including one out of playlist order. Each must select the correct bingo song and restart the countdown once; repeated polls must not restart it.
4. Play an unlisted song: display the mismatch without calling a different song. Disconnect/reconnect the network and verify recovery.
5. Join from a phone on the same network using the QR code; get one free card. Refresh/rejoin without a second seat/card. Reveal songs, mark the card, and check valid/invalid bingo claims.
6. Pause, resume, refresh the host, use Compact View, open the caller screen, end the game, then create another game with a new code.
7. Confirm audio stays exclusively in Serato and does not jump when BTTB reveals a song.

## Public-beta gates still open
- Hosted deployment and production database verification, HTTPS origin, Clerk callbacks and public phone join links.
- Hosted database concurrency/load test; local Prisma bridge has shown prepared-statement/portal errors and is not representative of hosted PostgreSQL.
- Invite/access policy and beta billing choice; real charges remain disabled. Larger invite tests need test subscriptions or a deliberately designed beta entitlement.
- Real-device rehearsal above, including a second DJ/account and a different computer.
- Stripe hosted upgrade confirmation/webhook rehearsal if billing enters beta scope.
- Resolve existing Serato crates file-tracing packaging warning (local disk workspace).
- Confirm DJ-only beta navigation excludes unsupported streaming offers before public deployment.

Not deployed. Public beta is not yet ready.

## Verification result
Production build passed with the existing crate tracing warning. Full isolated verification passed (player concurrency/reconnect, free practice, refunds, disputes, signed checkout lifecycle, host access/billing, Serato parser and imports). A subsequent final DJ fix makes called-track synchronization send only the actual started song, never all preceding playlist positions; targeted timer/out-of-order tests and TypeScript pass. Temporary test server and fixture were cleaned up. Live Serato/phone rehearsal and hosted release gates remain open.
