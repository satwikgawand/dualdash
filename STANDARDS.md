# STANDARDS.md — fleet code style and practices

Canonical rules for every repo of the fleet (`satwikgawand` on GitHub).
Written for agents: Hermes, subagents, kanban workers, Claude Code, Codex.
Per-repo facts (gate commands, deploy flow, DB name) live in that repo's
`AGENTS.md`. Every rule cites its source; anything without a source is marked
`[UNVERIFIED]` — challenge it before following.

Sources: skills `living-spec`, `github`, `vercel-deploys`, `android-apk-builds`,
`vps-load-policy`, `turso-databases`, `requesting-code-review`; AGENTS samples
from repos `banana-scale`, `ebook-reader`, `kata`, `portfolio`.

## Git identity and commits
- Commit as `Satwik Gawand <satwikgawand@users.noreply.github.com>` — the global git identity.
- Never pass `-c user.name` / `-c user.email` overrides; Vercel rejects unknown commit authors (`COMMIT_AUTHOR_REQUIRED`). *(vercel-deploys)*
- Repair a wrong author: `git commit --amend --reset-author` + `git push --force-with-lease`. *(vercel-deploys)*
- Message: lowercase type prefix (`feat`/`fix`/`docs`/`chore`/`build`/`test`) + scope + imperative subject + card id in parens: `feat(auth): resend otp flow (kanri-42)`. *(owner convention)*
- Commit checkpoints when the tree is green. Never hold work to batch commits. *(owner convention)*
- Push every commit to origin. A task is not done until its commit is pushed.
- Create the private repo BEFORE work starts: `gh repo create satwikgawand/<name> --private`. *(owner convention)*
- On Vercel projects with `productionBranch: master`, every push deploys: work on a branch, ship a preview, get owner approval, then merge. *(vercel-deploys)*
- Preflight GitHub work with `gh auth status` once per session; verify every remote claim (CI green, merged, released) with a fresh `gh` read, never memory. *(github)*

## Living docs
- `docs/SPEC.md` is the source of truth: purpose, current state, dated decisions, architecture, next steps, open questions. *(living-spec)*
- Read `AGENTS.md` and `docs/SPEC.md` before touching a repo. Never start blind. *(living-spec, banana-scale AGENTS)*
- Update SPEC.md in the SAME commit as any substantive change. A change without a spec update is incomplete. *(living-spec)*
- Log each design decision as one dated line: decision, why, who. *(living-spec)*
- Spec is intent, not code: say what and why, point at files for how, no code dumps. *(living-spec)*
- If code and spec disagree, the spec is wrong — fix it in the same change that noticed the drift. *(living-spec)*
- Where adopted, append one `CHANGELOG.md` entry per change, newest first:
  `## YYYY-MM-DD - <title>` with **Done** / **Tried** / **Worked** / **Didn't work**. *(ebook-reader, kata AGENTS)*
- A delegated subagent that learns something durable writes it into SPEC.md (or names the exact section for the parent to update). *(living-spec)*
- Preserve generated agent-rule blocks committed by tools (e.g. Next.js `nextjs-agent-rules` markers in `portfolio` AGENTS); committing them keeps the tree clean. *(portfolio AGENTS)*

## Stack defaults
- Web frontends: React + TypeScript.
- Database: Turso by default; Supabase when production/auth needs it.
- Hosting: Vercel.
- Android: PWA + Capacitor, never a native rewrite.
- Tailwind where the repo already uses it; never introduce a second CSS system. *(owner convention)*

## Secrets
- Reference env var NAMES in prose. Never write token values in chat, commits, logs, or docs. *(vercel-deploys, turso-databases)*
- `/root/.hermes/.env` at mode 600; Turso creds at `~/.hermes/turso/*.json`, mode 600. Never inline a token in a command. *(turso-databases)*
- `.env*` is gitignored in every repo. Check before the first commit.
- Never accept a password, token, or card number in chat; humans set sensitive values in the dashboard. *(vercel-deploys)*
- A committed secret gets purged from history (see `github` skill, secret-cleanup) and rotated.

## Quality gates (minimum before any commit)
- Typecheck green (`tsc --noEmit` or repo equivalent).
- Lint green on the existing config; no new violations.
- Build green (`npm run build`) at the exact commit being shipped. *(vercel-deploys)*
- Run the existing test suite and report pass/fail counts. *(requesting-code-review)*
- Only NEW failures vs baseline block the commit; report pre-existing ones. *(requesting-code-review)*
- Scan added lines before commit: hardcoded secrets, shell/SQL injection, `eval`/`exec`, unsafe deserialization. *(requesting-code-review)*
- No agent verifies only its own work: independent review for changes of 2+ files. *(requesting-code-review)*
- The reviewer/manager RE-RUNS the claimed checks. A child's green is a self-report until re-verified. *(android-apk-builds, requesting-code-review)*
- Never fabricate outputs. If a tool fails, say so and paste the error. *(owner convention)*

