# Contributing to DualDash

Thanks for helping. DualDash is an Android GPS speed HUD. The living spec, `docs/SPEC.md`, is the source of truth.

## Workflow

1. Fork the repository and create a branch from `master`.
2. Install exact dependencies: `npm ci`.
3. Make your change.
4. Keep the suite green: `npx vitest run` must pass in full (367/367 at v1.4).
5. Check the build: `npm run build` and `npx tsc -b` must exit 0.
6. Update `docs/SPEC.md` in the same pull request as any substantive change. Do not defer the spec update.
7. Add a `CHANGELOG.md` entry, newest first, when the change is notable.
8. Open a pull request. Describe what changed and why.

## Documentation rules

- Write ASD-STE100 style English: active voice, short sentences, one idea per sentence.
- State facts, not marketing. Name the evidence for each claim.
- Update the spec and the changelog together with the code.

## Code notes

- `src/core/` is pure logic with no platform imports. Keep it that way.
- New platform access goes behind a seam, in the style of `SpeedSource`, `ScreenLock`, and `Buzz`.
- DualDash stores nothing. Do not add persistence, analytics, or network calls without an accepted spec decision.
- Android minimum version is API 29 (Android 10).

## Commit and pull request style

- Prefix the commit message with a lowercase type and scope, for example `fix: tape seam at north`.
- Keep pull requests focused: one change per pull request.
- Say in the pull request what you tested. Paste real command output. Never fabricate results.
