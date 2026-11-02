#!/usr/bin/env bash
# Waits for every GitHub workflow on a commit (default: HEAD) to finish, then prints each result and, for anything
# red, just the failing lines. Exit 0 only when all are green. A Mac check that never got a Mac is retried by
# GitHub itself (mac-retry.yml), so this keeps waiting through that.
#   bash scripts/ci-wait.sh [sha]
set -u
REPO=ColtonCraig/Washi; SHA=${1:-$(git rev-parse HEAD)}
sleep 15                                                    # let the push register its workflows
while :; do
  J=$(gh run list --repo $REPO --commit "$SHA" --json databaseId,name,status,conclusion,attempt)
  busy=$(echo "$J" | jq '[.[] | select(.status != "completed")] | length')
  # a Mac run that failed without running gets retried; give the retry a minute to start
  macnr=$(echo "$J" | jq -r '[.[] | select(.name=="Mac checks" and .conclusion=="failure" and .attempt<3)] | .[0].databaseId // empty')
  if [ -n "$macnr" ] && [ "$(gh api repos/$REPO/actions/runs/$macnr/jobs -q '[.jobs[].steps | length] | add // 0')" = "0" ]; then busy=1; fi
  [ "$busy" = "0" ] && break
  sleep 30
done
echo "$J" | jq -r '.[] | "\(.conclusion)\t\(.name)\t\(.databaseId)"'
bad=$(echo "$J" | jq -r '.[] | select(.conclusion != "success" and .conclusion != "skipped") | .databaseId')
for r in $bad; do echo "---- $r"; gh run view "$r" --repo $REPO --log-failed 2>/dev/null | grep -E "FAIL|store page|Error|error" | cut -c1-400 | head -40; done
[ -z "$bad" ]
