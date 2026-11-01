import sys, time
from Xlib import X, display
from Xlib.ext import xtest
d = display.Display()
def move(x, y): xtest.fake_input(d, X.MotionNotify, x=int(x), y=int(y)); d.sync()
def down(): xtest.fake_input(d, X.ButtonPress, 1); d.sync()
def up(): xtest.fake_input(d, X.ButtonRelease, 1); d.sync()
cmd = sys.argv[1]
if cmd == 'move': move(sys.argv[2], sys.argv[3])
elif cmd == 'down': down()
elif cmd == 'up': up()
elif cmd == 'drag':   # drag x0 y0 x1 y1 [hold_seconds_at_end]
    x0, y0, x1, y1 = map(float, sys.argv[2:6]); hold = float(sys.argv[6]) if len(sys.argv) > 6 else 0
    move(x0, y0); time.sleep(.2); down(); time.sleep(.15)
    n = 30
    for i in range(1, n + 1):
        move(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n); time.sleep(.02)
    time.sleep(hold)
