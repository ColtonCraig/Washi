#import "StdPatch/StdPatch.h"
#import "Patches/WashiShared/WashiShared.h"

// Two Washi feels for the sidebar, which share one transform per view:
//  Washi Scrapbook: favorites tilted a little each way and the handwritten space name at a slant, like Washi's
//  Scrapbook look. Paper Hover: a tab lifts a point under the pointer and a favorite two, with a touch more tilt,
//  on Washi's spring. Reduce Motion keeps the lift but drops the movement to it.

extern DPPatch DPWashiScrapbook, DPWashiLift;
static char DPSpyKey, DPPinTapeKey;
static BOOL DPFlippedLayer(NSView *view);
CALayer *DPWashiTapeStrip(CGSize size, BOOL flipped);   // WashiTape.m
void DPWashiTapeRecolor(CALayer *tape);

// Scrapbook pins each favorite with a strip of tape across its top, like Washi's: 22×9, centred, leaning 5° one way
// or the other. Washi hangs it over the edge; Dia clips the sidebar above the first row, so here it sits just inside.
static void DPPinTape(NSView *item, NSUInteger place) {
    CALayer *tape = DPGet(item, &DPPinTapeKey);
    if (!DPWashiLive(&DPWashiScrapbook) || !item.layer) { [tape removeFromSuperlayer]; DPSet(item, &DPPinTapeKey, nil); return; }
    BOOL flipped = DPFlippedLayer(item);
    if (!tape) { tape = DPWashiTapeStrip(CGSizeMake(22, 9), flipped); DPSet(item, &DPPinTapeKey, tape); }
    else DPWashiTapeRecolor(tape);
    [CATransaction begin]; [CATransaction setDisableActions:YES];
    CGFloat top = flipped ? NSMinY(item.bounds) : NSMaxY(item.bounds);
    tape.position = CGPointMake(NSMidX(item.bounds), top + (flipped ? 5.5 : -5.5));   // just inside the top edge: Dia clips anything above the first row
    CGFloat lean = (place % 2 ? -5 : 5) * M_PI / 180;
    tape.affineTransform = CGAffineTransformMakeRotation(flipped ? lean : -lean);
    if (tape.superlayer != item.layer) [item.layer addSublayer:tape];
    [CATransaction commit];
}

static const CGFloat DPTilts[] = { -1.2, .9, .6, -.8, 1.1, -.5, .7, -1.0 };   // degrees, by a favorite's place

static BOOL DPFlippedLayer(NSView *view) { return view.isFlipped || view.layer.geometryFlipped; }

static BOOL DPPointerIn(NSView *view) {
    NSWindow *window = view.window;
    if (!window || view.hiddenOrHasHiddenAncestor) return NO;
    NSPoint at = [view convertPoint:window.mouseLocationOutsideOfEventStream fromView:nil];
    return NSPointInRect(at, view.bounds);
}

// A rotation about the view's middle, then a lift.
static CATransform3D DPFeel(NSView *view, CGFloat degrees, CGFloat lift) {
    CGFloat cx = NSMidX(view.bounds), cy = NSMidY(view.bounds), up = DPFlippedLayer(view) ? -1 : 1;
    CGFloat radians = (DPFlippedLayer(view) ? -degrees : degrees) * M_PI / 180;   // a negative tilt leans left either way
    CATransform3D t = CATransform3DMakeTranslation(cx, cy + lift * up, 0);
    t = CATransform3DRotate(t, radians, 0, 0, 1);
    return CATransform3DTranslate(t, -cx, -cy, 0);
}

static void DPFeelSet(NSView *view, CATransform3D target) {
    CALayer *layer = view.layer;
    if (!layer || CATransform3DEqualToTransform(layer.sublayerTransform, target)) return;
    if (!NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion && view.window.isVisible) {
        CABasicAnimation *move = [CABasicAnimation animationWithKeyPath:@"sublayerTransform"];
        move.fromValue = [NSValue valueWithCATransform3D:layer.presentationLayer ? layer.presentationLayer.sublayerTransform : layer.sublayerTransform];
        move.toValue = [NSValue valueWithCATransform3D:target];
        move.duration = .38;
        move.timingFunction = [CAMediaTimingFunction functionWithControlPoints:.3 :1.18 :.5 :1];   // Washi's --spring
        [layer addAnimation:move forKey:@"washiFeel"];
    }
    [CATransaction begin]; [CATransaction setDisableActions:YES];
    layer.sublayerTransform = target;
    [CATransaction commit];
}

// Watches the pointer over a tab or favorite. It takes no clicks; it only asks for the feel again on the way in and out.
@interface DPWashiSpy : NSView
@end
@implementation DPWashiSpy
- (NSView *)hitTest:(NSPoint)point { return nil; }
- (void)updateTrackingAreas {
    [super updateTrackingAreas];
    if (!self.trackingAreas.count)
        [self addTrackingArea:[[NSTrackingArea alloc] initWithRect:NSZeroRect options:NSTrackingMouseEnteredAndExited | NSTrackingActiveInActiveApp | NSTrackingInVisibleRect owner:self userInfo:nil]];
}
- (void)mouseEntered:(NSEvent *)event { self.superview.needsLayout = YES; }
- (void)mouseExited:(NSEvent *)event { self.superview.needsLayout = YES; }
@end

static void DPSpyOn(NSView *view, BOOL want) {
    DPWashiSpy *spy = DPGet(view, &DPSpyKey);
    if (!want) { if (spy) { [spy removeFromSuperview]; DPSet(view, &DPSpyKey, nil); } return; }
    if (!spy) { spy = [[DPWashiSpy alloc] initWithFrame:view.bounds]; spy.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable; DPSet(view, &DPSpyKey, spy); }
    if (spy.superview != view) [view addSubview:spy];
    if (!NSEqualRects(spy.frame, view.bounds)) spy.frame = view.bounds;
}

