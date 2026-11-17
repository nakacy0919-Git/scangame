# Scannect — Classroom QR & Speaking Game

12 classroom themes × 30 cards = **360 matching cards**. React + esbuild, Firebase Realtime Database, Firebase Authentication, QR scanning and browser speech recognition.

## Development

Requires Node.js 22+.

    npm ci
    npm run lint
    npm test
    npm run build
    npm run dev

Use `npm run preview` to serve the built `dist/` files locally. esbuild watches JavaScript and CSS but does not automatically hot-reload the browser; refresh the page manually during development.

## Security setup — REQUIRED BEFORE DEPLOYING THIS BRANCH

**Do not deploy the new frontend before updating Firebase.** Otherwise game sessions will fail to connect. The frontend alone cannot secure Firebase. The secured scoring flow also requires deploying the included Firebase Cloud Functions after enabling the paid Blaze billing tier; this pull request does not activate billing or deploy functions.

1. Open the existing Firebase project **scannect** in Firebase Console.
2. Under **Authentication → Sign-in method**, enable **Google** for the teacher and **Anonymous** for student scanners.
3. Under **Authentication → Settings → Authorized domains**, add the production site domain (not a wildcard). Only add domains you control.
4. Sign in once with the intended teacher Google account, then find that account's Firebase Authentication **UID** in the Authentication → Users list. In Realtime Database → Data, create a node named **teachers**, with a child whose key is the exact UID and whose Boolean value is **true**. Add each teacher explicitly; do not allow ordinary students to create or edit this allowlist. Google login by itself is not authorization to host.
5. Before publishing the new rules or frontend, review and deploy the `startMission` and `submitMission` Cloud Functions from `functions/`. Firebase requires the **Blaze billing plan** (pay-as-you-go) to deploy Cloud Functions; enable billing, set a budget alert and verify cost with the project owner first. Confirm functions in `asia-southeast1`. The old frontend must not be used after denying client scan writes.
6. Open **Realtime Database → Rules** for the **asia-southeast1** database. Back up the current rules and review the included database.rules.json file; publish those rules to the correct database.
7. Verify with two browser profiles: sign in as teacher on the host screen, use the generated team QR on a student phone, scan a printed card, complete the mission, and confirm the score changes. A second host/browser must not be able to edit the first session.
8. Check the browser console, Firebase Authentication users, and RTDB permission-denied errors before wider distribution.

The new format stores rounds in sessions/{random-session-id}/rounds/{random-round-id}/scans and the current state in sessions/{random-session-id}/gameState. The old shared /gameState and /scans paths are no longer used. **Do not delete old data without backing it up.** Existing QR codes from the previous version are incompatible; distribute fresh QR codes.

Only **allowlisted teachers authenticated by Google** can create session ownership records; only the session's host UID can write game state and read raw scan submissions. Anonymous student scanners can read the current game state but **cannot write any score record**; callable Cloud Functions issue each challenge and insert server-scored scan records. Each student UID can submit a particular card ID only once per round. The server has a first-write-wins transaction for duplicate submissions. The database rules must be deployed and verified, not merely committed to GitHub.

### Known security limits

- All points are now decided in trusted Cloud Functions: **vocabulary = 3 points if correct, 1 otherwise; speaking = 1 participation point**. The old 5/10-point client-reported speech bonuses are intentionally no longer accepted. Browser speech recognition still gives feedback for learning, but cannot verify that speech genuinely occurred; reliable speaking scores above participation level require teacher verification or trusted server-side audio evaluation. For high-stakes assessment, add strong student identity, App Check, rate limiting across anonymous accounts, and validated audio processing. The printed card answer vocabulary is present in the public source, so quiz challenge answers are not secret from technical users.
- Team join QR codes are rendered locally as SVG by qrcode.react; join URLs are not sent to an external QR-image service. Keep the random session URL within the class, as anybody who receives it can join as a scanner.
- Session/challenge data remains in Realtime Database until an administrator deletes it or a retention policy is implemented. The app does not transmit names, emails or voice recordings in scan submissions, but Authentication tracks account identifiers.
- Do not rely on a Firebase **web API key** as a secret. Authorization depends on Authentication + Realtime Database Rules, never on concealing the public config.
- A secure HTTPS origin is required for camera access, microphone permission and cryptographically random session IDs.

## Usage

