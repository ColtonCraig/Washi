#import "StdPatch/StdPatch.h"
#import "Patches/WashiShared/WashiShared.h"

// New Tab at the Top: Dia's "+ New Tab" row moves from under your tabs to the top of them, under the space's name,
// like Washi's. It's Washi's own row in Dia's style (it opens a tab just as ⌘T does); Dia's at the bottom hides.
// The room comes from the tab list's top (WashiHand.m keeps every strip).

extern DPPatch DPWashiNewTabTop;
#define DPNewTabCell "_TtC7TabList14NewTabCellView"
static char DPRowKey;
static const CGFloat DPRowHeight = 37;

// Dia's own New Tab command, from its menus (the item ⌘T runs).
static BOOL DPOpenNewTab(NSMenu *menu) {
    for (NSInteger i = 0; i < menu.numberOfItems; i++) {
        NSMenuItem *item = [menu itemAtIndex:i];
        if ([item.keyEquivalent isEqual:@"t"] && (item.keyEquivalentModifierMask & NSEventModifierFlagDeviceIndependentFlagsMask) == NSEventModifierFlagCommand && item.isEnabled) {
            [menu performActionForItemAtIndex:i];
            return YES;
        }
        if (item.submenu && DPOpenNewTab(item.submenu)) return YES;
    }
    return NO;
}

@interface DPWashiNewTabRow : NSView
@end
@implementation DPWashiNewTabRow {
    NSImageView *_plus;
    NSTextField *_title;
    BOOL _hover, _down;
}
- (instancetype)initWithFrame:(NSRect)frame {
    if ((self = [super initWithFrame:frame])) {
        self.wantsLayer = YES;
        _plus = [NSImageView imageViewWithImage:[[NSImage imageWithSystemSymbolName:@"plus" accessibilityDescription:nil] imageWithSymbolConfiguration:[NSImageSymbolConfiguration configurationWithPointSize:12 weight:NSFontWeightMedium]]];
        _plus.contentTintColor = NSColor.secondaryLabelColor;
        _title = [NSTextField labelWithString:@"New Tab"];
        _title.font = [NSFont systemFontOfSize:13 weight:NSFontWeightMedium]; _title.textColor = NSColor.secondaryLabelColor;
        [self addSubview:_plus]; [self addSubview:_title];
        self.toolTip = @"New Tab (⌘T)";
        [self setAccessibilityElement:YES]; [self setAccessibilityRole:NSAccessibilityButtonRole]; [self setAccessibilityLabel:@"New Tab"];
    }
    return self;
}
- (BOOL)isFlipped { return YES; }
- (BOOL)accessibilityPerformPress { [self open]; return YES; }
- (void)updateTrackingAreas {
    [super updateTrackingAreas];
    if (!self.trackingAreas.count)
        [self addTrackingArea:[[NSTrackingArea alloc] initWithRect:NSZeroRect options:NSTrackingMouseEnteredAndExited | NSTrackingActiveInActiveApp | NSTrackingInVisibleRect owner:self userInfo:nil]];
}
- (void)mouseEntered:(NSEvent *)e { _hover = YES; [self paint]; }
- (void)mouseExited:(NSEvent *)e { _hover = NO; [self paint]; }
- (void)mouseDown:(NSEvent *)e { _down = YES; [self paint]; }
- (void)mouseUp:(NSEvent *)e {
    _down = NO; [self paint];
    if (NSPointInRect([self convertPoint:e.locationInWindow fromView:nil], self.bounds)) [self open];
}
- (void)open {
    [self.window makeKeyAndOrderFront:nil];
    if (!DPOpenNewTab(NSApp.mainMenu)) NSBeep();
}
// Dia's look: its pill shows on hover, pressing squeezes it a little (Washi's), and the text darkens.
- (void)paint {
    NSColor *ink = NSColor.labelColor;
    [CATransaction begin]; [CATransaction setDisableActions:DPWashiCalm()];
    self.layer.backgroundColor = (_hover ? [ink colorWithAlphaComponent:_down ? .1 : .06] : NSColor.clearColor).CGColor;
    CGFloat cx = NSMidX(self.bounds), cy = NSMidY(self.bounds), k = _down ? .97 : 1;
    self.layer.sublayerTransform = CATransform3DTranslate(CATransform3DScale(CATransform3DMakeTranslation(cx, cy, 0), k, k, 1), -cx, -cy, 0);
    [CATransaction commit];
    _title.textColor = _plus.contentTintColor = _hover ? NSColor.labelColor : NSColor.secondaryLabelColor;
}
- (void)layout {
    [super layout];
    self.layer.cornerRadius = 10;
    CGFloat h = NSHeight(self.bounds);
    _plus.frame = NSMakeRect(9, (h - 16) / 2, 16, 16);
    _title.frame = NSMakeRect(30, (h - 16) / 2, NSWidth(self.bounds) - 38, 16);
}
@end