## Evidence and verification
- Every claim about remote state (CI, merge, deploy, release, DB write) is backed by a fresh command read. *(github, turso-databases)*
- DB writes: read the rows back and report what was stored; the write response is not proof. *(turso-databases)*
- Deploys prove a chain, not a 200: live URL → deployment id → commit sha → repo file at that sha. *(vercel-deploys)*
- Visual changes need real screenshots at mobile widths first, reviewed before handoff. *(owner convention)*
- Deliverables go into chat as files (absolute `MEDIA:` path), never as paths to fetch. *(android-apk-builds)*

## Mobile-first UI (all web UI)
- The phone is the PRIMARY device; desktop is secondary. *(owner standing rule)*
- Verify at 320 / 360 / 375 / 412 px first; no horizontal scroll at any width.
- Touch targets ≥ 44×44 px.
- Input font-size ≥ 16px (no iOS zoom); numeric fields use numeric keypads.
- Put the main result near the controls that change it.

## Writing (user-facing copy)
- ASD-STE100 style: active voice, short sentences, no filler, one idea per sentence.
- Where the owner specified it (portfolio): max 2 sentences per item, each ≤ 10 words, machine-enforced by a committed scanner. *(owner convention)*

## Android / APK builds
- Build order: clean tree → `npm ci || npm install` → `npm run build` → `npx cap sync` (every expected plugin listed) → `./gradlew assembleDebug`. *(android-apk-builds)*
- Gate manifest-touching changes with an XML parse check AND the gradle build; a green JS suite never proves Android compiles. *(android-apk-builds)*
- Every owner-delivered rebuild bumps `versionName` (patch) + `versionCode` (+1), syncs every version field the repo carries (package.json too), and proves it with `aapt dump badging`. *(android-apk-builds)*
- Verify an APK from inside the file: recompute `sha256sum`, embedded bundle name == fresh dist, feature-literal grep, plugin list from the embedded config. Never trust byte size. *(android-apk-builds)*
- Record the sha256 of every delivered APK; CHANGELOG entry committed as Satwik and pushed. *(android-apk-builds)*
- Chain APK cards behind their feature cards; never build a repo another card is mid-editing. *(android-apk-builds)*

## Deploys (Vercel)
- Record the rollback point (current production deployment id + sha) BEFORE deploying. *(vercel-deploys)*
- Detect GitHub auto-deploy before deploying manually; re-derive project linkage every session. *(vercel-deploys)*
- Reuse the existing Vercel project; never create a new one for a repo that already deploys. *(vercel-deploys)*
- Never trust the CLI exit code: confirm the new production deployment's `readyState` via the deployments API. *(vercel-deploys)*
- Design/visual work ships as a preview; promote only after the owner's explicit OK. Never auto-promote a look. *(vercel-deploys)*
- Preview verification: served asset sha256 == local fresh dist, feature markers grepped on SERVED assets, production alias unchanged before and after. *(vercel-deploys)*
- If live is broken: roll back to the recorded id immediately, verify the alias recovers, then report FAIL with what you saw. *(vercel-deploys)*
- Env changes bind only to new deployments: redeploy before verifying behaviour. *(vercel-deploys)*

## Databases (Turso)
- All SQL goes through `turso-sql.py`; never import a libSQL client directly on this box. *(turso-databases)*
- Confirm schema (`PRAGMA table_info`) before writing SQL against an unfamiliar table. *(turso-databases)*
- Prefix tables by project in shared databases; confirm every name with a live query — never invent a table or account name. *(turso-databases)*

## VPS operations (1 core / 4 GB, no swap)
- Classify every task HEAVY (gradle/APK, Playwright/Chromium, full npm pipeline) or LIGHT (docs, research, SQL, text) before dispatching. *(vps-load-policy)*
- Max 1 HEAVY job at a time, even when the concurrency cap allows 2. *(vps-load-policy)*
- One Chromium context at a time; always close it; reuse cached Playwright binaries. *(vps-load-policy)*
- Test narrow while iterating (`npx vitest run tests/<file>`); full suite only at commit gates; build once per verification. *(vps-load-policy)*
- Reap idle Gradle daemons after a build batch: `pkill -f '[G]radleDaemon'` — bracket form, never mid-build. *(vps-load-policy)*
- Scratch (`/root/.hermes/cache/scratch`) self-prunes at 24h: throwaway artifacts only, never storage. *(vps-load-policy)*

## Process
- Cards carry acceptance criteria and state the evidence required to close them. *(owner convention)*
- Owner approval gates production deploys and design picks. *(vercel-deploys, owner convention)*
- Ideation: question rounds BEFORE building; freeze until the owner says go. *(owner convention)*
- Docs-only changes skip the heavy pipeline but still get a real diff review. *(requesting-code-review)*

## Adoption
Copy both files into a repo, or keep a one-line reference in its `AGENTS.md`.
See `README.md` in this repo for the exact commands.
