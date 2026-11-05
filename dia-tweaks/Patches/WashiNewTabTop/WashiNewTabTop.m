#import "StdPatch/StdPatch.h"
#import "Patches/WashiShared/WashiShared.h"
NSArray<NSView *> *DPWashiArtNewTabTop(void);   // WashiLook.m
NSFont *DPWashiUIFont(CGFloat size, NSFontWeight weight);   // WashiType.m

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
    CAShapeLayer *_outline;
}
- (instancetype)initWithFrame:(NSRect)frame {
    if ((self = [super initWithFrame:frame])) {
        self.wantsLayer = YES;
        _plus = [NSImageView imageViewWithImage:[[NSImage imageWithSystemSymbolName:@"plus" accessibilityDescription:nil] imageWithSymbolConfiguration:[NSImageSymbolConfiguration configurationWithPointSize:12 weight:NSFontWeightMedium]]];
        _plus.contentTintColor = NSColor.secondaryLabelColor;
        _title = [NSTextField labelWithString:@"New Tab"];
        _title.font = DPWashiUIFont(13, NSFontWeightMedium); _title.textColor = NSColor.secondaryLabelColor;
        [self addSubview:_plus]; [self addSubview:_title];
        _outline = [CAShapeLayer layer];
        _outline.fillColor = nil; _outline.lineWidth = 1.5; _outline.lineDashPattern = @[ @4, @3 ];
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
// A button: a dashed paper outline at rest, like Washi's "add" spots; on hover it's a card of paper with the small
// cut shadow; pressing squeezes it a little (Washi's), and the text darkens.
- (void)paint {
    NSColor *ink = NSColor.labelColor;
    BOOL dark = [[self.effectiveAppearance bestMatchFromAppearancesWithNames:@[ NSAppearanceNameAqua, NSAppearanceNameDarkAqua ]] isEqual:NSAppearanceNameDarkAqua];
    extern NSColor *DPWashiPaperColor(BOOL dark);
    NSColor *card = [[DPWashiPaperColor(dark) colorUsingColorSpace:NSColorSpace.sRGBColorSpace] blendedColorWithFraction:dark ? .08 : .72 ofColor:NSColor.whiteColor];
    [CATransaction begin]; [CATransaction setDisableActions:DPWashiCalm()];
    self.layer.backgroundColor = (_hover ? card : NSColor.clearColor).CGColor;
    self.layer.shadowOpacity = _hover && !_down ? (dark ? .4 : .14) : 0;
    self.layer.shadowRadius = 0; self.layer.shadowOffset = CGSizeMake(1, -1);
    self.layer.shadowColor = (dark ? NSColor.blackColor : [NSColor colorWithSRGBRed:43 / 255.0 green:33 / 255.0 blue:24 / 255.0 alpha:1]).CGColor;
    _outline.strokeColor = [ink colorWithAlphaComponent:_hover ? 0 : .22].CGColor;
    CGFloat cx = NSMidX(self.bounds), cy = NSMidY(self.bounds), k = _down ? .97 : 1;
    self.layer.sublayerTransform = CATransform3DTranslate(CATransform3DScale(CATransform3DMakeTranslation(cx, cy, 0), k, k, 1), -cx, -cy, 0);
    [CATransaction commit];
    _title.textColor = _plus.contentTintColor = _hover ? NSColor.labelColor : NSColor.secondaryLabelColor;
}
- (void)viewDidChangeEffectiveAppearance { [super viewDidChangeEffectiveAppearance]; [self paint]; }
- (void)layout {
    [super layout];
    self.layer.cornerRadius = 10;
    if (_outline.superlayer != self.layer) { [self.layer addSublayer:_outline]; [self paint]; }
    CGPathRef ring = CGPathCreateWithRoundedRect(CGRectInset(self.bounds, .75, .75), 9.25, 9.25, NULL);
    _outline.frame = self.bounds; _outline.path = ring; CGPathRelease(ring);
    CGFloat h = NSHeight(self.bounds);
    _plus.frame = NSMakeRect(9, (h - 16) / 2, 16, 16);
    _title.frame = NSMakeRect(30, (h - 16) / 2, NSWidth(self.bounds) - 38, 16);
}
@end

CGFloat DPWashiNewTabRowRoom(NSView *list) { return DPWashiLive(&DPWashiNewTabTop) ? DPRowHeight + 2 : 0; }

// Dia's own "+ New Tab" row: the list's item holding the "add" icon, found by that (its class has had other names).
static char DPDiaRowKey;
@interface DPWeakView : NSObject
@property (nonatomic, weak) NSView *view;
@end
@implementation DPWeakView
@end
static NSView *DPDiaNewTabRow(NSView *list) {
    DPWeakView *box = DPGet(list, &DPDiaRowKey);
    if (box.view && box.view.superview) return box.view;
    NSView *mine = DPGet(list, &DPRowKey);
    NSView *icon = DPFindView(list, ^BOOL(NSView *v) {
        return [v isKindOfClass:NSImageView.class] && [v.accessibilityLabel isEqual:@"add"] && !(mine && [v isDescendantOf:mine]);
    });
    NSView *item = icon;
    while (item.superview && !DPIsKind(item.superview, "_TtCC7TabList11TabListView14CollectionView") && ![item.superview isKindOfClass:NSCollectionView.class]) item = item.superview;
    if (!item.superview) return nil;
    if (!box) { box = [DPWeakView new]; DPSet(list, &DPDiaRowKey, box); }
    box.view = item;
    return item;
}

void DPWashiNewTabRowIn(NSView *list, NSRect room) {
    DPWashiNewTabRow *row = DPGet(list, &DPRowKey);
    NSView *dia = DPDiaNewTabRow(list);
    BOOL top = !NSIsEmptyRect(room);
    if (dia && dia.hidden != top) dia.hidden = top;   // one New Tab row: ours at the top, or Dia's at the bottom
    if (!top) { [row removeFromSuperview]; DPSet(list, &DPRowKey, nil); return; }
    if (!row) { row = [[DPWashiNewTabRow alloc] initWithFrame:NSZeroRect]; DPSet(list, &DPRowKey, row); }
    if (row.superview != list) [list addSubview:row];
    NSRect frame = NSMakeRect(NSMinX(room) + 6, NSMinY(room) + 1, NSWidth(room) - 12, DPRowHeight - 3);   // Dia's tab pill: 6pt in, 34 tall
    if (!NSEqualRects(row.frame, frame)) row.frame = frame;
}

// Dia's own row at the bottom hides while ours is at the top.
static void DPNewTabCell_layout(NSView *self, SEL _cmd) {
    DPCallOriginal(DPNewTabCell_layout, self);
    if (self.alphaValue != 1) self.alphaValue = 1;   // (hidden instead, by DPWashiNewTabRowIn)
}
static NSView *DPNewTabCell_hitTest(NSView *self, SEL _cmd, NSPoint point) {
    return DPCallOriginal(DPNewTabCell_hitTest, self, point);
}

static void DPInstallWashiNewTabTop(void) {
    DPHook(DPNewTabCell, @selector(layout), (IMP)DPNewTabCell_layout);
    DPHook(DPNewTabCell, @selector(hitTest:), (IMP)DPNewTabCell_hitTest);
}

static void DPApplyWashiNewTabTop(DPPatch *patch) {
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
    .rows = DPWashiArtNewTabTop,
    .classes = DPClasses(DPDiaTabList),
    .install = DPInstallWashiNewTabTop,
    .apply = DPApplyWashiNewTabTop,
    .verify = DPVerifyWashiNewTabTop,
};
