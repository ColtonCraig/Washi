# Reads the clipboard as a PNG (what a paste would get) and writes it to a file: python3 clip.py out.png
# Prints the image size, or "none". Used by test/snapshot.js (there's no xclip on the test machine).
import sys, time
from Xlib import X, display, Xatom
d = display.Display(); w = d.screen().root.create_window(0, 0, 1, 1, 0, X.CopyFromParent)
CLIP, PNG, PROP, INCR = d.intern_atom('CLIPBOARD'), d.intern_atom('image/png'), d.intern_atom('WASHI_CLIP'), d.intern_atom('INCR')
w.convert_selection(CLIP, PNG, PROP, X.CurrentTime); d.flush()
data = b''; end = time.time() + 3
while time.time() < end:
    if d.pending_events():
        e = d.next_event()
        if e.type == X.SelectionNotify:
            if e.property == X.NONE: print('none'); sys.exit(0)
            p = w.get_full_property(PROP, X.AnyPropertyType)
            if p and p.property_type == INCR:      # big: comes in pieces
                w.change_attributes(event_mask=X.PropertyChangeMask); w.delete_property(PROP); d.flush()
                while True:
                    e2 = d.next_event()
                    if e2.type == X.PropertyNotify and e2.state == X.PropertyNewValue:
                        q = w.get_full_property(PROP, X.AnyPropertyType); w.delete_property(PROP); d.flush()
                        if not q or not q.value: break
                        data += bytes(q.value)
            elif p: data = bytes(p.value)
            break
    else: time.sleep(0.02)
if not data: print('none'); sys.exit(0)
open(sys.argv[1], 'wb').write(data)
from PIL import Image
im = Image.open(sys.argv[1]); print('%dx%d' % im.size)
