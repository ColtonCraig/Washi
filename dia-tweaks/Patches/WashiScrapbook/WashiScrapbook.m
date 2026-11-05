#import "StdPatch/StdPatch.h"
#import "Patches/WashiShared/WashiShared.h"
NSArray<NSView *> *DPWashiArtLift(void);        // WashiLook.m
NSArray<NSView *> *DPWashiArtScrapbook(void);   // WashiLook.m

// How Washi's sidebar feels, in one transform per view:
//  Washi Cards (at rest, like Washi): favorites lean up to a degree each way, the selected tab half a degree.
//  Scrapbook: leans further (How crooked), tape across each favorite, the space name at a slant, and the toolbar's
//  buttons wiggle like stamps when the pointer comes onto them.
//  Paper Motion: a tab lifts under the pointer and a favorite more, both press in when clicked, a new tab slaps down
//  onto the paper and a space's tabs rise in one after another, all on Washi's spring and ease.
// Animations off (Washi's page) or Reduce Motion keep where things end up and drop the movement.

extern DPPatch DPWashiScrapbook, DPWashiLift, DPWashiTape, DPWashiCards;
static char DPSpyKey, DPPinTapeKey, DPPressKey;
static BOOL DPFlippedLayer(NSView *view);
CALayer *DPWashiTapeStrip(CGSize size, BOOL flipped, NSWindow *window);   // WashiTape.m
void DPWashiTapeRecolor(CALayer *tape, NSWindow *window);

static CAMediaTimingFunction *DPSpring(void) { return [CAMediaTimingFunction functionWithControlPoints:.3 :1.18 :.5 :1]; }   // Washi's --spring
static CAMediaTimingFunction *DPEase(void) { return [CAMediaTimingFunction functionWithControlPoints:.215 :.61 :.355 :1]; }   // Washi's --ease

// Scrapbook pins each favorite with a strip of tape across its top (while Washi Tape is on), like Washi's: 22×9,
// centred, leaning 5° one way or the other. Washi hangs it over the edge; Dia clips the sidebar above the first row,
// so here it sits just inside.
static void DPPinTape(NSView *item, NSUInteger place) {
    CALayer *tape = DPGet(item, &DPPinTapeKey);
    if (!DPWashiLive(&DPWashiScrapbook) || !DPWashiLive(&DPWashiTape) || !item.layer) {   // tape anywhere needs Washi Tape
        [tape removeFromSuperlayer]; DPSet(item, &DPPinTapeKey, nil); return;
    }
    BOOL flipped = DPFlippedLayer(item);
    if (!tape) { tape = DPWashiTapeStrip(CGSizeMake(22, 9), flipped, item.window); DPSet(item, &DPPinTapeKey, tape); }
    else DPWashiTapeRecolor(tape, item.window);
    [CATransaction begin]; [CATransaction setDisableActions:YES];
    CGFloat top = flipped ? NSMinY(item.bounds) : NSMaxY(item.bounds);
    tape.position = CGPointMake(NSMidX(item.bounds), top + (flipped ? 5.5 : -5.5));
    CGFloat lean = (place % 2 ? -5 : 5) * M_PI / 180;
    tape.affineTransform = CGAffineTransformMakeRotation(flipped ? lean : -lean);
    if (tape.superlayer != item.layer) [item.layer addSublayer:tape];
    [CATransaction commit];
}

static const CGFloat DPTilts[] = { -1.2, .9, .6, -.8, 1.1, -.5, .7, -1.0 };   // Washi's rot × 1.2°, by a favorite's place

static BOOL DPFlippedLayer(NSView *view) { return view.isFlipped || view.layer.geometryFlipped; }

static BOOL DPPointerIn(NSView *view) {
    NSWindow *window = view.window;
    if (!window || view.hiddenOrHasHiddenAncestor) return NO;
    NSPoint at = [view convertPoint:window.mouseLocationOutsideOfEventStream fromView:nil];
    return NSPointInRect(at, view.bounds);
}

// How much things lean: Washi's at rest with Cards; Scrapbook more, by How crooked.
static CGFloat DPLean(void) {
    if (DPWashiLive(&DPWashiScrapbook)) return 1.6 * DPWashiTilt();
    return DPWashiLive(&DPWashiCards) ? 1 : 0;
}

// A rotation and a squeeze about the view's middle, then a lift.
static CATransform3D DPFeel(NSView *view, CGFloat degrees, CGFloat lift, CGFloat scale) {
    CGFloat cx = NSMidX(view.bounds), cy = NSMidY(view.bounds), up = DPFlippedLayer(view) ? -1 : 1;
    CGFloat radians = (DPFlippedLayer(view) ? -degrees : degrees) * M_PI / 180;   // a negative tilt leans left either way
    CATransform3D t = CATransform3DMakeTranslation(cx, cy + lift * up, 0);
    t = CATransform3DRotate(t, radians, 0, 0, 1);
    t = CATransform3DScale(t, scale, scale, 1);
    return CATransform3DTranslate(t, -cx, -cy, 0);
}