CGFloat DPWashiNewTabRowRoom(NSView *list) { return DPWashiLive(&DPWashiNewTabTop) ? DPRowHeight + 2 : 0; }

void DPWashiNewTabRowIn(NSView *list, NSRect room) {
    DPWashiNewTabRow *row = DPGet(list, &DPRowKey);
    if (NSIsEmptyRect(room)) { [row removeFromSuperview]; DPSet(list, &DPRowKey, nil); return; }
    if (!row) { row = [[DPWashiNewTabRow alloc] initWithFrame:NSZeroRect]; DPSet(list, &DPRowKey, row); }
    if (row.superview != list) [list addSubview:row];
    NSRect frame = NSMakeRect(NSMinX(room) + 6, NSMinY(room) + 1, NSWidth(room) - 12, DPRowHeight - 3);   // Dia's tab pill: 6pt in, 34 tall
    if (!NSEqualRects(row.frame, frame)) row.frame = frame;
}

// Dia's own row at the bottom hides while ours is at the top.
static void DPNewTabCell_layout(NSView *self, SEL _cmd) {
    DPCallOriginal(DPNewTabCell_layout, self);
    BOOL hide = DPWashiLive(&DPWashiNewTabTop);
    if (self.alphaValue != (hide ? 0 : 1)) self.alphaValue = hide ? 0 : 1;
}
static NSView *DPNewTabCell_hitTest(NSView *self, SEL _cmd, NSPoint point) {
    if (DPWashiLive(&DPWashiNewTabTop)) return nil;
    return DPCallOriginal(DPNewTabCell_hitTest, self, point);
}

static void DPInstallWashiNewTabTop(void) {
    DPHook(DPNewTabCell, @selector(layout), (IMP)DPNewTabCell_layout);
    DPHook(DPNewTabCell, @selector(hitTest:), (IMP)DPNewTabCell_hitTest);
}

static void DPApplyWashiNewTabTop(DPPatch *patch) {
    for (NSView *cell in DPFindViews(DPNewTabCell)) { cell.alphaValue = DPWashiLive(patch) ? 0 : 1; }
    for (NSView *list in DPFindViews(DPDiaTabList)) list.needsLayout = YES;
}

static NSString *DPVerifyWashiNewTabTop(DPPatch *patch) {
    for (NSView *list in DPFindViews(DPDiaTabList)) {
        if (list.hiddenOrHasHiddenAncestor) continue;
        BOOL has = [DPGet(list, &DPRowKey) superview] == list;
        if (has != DPWashiLive(patch)) return DPWashiLive(patch) ? @"no New Tab row at the top" : @"New Tab row left at the top";
    }
    return nil;
}

DP_PATCH(DPWashiNewTabTop) {
    .key = @"washiNewTabTop",
    .order = 9,
    .title = @"New Tab at the Top",
    .detail = @"The + New Tab row at the top of your tabs, under the space’s name, instead of after them.",
    .symbol = @"plus.rectangle.on.rectangle",
    .tint = @"systemGreenColor",
    .section = @"Sidebar",
    .requires = @"washiPaper",
    .classes = DPClasses(DPDiaTabList, DPNewTabCell),
    .install = DPInstallWashiNewTabTop,
    .apply = DPApplyWashiNewTabTop,
    .verify = DPVerifyWashiNewTabTop,
};
