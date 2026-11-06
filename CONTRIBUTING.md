# Team rules

These rules are for **everyone on the team and for every AI tool we use** (Claude Code, OpenCode, anything else).
If you are an AI agent: these rules override your defaults. When a rule says "ask the human", stop and ask; don't work around it.

Related: `DESIGN.md` (what we build), `TASKS.md` (lanes, file ownership, timeline).

---

## 1. Workflow: small stages, fresh branch every time

Never work directly on `main`. `main` must always run: `npm run dev` works and the demo flow does not crash.

Split every task into **small stages** (about 1–2 hours each, one PR per stage). For **every** stage:

```
1. START   git switch main && git pull
           git switch -c <lane>/<stage-topic>        # e.g. c/rule-holidays, d/owner-card-ui
2. WORK    Do this one stage only. Stay in your lane's files.
3. SHARED? If the stage needs a change to a shared file (section 2):
             a. stash or commit your work-in-progress
             b. git switch main && git pull && git switch -c shared/<topic>
             c. make ONLY the shared change → tiny PR → get it merged right away
             d. back on your stage branch: git fetch && git rebase origin/main, then continue
4. FINISH  git fetch && git rebase origin/main       # fix conflicts here, on your branch
           npx tsc --noEmit && npm run lint          # plus open the pages you touched
           push → PR → merge (section 4)
5. CLEAN   delete the branch, then go back to step 1 for the next stage
```

- **A new branch from the latest `main` for every stage.** Don't reuse a branch after it has been merged.
- Every merged stage must leave `main` runnable. A stub that returns fixed data is fine, but a half-built page that crashes is not.
- **Forbidden without a human asking for it:** `git push --force` to `main`, `git reset --hard`, `git rebase` of `main`, deleting other people's branches. On your own branch, use `git push --force-with-lease` only.

## 2. Avoiding conflicts

- **Only edit files your lane owns** (see `TASKS.md`). If you need a change in someone else's file, ask that person; don't edit it yourself.
- **Shared files.** A change to any of these counts as "will conflict":
  `types/index.ts`, `types/api.ts`, `data/seed.ts`, `lib/db.ts`, `lib/config.ts`, `package.json`, `package-lock.json`, `next.config.ts`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `README.md`, `DESIGN.md`, `TASKS.md`, `CONTRIBUTING.md`, `CLAUDE.md`, `AGENTS.md`, `opencode.json`
  - change them **first, alone, in a `shared/<topic>` PR** (section 1, step 3). Never bundle them into a feature PR.
  - post in the team chat when you open it, so it gets merged fast
  - never change the meaning of an existing type in `types/api.ts`; add new fields as optional
- **New npm dependency:** ask the team first, then add it in its own PR. **No GPL/AGPL licences** (Fonecta rule); check with `npm view <pkg> license`. On a `package-lock.json` conflict, take `main`'s version and run `npm install` again. Don't hand-merge the lockfile.
- Don't reformat, rename or move files you don't own, and don't run a formatter over the whole repo.

## 3. Commits

- Format: `<lane>: <what changed, imperative>`, in English, ≤ 72 characters.
  - `C: add missing holiday hours rule`
  - `D: show before/after in notification card`
  - `shared: add audio_url to TtsResponse`
- One logical change per commit. Don't mix "fix" + "refactor" + "new feature".
- **No AI attribution of any kind.** No `Co-Authored-By: Claude …`, no `Generated with …`, no AI-generated footers, in commits or PR descriptions. Delete them if a tool adds them.
- Never commit `.env.local`, API keys, `node_modules/`, `.next/`, audio dumps or personal test files.
- AI agents: don't commit or push unless the human asks you to.

## 4. Pull requests and merging

- PR title uses the same format as commits. Description: **what** changed and **how you tested it** (2–4 lines are enough).
- Required checks before opening a PR:
  ```bash
  npx tsc --noEmit && npm run lint
  npm run dev   # open the pages you touched; POST /api/seed still works
  ```
