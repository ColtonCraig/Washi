# The installer window: Washi's paper background, the app on the left, Applications on the right.
# Used by the release build:  dmgbuild -s build/dmg-settings.py -D app=<path to Washi.app> Washi <out.dmg>
import os.path
app = defines['app']
files = [app]
symlinks = {'Applications': '/Applications'}
format = 'UDZO'
filesystem = 'HFS+'
icon = 'build/icon.icns'                       # the disk's own icon in Finder
background = 'build/dmg-background.tiff'       # 1x + 2x in one file (made by the release build)
window_rect = ((200, 140), (680, 440))
default_view = 'icon-view'
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
show_icon_preview = False
include_icon_view_settings = True
arrange_by = None
label_pos = 'bottom'
text_size = 13
icon_size = 128
icon_locations = {os.path.basename(app): (180, 224), 'Applications': (500, 224)}
