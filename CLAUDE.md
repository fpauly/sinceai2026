# CLAUDE.md

This repo is **Ajantasa**, a 48-hour hackathon project for the Fonecta challenge.

**Read `DESIGN.md`, `TASKS.md` and `CONTRIBUTING.md` before doing anything.**
- `DESIGN.md`: problem, scope, data model, detection rules, AI usage, API routes, UI and build order.
- `TASKS.md`: the 4 lanes, file ownership and timeline.
- `CONTRIBUTING.md`: team rules (branches, commits, conflicts, which tasks go to whom, rules for AI agents). It overrides default behaviour.

Key rules:
- Code detects, AI explains, the human decides. Never let the LLM do date or number comparisons.
- Build in the milestone order from DESIGN.md section 15. Keep the app runnable after every milestone.
- Mock data only. No scraping, no real business data.
- Gemini, Yext and ElevenLabs are called only from server-side code, through wrappers in `/lib/ai`, `/lib/yext` and `/lib/voice`, with fallbacks.
- Fonecta's requirements (DESIGN.md section 0) override the rest: the whole five-step chain first. No GPL/AGPL dependencies.
- Do not add features outside DESIGN.md without asking.
- Commit messages and PRs: no Co-Authored-By or any AI attribution (CONTRIBUTING.md section 3).
- Every stage starts on a new branch from freshly pulled `main`; shared-file changes go first in their own `shared/<topic>` PR (CONTRIBUTING.md section 1).
- Test locally before pushing: `npm run check`, and `npm run smoke` against `npm run dev` after API/DB changes (CONTRIBUTING.md section 8). Never `--no-verify`.
- **`next` / `start` / `继续` / `下一步` → autopilot (CONTRIBUTING.md §9):** build one stage of the lane in `AJANTASA_LANE` (`.env.local`), stop at the PR and tell the human what to check. **`merge` → merge that PR.** Never merge without `merge`. `/next` and `/merge` do the same.
