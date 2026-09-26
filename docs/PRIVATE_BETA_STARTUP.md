# Supported Mac private-beta startup

This continues the existing BTTB build. It does not replace the DJ Console, native DJ adapters, saved games, or player protections.

## For Mike and an already-provisioned beta Mac

Open **BTTB Private Beta.command** in the project, or the Desktop shortcut when the operator has installed it. The launcher opens the existing Dashboard after the app is ready. Keep its Terminal window open. No command copying, code editing, dependency installation, or manual Git work is needed to start a configured Mac.

The default host address is `http://localhost:3010/dashboard`. The launcher prints the phone address from a private network currently attached to the Mac; it does not reuse an old LAN address blindly. Players must use the same trusted network and the join code/QR from their current game. A real phone must confirm Wi-Fi reachability; software running on the Mac cannot establish that a router allows phone-to-Mac traffic.

Use **five-player free practice only**. Select the intended DJ software in the existing workspace, select its music list, and retain the same console workflow. Do not restart old Serato repair installers. Do not reopen a completed game just to test.

A second launch reuses the existing beta session only when its identity, project source, port, and current network match. It refuses to take over an unrelated process. After source or network changes, close only the beta launcher's Terminal with Control+C and reopen it. The launcher never stops an arbitrary saved process ID.

Control+C stops only the app process group started by that launcher. It does not stop the database, the original app on ports 3000/3001, Serato, Rekordbox, VirtualDJ, or Remote Desktop Commander. Restarting BTTB does not require ending a game; the existing Dashboard resume flow remains authoritative.

## Safety and limitations

- Live Stripe calls cannot be authenticated from this launcher: the child receives a nonfunctional test-only placeholder, the existing phone-test guard, disabled subscription purchases, and disabled development payment bypass. A fresh, unshared webhook-signing secret is generated in child memory for each start; known test signatures cannot be reused. Real credentials and `.env` files are not rewritten.
- The child runs development mode for phone testing over local HTTP. It uses `.next-private-beta` rather than the existing `.next` and `.next-phone-test` build directories. This is not the production HTTPS configuration or a public hosting model.
- Startup performs a read-only local database query. An unavailable database stops startup with an actionable message; it never resets, removes, migrates, or automatically restarts the database.
- Host sign-in, configured library-owner isolation, and signed player sessions are unchanged. The local health endpoint returns only a run identity and safety marker; it is disabled outside this private-beta mode and does not return credentials, file paths, accounts, or game data.
- Local run records live in `~/Library/Application Support/BTTB Beta`. They are not uploaded. Stopped-run records may be retained for diagnosis; no password is stored there.
- This is a startup convenience for a provisioned Mac, **not** a signed standalone installer, a hosted-to-laptop companion, or verified Windows support. Do not distribute this Mac's environment file, database, or music library to another tester.

## Operator provisioning before another DJ uses it

Provide that tester with the current source and approved installed dependencies, a working Node.js 22+ executable, an initialized local database, a generated Prisma client, their own Clerk setup/account and the correct BTTB local-library owner setting, and a strong player-session secret. Secrets must be provisioned locally, not posted to chat or committed. The launcher intentionally does not create accounts, copy Mike's credentials, bypass access checks, or install unknown packages automatically.

Verify the invited DJ's actual software version and local library. Retain the provider-specific timing notes in the existing console. The Serato, Rekordbox, and VirtualDJ paths share the UI, but real native timing and complete player/winner acceptance remain specific to the software version tested.

## Operator automation already included

- `npm run beta:check` performs preflight without starting a server or browser.
- `npm run beta:start` runs the same launcher as the double-click file.
- `npm run test:beta-startup` runs the deterministic startup and readiness tests.
- `--no-open` avoids opening a browser; `--port NUMBER` chooses a nonconflicting test port; `--host PRIVATE_IP` selects one of this Mac's current private interfaces when multiple networks are active.

These tools use the currently installed project. They do not pull, reset, commit, deploy, enable billing, or change prices.

## Remaining acceptance steps

Finish a real multi-device game, an event-length active playback/recovery session, and another provisioned tester's startup and software acceptance. The automated five-player/API tests and read-only stability observation do not replace those gates. Keep streaming-service beta approval, public self-service onboarding, Windows hardware testing, and live billing separate from this controlled no-charge beta.
