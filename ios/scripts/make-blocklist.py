#!/usr/bin/env python3
"""Builds Washi for iPhone's ad and tracker blocklist (WebKit content rules) from EasyList's ad-server and
EasyPrivacy's tracking-server lists. Only whole-domain rules (||example.com^) are used: they're the bulk of what
blocking does, and WebKit compiles them quickly. Pages you open yourself are never blocked, only what they load.
Run:  python3 ios/scripts/make-blocklist.py   (writes ios/Washi/Resources/blocklist.json)"""
import json, re, sys, urllib.request, os
BASE = 'https://raw.githubusercontent.com/easylist/easylist/master/'
FILES = ['easylist/easylist_adservers.txt', 'easylist/easylist_adservers_popup.txt',
         'easyprivacy/easyprivacy_trackingservers.txt', 'easyprivacy/easyprivacy_trackingservers_thirdparty.txt']
rx = re.compile(r'^\|\|([a-z0-9.-]+\.[a-z]{2,})\^(\$(.*))?$')
seen, rules = set(), []
for f in FILES:
    text = urllib.request.urlopen(BASE + f, timeout=60).read().decode('utf-8', 'replace')
    for line in text.splitlines():
        m = rx.match(line.strip())
        if not m: continue
        dom, opts = m.group(1), (m.group(3) or '')
        if any(o for o in opts.split(',') if o and o not in ('third-party', '3p', 'popup', 'script', 'image')): continue   # rules limited to some sites: skip
        if dom in seen: continue
        seen.add(dom)
        trig = {'url-filter': '^[^:]+://+([^:/]+\\.)?' + re.escape(dom).replace('\\-', '-') + '[:/]'}
        if 'third-party' in opts or '3p' in opts: trig['load-type'] = ['third-party']
        rules.append({'trigger': trig, 'action': {'type': 'block'}})
rules.append({'trigger': {'url-filter': '.*', 'resource-type': ['document']}, 'action': {'type': 'ignore-previous-rules'}})   # a page you open yourself always loads
if len(rules) < 5000: sys.exit('too few rules, refusing to write: %d' % len(rules))
out = os.path.join(os.path.dirname(__file__), '..', 'Washi', 'Resources', 'blocklist.json')
with open(out, 'w') as fh: json.dump(rules, fh, separators=(',', ':'))
print('wrote', len(rules), 'rules,', os.path.getsize(out) // 1024, 'KB')
