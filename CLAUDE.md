# Working on Washi — Colton's rules

Read this before any change. These are standing instructions from Colton, not suggestions.

## Quality bar
- Nothing is "done" until it works 100%: no bugs, no clipping, no half-baked features. If something can't be finished, say so plainly instead of shipping it.
- Every feature follows the paper theme: minimal but fun, purposeful animations, fast.
- Test like a person uses it: real clicks, drags, keyboard (see `test/`, `test/ptr.py`), at several window sizes, light and dark. Every new screen gets a clipping audit (`AUDIT` in `test/lib.js`) and a screenshot you actually look at.
- Check Mac-specific behaviour against the current macOS (26 Tahoe) on GitHub's Mac runners (`.github/workflows/macchecks.yml`), not from memory.

## Before saying anything is done or shipping — the checklist
Speed matters as much as testing (Colton, Nov 2: "I would rather just push out a bunch of times to fix stuff than wait literally 2 hours"). Real testing stays; waiting goes.
1. Locally, run only the test files that cover what you changed (`bash test/run.sh split extensions …`), 0 failures. New features still get real-pointer tests, a clipping audit and a screenshot you look at. Add new test files to `ALL` in `test/run.sh`. Never run the full ~30 min suite locally; GitHub does that.
2. Push to `main` freely. Start `bash scripts/ci-wait.sh` in the background and **keep working**; don't sit and wait. Anything red gets fixed in the next push.
3. Release a finished batch (not every fix) as soon as **Test (Linux)** is green on that commit: push `main` to `release`, wait for the Release workflow, verify `latest.json` (version + signature).
   - Mac checks are a heads-up, not a blocker, unless the batch changed Mac-specific code (the files listed in `macchecks.yml`). Never wait on GitHub's Mac queue; `mac-retry.yml` re-runs a Mac job that never got a machine.
   - A failure that only happens on GitHub gets two tries. Then tell Colton plainly, mark it in the test (a NOTE saying where it's covered instead), and keep shipping.
   - Failure screenshots are uploaded as run artifacts (`gh run download <id>`).
4. Tell Colton what shipped, plainly, including anything that isn't covered yet.

## Tests must not depend on the internet
Use the local test server (`test/server.js`, port 8765). `test/run.sh` stops any old test server first (a stale one serves the wrong update files). Search suggestions in tests come from `WASHI_TEST_SUGGEST` (set in `test/lib.js`). Anything that waits on the network polls with a timeout instead of a fixed sleep.

## Release mechanics
- Version in `package.json`; notes in `BACKLOG.md` ("Done and tested (x.y)").
- Releases come from the `release` branch only. Keys live in GitHub secrets; never paste keys or tokens in chat or commit them.
- Commits: author Colton Craig <craigcolton123@gmail.com>.

## When Colton says "Stop"
Stop immediately: no more changes or pushes until he says go. Then report exactly where things stand.