**Teacher:** Sign in using Google, select a theme, display a team QR (A–D), and press START GAME. Each round has its own ID and server-enforced end deadline. A refresh of the same teacher browser restores the last session from localStorage, and reconstructs scores from stored scan records. At the end of each class, click **新しい授業用QRを作成** to rotate the session ID and prevent old class QR links from joining the next class. Never share the same session between unrelated classes.

**Students:** Open the team's generated QR using a smartphone, allow anonymous Firebase sign-in and camera access, scan the matching printed card, then complete the vocabulary or speaking mission. Only the first accepted scan for the same team and card earns points within a round. Network interruptions may delay the score; only confirmed Firebase scan records count.

**Solo Learning:** Available without signing in. High scores are kept locally per theme **and question count** (10, 20, all); no student data is shared with Firebase by this mode.

## Content and assets

Each JSON file in src/data/ has 30 unique cards and vocabulary entries. The PDF downloads in public/materials/ exist for Cafe, English, Media, Revitalization, SDGs, Volunteer, World and Worries. Airport, Help, Hotel and Zoo PDFs are not supplied yet; their broken links were removed.

## Firebase Rules emulator security test

A dedicated non-production database emulator test is included. It validates the teacher allowlist, private scan reads, student scan permissions, correct theme-specific card IDs, duplicate submissions, and the game deadline. These tests do not contact the real scannect database.

    npm ci
    npm install --no-save --package-lock=false --legacy-peer-deps --ignore-scripts @firebase/rules-unit-testing@6.0.0
    npx -y firebase-tools@15.36.0 emulators:exec --only database --project demo-scannect "node tests/firebaseRulesEmulator.mjs"

Run this after every database.rules.json change, then verify real teacher/student devices in a test environment before applying rules in production. The Firebase Emulator requires **Node.js 24.12+** and Java 21 and does not replace live integration tests. For hosted CI, the dedicated Firebase Rules Emulator workflow runs when the rule files change or when manually dispatched. The normal Vite build still supports Node.js 22+.

## QA / release checklist

- [ ] npm ci, ESLint, node --test, esbuild build and the **production-dependency** high-severity audit pass in GitHub Actions.
- [ ] Review the full npm audit report; unresolved development-only advisories are not ignored, but do not block production assets.
- [ ] Publish the **new Firebase rules** in the correct environment; enable both sign-in providers.
- [ ] Test teacher login, anonymous scanner login, QR display and a complete round.
- [ ] Verify that another host cannot overwrite the teacher's game.
- [ ] Test duplicate scans, unsupported speech recognition, denied microphone/camera permissions and network failure recovery.
- [ ] Check Safari/iOS, Chrome/Android and student Chromebooks with real QR cards.
- [ ] Confirm scanning, point awards and timer expiry across two simultaneous sessions.
- [ ] Manually approve the pull request before production release.

### Advisory tracking

As of November 18, 2026, npm audit reports GHSA-fc5q-39xc-vjpf (picomatch, a transitive dependency of the former Vite development toolchain) with no patched release in the current Vite dependency range. The CI continues to display the full npm audit as a warning and **blocks on high-severity production dependencies**. Do not use untrusted glob expressions with local build tooling and reevaluate when a safe picomatch patch becomes available.

No production deployment or database-rules publication is performed by the code changes in this pull request.


## Server-scored classroom missions

1. Run `npm --prefix functions install`, `npm --prefix functions test` and `npm --prefix functions run lint` before deployment.
2. The Functions use project **scannect**, Realtime Database region **asia-southeast1**, and function region **asia-southeast1**. Keep the two regions consistent.
3. The root `functions/catalog.json` is generated from the 360 source cards and used by the server to validate card IDs and vocabulary answers; update it whenever the teaching cards change.
4. `startMission` creates one non-public, expiring challenge per anonymous student UID, card, round and team. `submitMission` performs atomic first-write-wins scoring. Students must not write scans directly.
5. **Deployment order is critical**: deploy the Functions and verify them in a test database, then publish `database.rules.json` (which denies direct scan writes), then deploy the matching frontend. Do not mix old/new components.
6. **No charges or production deployment have been made.** This implementation uses Cloud Functions and therefore is not a zero-cost Spark-plan solution. Cloud Functions has no-cost quotas on Blaze but billing is still required and usage can incur costs.
7. Anonymous accounts can be created in multiple browsers; these safeguards prevent arbitrary point values from a single authenticated caller, but cannot prove a student physically scanned a QR or did the work. Verify student identity and consider Firebase App Check if this is used competitively.
