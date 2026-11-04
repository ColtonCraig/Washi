#!/usr/bin/env bash
# Runs every Washi test. On Linux it needs xvfb (a virtual screen); on a Mac run each file with node directly.
set -u
cd "$(dirname "$0")/.."
# test hostnames that point back at this machine (for https-first and phishing tests)
if [ -w /etc/hosts ]; then
  for h in washi-http.example $(head -1 test/fixtures/phish-sample.txt); do grep -q " $h\$" /etc/hosts || echo "127.0.0.1 $h" >> /etc/hosts; done
fi
export UPD_DIR=$(mktemp -d)
[ -n "${WASHI_TEST_RELEASE_KEY:-}" ] || { export WASHI_TEST_RELEASE_KEY=$(mktemp); cp "$(dirname "$PWD")/washi-release-key.pem" "$WASHI_TEST_RELEASE_KEY" 2>/dev/null || true; }
pkill -f '^node test/server.js' 2>/dev/null; sleep 0.3          # an old test server would serve the wrong files
node test/server.js >/tmp/washi-test-server.log 2>&1 & SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 100); do curl -s -o /dev/null http://localhost:8765/p1.html && break; sleep 0.2; done   # wait until it answers (a cold machine is slow)
RUN="node"; command -v xvfb-run >/dev/null && RUN="xvfb-run -a -s '-screen 0 ${SCREEN:-1440x900}x24' node"
fail=0
ALL="spacing hardening sleep ext-filters ext-org ext-keys toolbar updatecard settings shortcuts scenarios memory youtube menu-keys focus swipe nowplaying whatsnew autoicons reopen routes snapshot rename tabpeek notes passwords bookmarks bmhover permissions reader tidy today downloads scrapbook features split polish preview audit live windows arc bar extensions scrap boost onboarding folders layout switcher security ua speed perf perf-heavy update"
LIST="${@:-$ALL}"
# SHARD=2/4 runs a quarter of the files (GitHub runs the four quarters side by side)
if [ -n "${SHARD:-}" ]; then i=${SHARD%/*}; n=${SHARD#*/}; k=0; L=""; for t in $LIST; do [ $((k % n + 1)) = "$i" ] && L="$L $t"; k=$((k+1)); done; LIST=$L; fi
for t in $LIST; do
  echo "== $t"
  eval $RUN test/$t.js 2>&1 | grep -v "agent-proxy\|redirector\|Allowed domains\|For details" | grep "nav\|comparison\|  [A-Z][a-z].*: \|PASS\|FAIL\|passed\|Error\|threw" || true
  [ "${PIPESTATUS[0]}" = "0" ] || fail=1
done
exit $fail
