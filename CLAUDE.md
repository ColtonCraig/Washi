# Working on Washi — Colton's rules

Read this before any change. These are standing instructions from Colton, not suggestions.

## Quality bar
- Nothing is "done" until it works 100%: no bugs, no clipping, no half-baked features. If something can't be finished, say so plainly instead of shipping it.
- Every feature follows the paper theme: minimal but fun, purposeful animations, fast.
- Test like a person uses it: real clicks, drags, keyboard (see `test/`, `test/ptr.py`), at several window sizes, light and dark. Every new screen gets a clipping audit (`AUDIT` in `test/lib.js`) and a screenshot you actually look at.
- Check Mac-specific behaviour against the current macOS (26 Tahoe) on GitHub's Mac runners (`.github/workflows/macchecks.yml`), not from memory.

## Before saying anything is done or shipping — the checklist
Speed matters too (Colton, Nov 2: "it can't take this long"). Batch work: one push per batch of changes, one release per batch, not one per fix.
1. Locally, run the test files that cover what you changed (`bash test/run.sh split extensions …`), 0 failures. Add new test files to `ALL` in `test/run.sh`. GitHub runs every file on each push (4 groups side by side, ~5 min), so a full local run (~30 min) is only needed when GitHub can't run something.
2. Push to `main`, then `bash scripts/ci-wait.sh` (run it in the background): it waits for **every** workflow on the commit and prints only the failing lines.
   - Test (Linux), Mac checks, Signing check, Installer window check, iPhone — whichever ran. **All must be green.**
   - A red workflow is a bug to fix now, even if it "only" fails on CI or looks unrelated. Never ignore it. Failure screenshots are uploaded as run artifacts (`gh run download <id>`).
   - A Mac run that never got a Mac (0 steps ran: GitHub capacity) isn't a test failure; `mac-retry.yml` re-runs it automatically.
3. Only then release: push `main` to `release`, wait for the Release workflow, verify `latest.json` (version + signature).
4. After releasing, check the workflows triggered by that push are green too.
5. Tell Colton what shipped, plainly, including anything that isn't covered yet.

## Tests must not depend on the internet
Use the local test server (`test/server.js`, port 8765). `test/run.sh` stops any old test server first (a stale one serves the wrong update files). Search suggestions in tests come from `WASHI_TEST_SUGGEST` (set in `test/lib.js`). Anything that waits on the network polls with a timeout instead of a fixed sleep.

## Release mechanics
- Version in `package.json`; notes in `BACKLOG.md` ("Done and tested (x.y)").
- Releases come from the `release` branch only. Keys live in GitHub secrets; never paste keys or tokens in chat or commit them.
- Commits: author Colton Craig <craigcolton123@gmail.com>.

## When Colton says "Stop"
Stop immediately: no more changes or pushes until he says go. Then report exactly where things stand.
