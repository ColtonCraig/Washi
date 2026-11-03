import sys, time
from Xlib import X, display
from Xlib.ext import xtest
d = display.Display()
def move(x, y): xtest.fake_input(d, X.MotionNotify, x=int(float(x)), y=int(float(y))); d.sync()
def down(): xtest.fake_input(d, X.ButtonPress, 1); d.sync()
def up(): xtest.fake_input(d, X.ButtonRelease, 1); d.sync()
cmd = sys.argv[1]
if cmd == 'move': move(sys.argv[2], sys.argv[3])
elif cmd == 'down': down()
elif cmd == 'rdown': xtest.fake_input(d, X.ButtonPress, 3); d.sync()
elif cmd == 'rup': xtest.fake_input(d, X.ButtonRelease, 3); d.sync()
elif cmd == 'resize':   # resize W H: the browser window's outer size (no window manager on the test screen)
    w, h = int(sys.argv[2]), int(sys.argv[3])
    def walk(win):
        for c in win.query_tree().children:
            try:
                k = c.get_wm_class() or ()
                if any('washi' in str(x).lower() for x in k) and c.get_geometry().width > 400: return c
            except Exception: pass
            r = walk(c)
            if r: return r
    win = walk(d.screen().root)
    if not win: sys.exit('no Washi window')
    win.configure(width=w, height=h); d.sync()
elif cmd == 'up': up()
elif cmd == 'vscroll':   # vscroll N: N scroll-wheel steps down (negative = up)
    n = int(sys.argv[2]); b = 5 if n > 0 else 4
    for _ in range(abs(n)):
        xtest.fake_input(d, X.ButtonPress, b); d.sync(); xtest.fake_input(d, X.ButtonRelease, b); d.sync(); time.sleep(0.012)
elif cmd == 'hscroll':   # hscroll N [delay]: N sideways scroll steps, like a two-finger trackpad swipe (negative = to the left)
    n = int(sys.argv[2]); dl = float(sys.argv[3]) if len(sys.argv) > 3 else 0.012
    b = 7 if n > 0 else 6
    for _ in range(abs(n)):
        xtest.fake_input(d, X.ButtonPress, b); d.sync(); xtest.fake_input(d, X.ButtonRelease, b); d.sync(); time.sleep(dl)
elif cmd == 'drag':   # drag x0 y0 x1 y1 [hold_seconds_at_end]
    x0, y0, x1, y1 = map(float, sys.argv[2:6]); hold = float(sys.argv[6]) if len(sys.argv) > 6 else 0
    move(x0, y0); time.sleep(.2); down(); time.sleep(.15)
    n = 30
    for i in range(1, n + 1):
        move(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n); time.sleep(.02)
    time.sleep(hold)
elif cmd == 'keys':   # keys "down:Control_L tap:Tab up:Control_L sleep:0.3 ..."  real keyboard events, like a person typing
    from Xlib import XK
    for step in sys.argv[2].split():
        op, _, arg = step.partition(':')
        if op == 'sleep': time.sleep(float(arg)); continue
        kc = d.keysym_to_keycode(XK.string_to_keysym(arg))
        if op in ('down', 'tap'): xtest.fake_input(d, X.KeyPress, kc); d.sync()
        if op == 'tap': time.sleep(.03)
        if op in ('up', 'tap'): xtest.fake_input(d, X.KeyRelease, kc); d.sync()
        time.sleep(.04)
