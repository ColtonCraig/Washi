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
node test/server.js >/tmp/washi-test-server.log 2>&1 & SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
sleep 1
RUN="node"; command -v xvfb-run >/dev/null && RUN="xvfb-run -a -s '-screen 0 ${SCREEN:-1440x900}x24' node"
fail=0
for t in ${@:-split layout folders audit preview features security onboarding arc switcher scrap boost live windows bookmarks bar passwords today polish extensions ua speed perf perf-heavy update}; do
  echo "== $t"
  eval $RUN test/$t.js 2>&1 | grep -v "agent-proxy\|redirector\|Allowed domains\|For details" | grep "nav\|comparison\|  [A-Z][a-z].*: \|PASS\|FAIL\|passed\|Error\|threw" || true
  [ "${PIPESTATUS[0]}" = "0" ] || fail=1
done
exit $fail
