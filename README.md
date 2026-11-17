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
4. Open **Realtime Database → Rules** for the **asia-southeast1** database. Back up the current rules and review the included database.rules.json file; publish those rules to the correct database.
5. Verify with two browser profiles: sign in as teacher on the host screen, use the generated team QR on a student phone, scan a printed card, complete the mission, and confirm the score changes. A second host/browser must not be able to edit the first session.
6. Check the browser console, Firebase Authentication users, and RTDB permission-denied errors before wider distribution.

The new format stores rounds in sessions/{random-session-id}/rounds/{random-round-id}/scans and the current state in sessions/{random-session-id}/gameState. The old shared /gameState and /scans paths are no longer used. **Do not delete old data without backing it up.** Existing QR codes from the previous version are incompatible; distribute fresh QR codes.

Only authenticated Google users can create session ownership records; only the session's host UID can write game state. Anonymous student scanners can submit only limited-format scan records to the current playing round. The database rules must be deployed and verified, not merely committed to GitHub.

### Known security limits

- Client-side speech recognition and quiz answers are **not cryptographically verifiable**; a sophisticated student can forge a valid-looking submission with a score from the allowed set. The host validates card identifiers and deduplicates scores, but this is a classroom activity, **not a tamper-proof examination or grading system**. For graded assessments, move validation and scoring to a trusted backend (e.g. Cloud Functions), bind submissions to server-issued challenges, and apply server-side rate limiting.
- The QR is rendered by the third-party service api.qrserver.com. That service receives the joining URL with its random session identifier. Do not include student personal data in the URL; for confidential settings replace this with local QR rendering.
- Session data remains in Realtime Database until an administrator deletes it or a retention policy is implemented. The app does not transmit names, emails or voice recordings in scan submissions, but Authentication tracks account identifiers.
- Do not rely on a Firebase **web API key** as a secret. Authorization depends on Authentication + Realtime Database Rules, never on concealing the public config.
- A secure HTTPS origin is required for camera access, microphone permission and cryptographically random session IDs.

## Usage

**Teacher:** Sign in using Google, select a theme, display a team QR (A–D), and press START GAME. A new round ID is created each time.

**Students:** Open the team's generated QR using a smartphone, allow anonymous Firebase sign-in and camera access, scan the matching printed card, then complete the vocabulary or speaking mission. Only the first accepted scan for the same team and card earns points within a round.

**Solo Learning:** Available without signing in. High scores are kept locally per theme **and question count** (10, 20, all); no student data is shared with Firebase by this mode.

## Content and assets

Each JSON file in src/data/ has 30 unique cards and vocabulary entries. The PDF downloads in public/materials/ exist for Cafe, English, Media, Revitalization, SDGs, Volunteer, World and Worries. Airport, Help, Hotel and Zoo PDFs are not supplied yet; their broken links were removed.

## QA / release checklist

- [ ] npm ci, ESLint, node --test, Vite build and npm audit --audit-level=high pass in GitHub Actions.
- [ ] Publish the **new Firebase rules** in the correct environment; enable both sign-in providers.
- [ ] Test teacher login, anonymous scanner login, QR display and a complete round.
- [ ] Verify that another host cannot overwrite the teacher's game.
- [ ] Test duplicate scans, unsupported speech recognition, denied microphone/camera permissions and network failure recovery.
- [ ] Check Safari/iOS, Chrome/Android and student Chromebooks with real QR cards.
- [ ] Confirm scanning, point awards and timer expiry across two simultaneous sessions.
- [ ] Manually approve the pull request before production release.

No production deployment or database-rules publication is performed by the code changes in this pull request.
