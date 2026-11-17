# Scannect — Classroom QR & Speaking Game

12 classroom themes × 30 cards = **360 matching cards**. React + Vite, Firebase Realtime Database, Firebase Authentication, QR scanning and browser speech recognition.

## Development

Requires Node.js 22+.

    npm ci
    npm run lint
    npm test
    npm run build
    npm run dev

## Security setup — REQUIRED BEFORE DEPLOYING THIS BRANCH

**Do not deploy the new frontend before updating Firebase.** Otherwise game sessions will fail to connect. The frontend alone cannot secure Firebase.

1. Open the existing Firebase project **scannect** in Firebase Console.
2. Under **Authentication → Sign-in method**, enable **Google** for the teacher and **Anonymous** for student scanners.
3. Under **Authentication → Settings → Authorized domains**, add the production site domain (not a wildcard). Only add domains you control.
4. Sign in once with the intended teacher Google account, then find that account's Firebase Authentication **UID** in the Authentication → Users list. In Realtime Database → Data, create a node named **teachers**, with a child whose key is the exact UID and whose Boolean value is **true**. Add each teacher explicitly; do not allow ordinary students to create or edit this allowlist. Google login by itself is not authorization to host.
5. Open **Realtime Database → Rules** for the **asia-southeast1** database. Back up the current rules and review the included database.rules.json file; publish those rules to the correct database.
6. Verify with two browser profiles: sign in as teacher on the host screen, use the generated team QR on a student phone, scan a printed card, complete the mission, and confirm the score changes. A second host/browser must not be able to edit the first session.
7. Check the browser console, Firebase Authentication users, and RTDB permission-denied errors before wider distribution.

The new format stores rounds in sessions/{random-session-id}/rounds/{random-round-id}/scans and the current state in sessions/{random-session-id}/gameState. The old shared /gameState and /scans paths are no longer used. **Do not delete old data without backing it up.** Existing QR codes from the previous version are incompatible; distribute fresh QR codes.

Only **allowlisted teachers authenticated by Google** can create session ownership records; only the session's host UID can write game state and read raw scan submissions. Anonymous student scanners can read the current game state and submit only limited-format scan records to the current playing round. Each student UID can submit a particular card ID only once per round. The database rules must be deployed and verified, not merely committed to GitHub.

### Known security limits

- Client-side speech recognition and quiz answers are **not cryptographically verifiable**; a sophisticated student can forge a valid-looking submission with a score from the allowed set. The host validates card identifiers and deduplicates scores, but this is a classroom activity, **not a tamper-proof examination or grading system**. For graded assessments, move validation and scoring to a trusted backend (e.g. Cloud Functions), bind submissions to server-issued challenges, and apply server-side rate limiting.
- Team join QR codes are rendered locally as SVG by qrcode.react; join URLs are not sent to an external QR-image service. Keep the random session URL within the class, as anybody who receives it can join as a scanner.
- Session data remains in Realtime Database until an administrator deletes it or a retention policy is implemented. The app does not transmit names, emails or voice recordings in scan submissions, but Authentication tracks account identifiers.
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

- [ ] npm ci, ESLint, node --test, Vite build and the **production-dependency** high-severity audit pass in GitHub Actions.
- [ ] Review the full npm audit report; unresolved development-only advisories are not ignored, but do not block production assets.
- [ ] Publish the **new Firebase rules** in the correct environment; enable both sign-in providers.
- [ ] Test teacher login, anonymous scanner login, QR display and a complete round.
- [ ] Verify that another host cannot overwrite the teacher's game.
- [ ] Test duplicate scans, unsupported speech recognition, denied microphone/camera permissions and network failure recovery.
- [ ] Check Safari/iOS, Chrome/Android and student Chromebooks with real QR cards.
- [ ] Confirm scanning, point awards and timer expiry across two simultaneous sessions.
- [ ] Manually approve the pull request before production release.

### Advisory tracking

As of November 18, 2026, npm audit reports GHSA-fc5q-39xc-vjpf (picomatch, a transitive dependency of the Vite development toolchain) with no patched release in the current Vite dependency range. The CI continues to display the full npm audit as a warning and **blocks on high-severity production dependencies**. Do not use untrusted glob expressions with local build tooling and reevaluate when a safe picomatch patch becomes available.

No production deployment or database-rules publication is performed by the code changes in this pull request.