static void DPFeelSet(NSView *view, CATransform3D target, CFTimeInterval duration) {
    CALayer *layer = view.layer;
    if (!layer || CATransform3DEqualToTransform(layer.sublayerTransform, target)) return;
    if (!DPWashiCalm() && view.window.isVisible) {
        CABasicAnimation *move = [CABasicAnimation animationWithKeyPath:@"sublayerTransform"];
        move.fromValue = [NSValue valueWithCATransform3D:layer.presentationLayer ? layer.presentationLayer.sublayerTransform : layer.sublayerTransform];
        move.toValue = [NSValue valueWithCATransform3D:target];
        move.duration = duration;
        move.timingFunction = DPSpring();
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

static BOOL DPPressed(NSView *view) { return DPGet(view, &DPPressKey) != nil; }

static void DPFeelTile(NSView *item) {
    if (!item.layer) return;
    NSUInteger place = 0;
    for (NSView *sib in item.superview.subviews) { if (sib == item) break; if (DPIsKind(sib, DPDiaPinnedTab)) place++; }
    BOOL motion = DPWashiLive(&DPWashiLift), hover = motion && DPPointerIn(item), press = motion && DPPressed(item);
    CGFloat tilt = DPTilts[place % (sizeof DPTilts / sizeof *DPTilts)] * DPLean();
    DPSpyOn(item, motion);
    DPFeelSet(item, DPFeel(item, tilt + (hover ? -.8 : 0), hover && !press ? 2.5 : 0, press ? .94 : 1), press ? .14 : .38);   // Washi's .pin:active scale(.94)
    DPPinTape(item, place);
}

// A tab's own lean, from its title, the same each time: Washi's rot, between -1 and 1.
static CGFloat DPTabRot(NSView *tab) {
    NSTextField *title = (NSTextField *)DPFindView(tab, ^BOOL(NSView *v) { return [v isKindOfClass:NSTextField.class] && ((NSTextField *)v).stringValue.length; });
    NSUInteger h = 0;
    NSString *s = title.stringValue ?: @"";
    for (NSUInteger i = 0; i < s.length; i++) h = h * 31 + [s characterAtIndex:i];
    return ((CGFloat)(h % 2001) / 1000.0) - 1;
}

static BOOL DPTabSelectedNow(NSView *tab) {
    for (NSView *background in tab.subviews)
        for (NSView *shape in background.subviews)
            if (DPIsKind(shape, DPDiaTabShape)) return !shape.hidden;
    return NO;
}

static void DPFeelTab(NSView *tab) {
    if (!tab.layer) return;
    BOOL motion = DPWashiLive(&DPWashiLift), hover = motion && DPPointerIn(tab), press = motion && DPPressed(tab);
    CGFloat lean = DPTabSelectedNow(tab) ? DPTabRot(tab) * -.5 * DPLean() : 0;   // Washi's .tab.on rotate(rot × -.5°)
    DPSpyOn(tab, motion);
    DPFeelSet(tab, DPFeel(tab, lean, hover && !press ? 1.5 : 0, press ? .97 : 1), press ? .14 : .38);
}

// The handwritten name (Washi Handwriting) leans like Washi's Scrapbook space name.
static void DPFeelName(NSView *list) {
    static Class label;
    if (!label) label = NSClassFromString(@"DPWashiHandLabel");
    for (NSView *sub in list.subviews) {
        if (![sub isKindOfClass:label] || !sub.layer) continue;
        CGFloat cx = NSMidX(sub.bounds), cy = NSMidY(sub.bounds);
        CGAffineTransform t = CGAffineTransformMakeTranslation(cx, cy);
        t = CGAffineTransformRotate(t, (DPWashiLive(&DPWashiScrapbook) ? (DPFlippedLayer(sub) ? 1.5 : -1.5) * MIN(DPWashiTilt(), 2.2) : 0) * M_PI / 180);
        t = CGAffineTransformTranslate(t, -cx, -cy);
        if (!CGAffineTransformEqualToTransform(sub.layer.affineTransform, t)) sub.layer.affineTransform = t;
    }
}

#pragma mark Pressing

// A click presses the tab or favorite in; Dia's own mouse handling runs (and may track a drag) while it's held.
static void DPPress(NSView *view, BOOL down) {
    DPSet(view, &DPPressKey, down ? @YES : nil);
    if (DPIsKind(view, DPDiaPinnedTab)) DPFeelTile(view); else DPFeelTab(view);
    [CATransaction flush];
}
static void DPFeelTab_mouseDown(NSView *self, SEL _cmd, NSEvent *event) {
    BOOL feel = DPWashiLive(&DPWashiLift);
    if (feel) DPPress(self, YES);
    DPCallOriginal(DPFeelTab_mouseDown, self, event);
    if (feel) DPPress(self, NO);
}
static void DPFeelTile_mouseDown(NSView *self, SEL _cmd, NSEvent *event) {
    BOOL feel = DPWashiLive(&DPWashiLift);
    if (feel) DPPress(self, YES);
    DPCallOriginal(DPFeelTile_mouseDown, self, event);
    if (feel) DPPress(self, NO);
}
static void DPFeelTab_mouseUp(NSView *self, SEL _cmd, NSEvent *event) {
    DPCallOriginal(DPFeelTab_mouseUp, self, event);
    if (DPPressed(self)) DPPress(self, NO);
}

#pragma mark Tabs arriving

// A new tab slaps down onto the paper (it drops 8pt as it appears); a space's tabs, arriving together, rise in one
// after another, 14ms apart, like Washi's lists.
static NSHashTable<NSView *> *DPSeenTabs;
static NSMutableArray<NSView *> *DPArriving;
static CFTimeInterval DPLaunched;

static void DPArrive(NSView *tab, CGFloat dy, CFTimeInterval delay, CFTimeInterval duration) {
    CALayer *layer = tab.layer;
    if (!layer) return;
    CABasicAnimation *fade = [CABasicAnimation animationWithKeyPath:@"opacity"];
    fade.fromValue = @0; fade.toValue = @1;
    CABasicAnimation *drop = [CABasicAnimation animationWithKeyPath:@"transform.translation.y"];
    drop.fromValue = @(DPFlippedLayer(tab.superview) ? dy : -dy); drop.toValue = @0; drop.additive = YES;
    CAAnimationGroup *group = [CAAnimationGroup animation];
    group.animations = @[ fade, drop ];
    group.duration = duration; group.timingFunction = DPEase();
    group.beginTime = CACurrentMediaTime() + delay; group.fillMode = kCAFillModeBackwards;
    [layer addAnimation:group forKey:@"washiArrive"];
}

static void DPArrivals(void) {
    NSArray<NSView *> *tabs = [DPArriving copy];
    [DPArriving removeAllObjects];
    if (!tabs.count) return;
    if (tabs.count == 1) { DPArrive(tabs[0], -8, 0, .3); return; }   // Washi's slap
    NSArray *sorted = [tabs sortedArrayUsingComparator:^NSComparisonResult(NSView *a, NSView *b) {
        CGFloat ya = [a convertPoint:NSZeroPoint toView:nil].y, yb = [b convertPoint:NSZeroPoint toView:nil].y;
        return ya > yb ? NSOrderedAscending : ya < yb ? NSOrderedDescending : NSOrderedSame;   // top of the window first
    }];
    for (NSUInteger i = 0; i < sorted.count; i++) DPArrive(sorted[i], 6, MIN(i, 8) * .014, .26);   // Washi's rise
}

static void DPFeelTab_moved(NSView *self, SEL _cmd) {
    DPCallOriginal(DPFeelTab_moved, self);
    if (!self.window || !DPWashiLive(&DPWashiLift) || DPWashiCalm()) return;
    BOOL fresh = ![DPSeenTabs containsObject:self];
    [DPSeenTabs addObject:self];
    if (CACurrentMediaTime() - DPLaunched < 4) return;   // not the windows opening at launch
    [DPArriving addObject:self];
    if (DPArriving.count > 1) return;
    dispatch_async(dispatch_get_main_queue(), ^{
        // One tab on its own that isn't new is a cell being reused: no show.
        if (DPArriving.count == 1 && !fresh) { [DPArriving removeAllObjects]; return; }
        DPArrivals();
    });
}

#pragma mark The toolbar's stamps

// In Scrapbook, the toolbar's buttons wiggle like a stamp as the pointer comes onto them: -12°, then 8°, in .32s.
static void DPFeelStamp_entered(NSView *self, SEL _cmd, NSEvent *event) {
    DPCallOriginal(DPFeelStamp_entered, self, event);
    if (!DPWashiLive(&DPWashiScrapbook) || DPWashiCalm() || !self.layer) return;
    BOOL inBar = NO;
    for (NSView *up = self.superview; up && !inBar; up = up.superview) inBar = DPIsKind(up, DPDiaToolbar);
    if (!inBar || NSWidth(self.bounds) > 40) return;   // the round buttons, not the address field
    NSMutableArray *values = [NSMutableArray new];
    for (NSNumber *deg in @[ @0, @-12, @8, @0 ]) [values addObject:[NSValue valueWithCATransform3D:DPFeel(self, deg.doubleValue, 0, 1)]];
    CAKeyframeAnimation *wiggle = [CAKeyframeAnimation animationWithKeyPath:@"sublayerTransform"];
    wiggle.values = values; wiggle.keyTimes = @[ @0, @.25, @.6, @1 ]; wiggle.duration = .32;
    wiggle.timingFunction = [CAMediaTimingFunction functionWithName:kCAMediaTimingFunctionEaseInEaseOut];
    [self.layer addAnimation:wiggle forKey:@"washiStamp"];
}

static void DPFeelTile_layout(NSView *self, SEL _cmd) { DPCallOriginal(DPFeelTile_layout, self); DPFeelTile(self); }
static void DPFeelTab_layout(NSView *self, SEL _cmd) { DPCallOriginal(DPFeelTab_layout, self); DPFeelTab(self); }
static void DPFeelList_layout(NSView *self, SEL _cmd) { DPCallOriginal(DPFeelList_layout, self); DPFeelName(self); }
// A tab picked repaints its fill without laying out: its lean comes and goes with the selection.
static void DPFeelFill_updateLayer(NSView *self, SEL _cmd) {
    DPCallOriginal(DPFeelFill_updateLayer, self);
    NSView *tab = self.superview.superview.superview.superview;   // tab › background › shape › clip › fill
    if (DPIsKind(self.superview.superview, DPDiaTabShape) && DPIsKind(tab, DPDiaTabView)) dispatch_async(dispatch_get_main_queue(), ^{ DPFeelTab(tab); });
}

static void DPInstallFeel(void) {
    static BOOL done;
    if (done) return;
    done = YES;
    DPLaunched = CACurrentMediaTime();
    DPSeenTabs = [NSHashTable weakObjectsHashTable];
    DPArriving = [NSMutableArray new];
    DPHook(DPDiaPinnedTab, @selector(layout), (IMP)DPFeelTile_layout);
    DPHook(DPDiaTabView, @selector(layout), (IMP)DPFeelTab_layout);
    DPHook(DPDiaTabList, @selector(layout), (IMP)DPFeelList_layout);
    DPHook(DPDiaTabView, @selector(mouseDown:), (IMP)DPFeelTab_mouseDown);
    DPHook(DPDiaTabView, @selector(mouseUp:), (IMP)DPFeelTab_mouseUp);
    DPHook(DPDiaPinnedTab, @selector(mouseDown:), (IMP)DPFeelTile_mouseDown);
    DPHook(DPDiaTabView, @selector(viewDidMoveToWindow), (IMP)DPFeelTab_moved);
    DPHook(DPDiaColorFill, @selector(updateLayer), (IMP)DPFeelFill_updateLayer);
    DPHook("_TtC5ARCUI16HoverableControl", @selector(mouseEntered:), (IMP)DPFeelStamp_entered);
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
        if (tilted != (DPLean() > 0)) return tilted ? @"a favorite left tilted" : @"a favorite isn't tilted";
    }
    return nil;
}

static NSString *DPVerifyLift(DPPatch *patch) {
    for (NSView *tab in DPFindViews(DPDiaTabView)) {
        if (tab.hiddenOrHasHiddenAncestor) continue;
        if ((DPGet(tab, &DPSpyKey) != nil) != DPWashiLive(patch)) return DPWashiLive(patch) ? @"a tab isn't watching the pointer" : @"a tab still watches the pointer";
    }
    return nil;
}

DP_PATCH(DPWashiScrapbook) {
    .key = @"washiScrapbook",
    .order = 9,
    .title = @"Scrapbook",
    .detail = @"More paper, like Washi’s Scrapbook: things lean further, favorites get tape, the space name slants, and the toolbar’s buttons wiggle like stamps.",
    .symbol = @"book.closed.fill book.closed",
    .tint = @"systemPurpleColor",
    .section = @"Sidebar",
    .requires = @"washiPaper",
    .rows = DPWashiArtScrapbook,
    .classes = DPClasses(DPDiaPinnedTab, DPDiaTabList),
    .install = DPInstallFeel,
    .apply = DPApplyFeel,
    .verify = DPVerifyScrapbook,
};

DP_PATCH(DPWashiLift) {
    .key = @"washiLift",
    .order = 10,
    .title = @"Paper Motion",
    .detail = @"Tabs and favorites lift under the pointer and press in when clicked; a new tab slaps down onto the paper and a space’s tabs rise in, on Washi’s spring.",
    .symbol = @"hand.point.up.left.fill hand.point.up.left",
    .tint = @"systemMintColor",
    .section = @"Sidebar",
    .requires = @"washiPaper",
    .rows = DPWashiArtLift,
    .classes = DPClasses(DPDiaPinnedTab, DPDiaTabView),
    .install = DPInstallFeel,
    .apply = DPApplyFeel,
    .verify = DPVerifyLift,
};