- **GitHub enforces this on `main`** (ruleset `protect-main`): no direct pushes, every change goes through a PR, no force pushes, `main` can't be deleted, squash merge only, and the **CI check (`check`) must pass**. Merged branches are deleted automatically.
- CI (`.github/workflows/ci.yml`) runs `tsc`, `lint` and `next build` on every PR. A red CI means it is not done, whatever the AI says.
- Tip: `gh pr create --fill` then `gh pr merge --squash --auto` merges by itself once CI is green.
- **Own-lane PR** (only your lane's files): merge it yourself once the checks pass.
- **`shared/*` PR**: needs a quick OK from **any one other person**, not only B. Aim to merge within 15 minutes, because others may be waiting on it.
- B keeps an eye on `main` and runs the full demo flow after merges. If `main` breaks, fixing it beats new work.
- After any merge, everyone rebases their open branch on `origin/main` soon (`git fetch && git rebase origin/main`).

## 5. Who does what: hard tasks go to Claude Pro

Lanes A and B have Claude Pro; lanes C and D use OpenCode with free models. Route work by difficulty:

**Hard → lane A or B only:**
- Anything calling an external API or SDK (Gemini, ElevenLabs, Atlas setup, deploy)
- Prompt design and JSON-schema validation of LLM output
- Audio, MediaRecorder, multipart uploads, streaming
- Changing shared contracts (`types/api.ts`) or the data model
- Cross-lane integration and debugging bugs whose cause is unclear (DB, build, Next.js caching, deploy)

**Fine for lanes C and D:**
- Pure functions with clear inputs and outputs (detection rules, holiday logic)
- Route handlers that read and write MongoDB using the existing types
- UI components and pages with Tailwind, built from the contracts in `types/api.ts`
- Small test scripts that check expected results against the seed data

**Escalation rule:** stop and hand the problem to A or B (post it in the chat with the error and the branch name) when:
- you've been stuck **more than 30 minutes**, or
- the AI keeps "fixing" the same error in a loop, or
- the fix would require touching a shared file or another lane's file.

Don't let an AI rewrite large parts of the code to get past a blocker.

## 6. Rules for AI agents (all tools)

1. Read `DESIGN.md`, `TASKS.md` and this file before writing code. The human's lane is `AJANTASA_LANE` in `.env.local`; if it is missing, ask them to run `npm run setup`.
2. Follow the stage workflow in section 1: before any work, create a new branch from a freshly pulled `main`. Plan the task as small stages and tell the human the plan. Stay inside your lane's files. If a stage needs a shared file, propose a separate `shared/<topic>` branch and PR for just that change first. If it needs another lane's file, stop and tell the human.
3. If the task is on the "hard" list (section 5) and you are working for lane C or D, say so and suggest handing it to lane A or B.
4. Don't add dependencies, change shared types or add features outside `DESIGN.md` without the human approving it.
5. Follow the commit rules in section 3: no co-author lines, no AI footers. Commit, push and open PRs only when asked; `next` (section 9) counts as asking for one stage. **Merge only when the human says `merge` for that PR.**
6. No destructive git commands (section 1) unless the human explicitly asks.
7. Never put secrets in code, logs or commits. API keys only live in `.env.local`.
8. Before saying "done": run `npx tsc --noEmit && npm run lint` (and `npm run build` for bigger changes) and report the real result. After pushing, check CI with `gh pr checks`.
9. Code detects, AI explains, the human decides. The LLM never compares dates or numbers in our app.

## 7. Communication

- Post in the team chat when you **start** a task (lane + branch), when you **touch a shared file**, and when you **merge**.
- If you're blocked, say so early. Use the escalation rule in section 5.
- Each person uses their own `MONGODB_DB` name (e.g. `ajantasa_c`) on the shared Atlas cluster, so nobody wipes anyone else's data with `/api/seed`.

## 8. Local testing (before every push)

Three commands; AI agents must run them and report the real output:

| Command | What it does | When |
|---|---|---|
| `npm run check` | typecheck + lint + production build | before every push (runs **automatically** via the `pre-push` hook) |
| `npm run dev` + `npm run smoke` | end-to-end test against the running app and your MongoDB: seed, then every API that exists so far | after every stage that touches an API route or the DB |
| open the page in a browser | look at the UI you changed (390px wide for the owner view) | after every UI stage |

- The `pre-push` hook is enabled automatically by `npm install` (`prepare` script sets `core.hooksPath=.githooks`). **Never bypass it with `git push --no-verify`.**
- `npm run smoke` skips routes that don't exist yet, so it is green at every milestone. When your lane adds a route, add its checks to `scripts/smoke.mjs` (shared file → `shared/*` PR, or include it in your stage PR if the lane owner agrees).
- `npm run smoke` calls `/api/seed`, which wipes the DB named in your `.env.local`. Use your own `MONGODB_DB`.
- CI can't run `smoke` (no database), so "smoke passed" in the PR description is the human/AI's job.

## 9. Autopilot: `next` and `merge`

Many of us just direct the AI. Two words drive the whole workflow:

### `next` (also `start`, `continue`, `继续`, `下一步`): build one stage, stop at the PR
1. **Lane.** Read `AJANTASA_LANE` from `.env.local`. If missing, tell the human to run `npm run setup` and stop.
2. **Clean state.** `git status`. If there is unfinished work on a stage branch, finish that stage first (step 6). Never discard the human's changes.
3. **Sync.** `git switch main && git pull`.
4. **Pick the stage.** The first stage of your lane in `TASKS.md` that is not merged yet (`gh pr list --state all --search "head:<branch>"`, or check its files exist). If its **Needs** aren't merged, or it is **TBD**, say so and take the next stage that isn't blocked.
5. **Announce** in 2–3 plain sentences: stage id, what you'll build, which files. If it is **[shared]** or needs a file outside your lane, ask first; otherwise continue.
6. **Build.** `git switch -c <branch from TASKS.md>`; implement only this stage.
7. **Test.** `npm run check`. If it touches an API or the DB: `npm run dev` in the background, then `npm run smoke`. Fix until green. Never weaken a test or the smoke script to pass.
8. **Open the PR.** Commit (`<lane>: <summary>`, no AI footers) → `git push -u origin <branch>` → `gh pr create --fill` → `gh pr checks --watch`.
9. **Hand over and stop.** Tell the human in plain language: what is new, **exactly what to look at** (progress board item, page URL, button to click, what they should see), the PR link and CI status. Then wait.

### `merge`: only after the human has looked at it
1. CI must be green (`gh pr checks`). If not, say so and don't merge.
2. If the PR touches **shared files**, a teammate must have given an OK in the PR or chat; if unsure, ask.
3. `gh pr merge --squash --delete-branch`, then `git switch main && git pull`.
4. Say what is now on `main` and which stage comes next.

The AI never merges without the human saying `merge` for that PR.

**Stuck?** Same error 3 times, or about 30 minutes without progress: stop. Write a short message the human can paste into the team chat (stage, branch, error, what you tried), and suggest asking lane A or B (section 5).