static void DPFeelTile(NSView *item) {
    if (!item.layer) return;
    NSUInteger place = 0;
    for (NSView *sib in item.superview.subviews) { if (sib == item) break; if (DPIsKind(sib, DPDiaPinnedTab)) place++; }
    BOOL hover = DPWashiLive(&DPWashiLift) && DPPointerIn(item);
    CGFloat tilt = DPWashiLive(&DPWashiScrapbook) ? DPTilts[place % (sizeof DPTilts / sizeof *DPTilts)] : 0;
    DPSpyOn(item, DPWashiLive(&DPWashiLift));
    DPFeelSet(item, DPFeel(item, tilt + (hover ? -.6 : 0), hover ? 2 : 0));
    DPPinTape(item, place);
}

static void DPFeelTab(NSView *tab) {
    if (!tab.layer) return;
    BOOL hover = DPWashiLive(&DPWashiLift) && DPPointerIn(tab);
    DPSpyOn(tab, DPWashiLive(&DPWashiLift));
    DPFeelSet(tab, DPFeel(tab, 0, hover ? 1 : 0));
}

// The handwritten name (Washi Handwriting) leans like Washi's Scrapbook space name.
static void DPFeelName(NSView *list) {
    static Class label;
    if (!label) label = NSClassFromString(@"DPWashiHandLabel");
    for (NSView *sub in list.subviews) {
        if (![sub isKindOfClass:label] || !sub.layer) continue;
        CGFloat cx = NSMidX(sub.bounds), cy = NSMidY(sub.bounds);
        CGAffineTransform t = CGAffineTransformMakeTranslation(cx, cy);
        t = CGAffineTransformRotate(t, (DPWashiLive(&DPWashiScrapbook) ? (DPFlippedLayer(sub) ? 1.6 : -1.6) : 0) * M_PI / 180);
        t = CGAffineTransformTranslate(t, -cx, -cy);
        if (!CGAffineTransformEqualToTransform(sub.layer.affineTransform, t)) sub.layer.affineTransform = t;
    }
}

static void DPFeelTile_layout(NSView *self, SEL _cmd) { DPCallOriginal(DPFeelTile_layout, self); DPFeelTile(self); }
static void DPFeelTab_layout(NSView *self, SEL _cmd) { DPCallOriginal(DPFeelTab_layout, self); DPFeelTab(self); }
static void DPFeelList_layout(NSView *self, SEL _cmd) { DPCallOriginal(DPFeelList_layout, self); DPFeelName(self); }

static void DPInstallFeel(void) {
    static BOOL done;
    if (done) return;
    done = YES;
    DPHook(DPDiaPinnedTab, @selector(layout), (IMP)DPFeelTile_layout);
    DPHook(DPDiaTabView, @selector(layout), (IMP)DPFeelTab_layout);
    DPHook(DPDiaTabList, @selector(layout), (IMP)DPFeelList_layout);
}

static void DPApplyFeel(DPPatch *patch) {
    for (NSView *item in DPFindViews(DPDiaPinnedTab)) DPFeelTile(item);
    for (NSView *tab in DPFindViews(DPDiaTabView)) DPFeelTab(tab);
    for (NSView *list in DPFindViews(DPDiaTabList)) { DPFeelName(list); list.needsLayout = YES; }
}

static NSString *DPVerifyScrapbook(DPPatch *patch) {
    for (NSView *item in DPFindViews(DPDiaPinnedTab)) {
        if (item.hiddenOrHasHiddenAncestor || DPPointerIn(item)) continue;
        BOOL tilted = !CATransform3DIsIdentity(item.layer.sublayerTransform);
        if (tilted != DPWashiLive(patch)) return DPWashiLive(patch) ? @"a favorite isn't tilted" : @"a favorite left tilted";
    }
    return nil;
}

static NSString *DPVerifyLift(DPPatch *patch) {
    for (NSView *tab in DPFindViews(DPDiaTabView)) {
        if (tab.hiddenOrHasHiddenAncestor) continue;
        if ((DPGet(tab, &DPSpyKey) != nil) != DPWashiLive(patch)) return DPWashiLive(patch) ? @"a tab isn't watching the pointer" : @"a tab still watches the pointer";
        if (!DPWashiLive(patch) && !CATransform3DIsIdentity(tab.layer.sublayerTransform)) return @"a tab left lifted";
    }
    return nil;
}

DP_PATCH(DPWashiScrapbook) {
    .key = @"washiScrapbook",
    .order = 9,
    .title = @"Scrapbook",
    .detail = @"Favorites tilted a little each way and the space name at a slant, like Washi’s Scrapbook look.",
    .symbol = @"book.closed.fill book.closed",
    .tint = @"systemPurpleColor",
    .section = @"Sidebar",
    .requires = @"washiPaper",
    .classes = DPClasses(DPDiaPinnedTab, DPDiaTabList),
    .install = DPInstallFeel,
    .apply = DPApplyFeel,
    .verify = DPVerifyScrapbook,
};

DP_PATCH(DPWashiLift) {
    .key = @"washiLift",
    .order = 10,
    .title = @"Paper Hover",
    .detail = @"Tabs and favorites lift off the paper under the pointer, on Washi’s spring.",
    .symbol = @"hand.point.up.left.fill hand.point.up.left",
    .tint = @"systemMintColor",
    .section = @"Sidebar",
    .requires = @"washiPaper",
    .classes = DPClasses(DPDiaPinnedTab, DPDiaTabView),
    .install = DPInstallFeel,
    .apply = DPApplyFeel,
    .verify = DPVerifyLift,
};
