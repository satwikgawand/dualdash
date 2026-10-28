# AGENTS.md

Standards: satwikgawand/standards (STANDARDS.md) — follow them.

Rules for every agent in this repo (Hermes, subagents, kanban workers,
Claude Code, Codex):

1. Read `docs/SPEC.md` before starting work. Never start blind.
2. Update `docs/SPEC.md` in the same commit as any substantive change.
3. Run the gate commands below before claiming done. Paste real output.
4. Commit as Satwik (global git identity, never `-c user.name`/`-c user.email`
   overrides). Prefix the message with a lowercase type + scope + card id.
5. Never fabricate outputs. If a tool fails, say so and paste the error.
6. Secrets by env var NAME only — never values in chat, commits, or logs.

## (unfilled) — purpose
One paragraph: what this project is and who it serves. No marketing.

## (unfilled) — gate commands
```bash
npm run typecheck   # [PROJECT SLOT] exact typecheck command
npm run lint        # [PROJECT SLOT] exact lint command
npm run build       # [PROJECT SLOT] exact build command
npm test            # [PROJECT SLOT] test command — report pass/fail counts
```

## (unfilled) — stack
- Frontend: [PROJECT SLOT] e.g. React + TypeScript + Tailwind
- Database: [PROJECT SLOT] e.g. Turso db `xyz` via `turso-sql.py` / Supabase
- Hosting: [PROJECT SLOT] e.g. Vercel project `xyz`, productionBranch `[master|main]`
- Mobile: [PROJECT SLOT] none / PWA + Capacitor (`npx cap sync`, `assembleDebug`)

## (unfilled) — deploy flow
[PROJECT SLOT] e.g. push to branch → preview deploy with proof chain →
owner approval → merge to master (auto-deploys). Rollback id recorded first.

## (unfilled) — changelog
[PROJECT SLOT] e.g. "CHANGELOG.md required: one entry per change, newest
first" / "not adopted".

## (unfilled) — repo-specific rules
- [PROJECT SLOT] anything an agent must not guess: paths, ports, fixtures,
  seed data, API shapes, conventions that differ from STANDARDS.md.
