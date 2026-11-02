# Working on Washi — Colton's rules

Read this before any change. These are standing instructions from Colton, not suggestions.

## Quality bar
- Nothing is "done" until it works 100%: no bugs, no clipping, no half-baked features. If something can't be finished, say so plainly instead of shipping it.
- Every feature follows the paper theme: minimal but fun, purposeful animations, fast.
- Test like a person uses it: real clicks, drags, keyboard (see `test/`, `test/ptr.py`), at several window sizes, light and dark. Every new screen gets a clipping audit (`AUDIT` in `test/lib.js`) and a screenshot you actually look at.
- Check Mac-specific behaviour against the current macOS (26 Tahoe) on GitHub's Mac runners (`.github/workflows/macchecks.yml`), not from memory.

## Before saying anything is done or shipping — the checklist
1. `bash test/run.sh` locally: **every** test file, 0 failures. Add new test files to the list in `test/run.sh`.
2. Push to `main`, then check **every** GitHub workflow for that commit and wait for it to finish:
   `gh run list --repo ColtonCraig/Washi --commit $(git rev-parse HEAD)`
   - Test (Linux), Mac checks, Signing check, Installer window check, iPhone — whichever ran. **All must be green.**
   - A red workflow is a bug to fix now, even if it "only" fails on CI or looks unrelated. Never ignore it.
3. Only then release: push `main` to `release`, wait for the Release workflow, verify `latest.json` (version + signature).
4. After releasing, check the workflows triggered by that push are green too.
5. Tell Colton what shipped, plainly, including anything that isn't covered yet.

## Tests must not depend on the internet
Use the local test server (`test/server.js`, port 8765). Search suggestions in tests come from `WASHI_TEST_SUGGEST` (set in `test/lib.js`). Anything that waits on the network polls with a timeout instead of a fixed sleep.

## Release mechanics
- Version in `package.json`; notes in `BACKLOG.md` ("Done and tested (x.y)").
- Releases come from the `release` branch only. Keys live in GitHub secrets; never paste keys or tokens in chat or commit them.
- Commits: author Colton Craig <craigcolton123@gmail.com>.

## When Colton says "Stop"
Stop immediately: no more changes or pushes until he says go. Then report exactly where things stand.
