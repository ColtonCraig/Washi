#import "StdPatch/StdPatch.h"
#import "Patches/WashiShared/WashiShared.h"
NSArray<NSView *> *DPWashiArtTape(void);   // WashiLook.m

@interface NSObject (DPTapeSwiftFields)
- (id)safeSwiftValueForKey:(NSString *)key;  // AXCoreUtilities: reads Swift properties the Obj-C runtime hides.
@end

// Washi Tape: a strip of Washi's washi tape on the selected tab, as in Washi's Scrapbook look: striped in the tape
// color, torn at the ends, stuck on its top-left corner at a tilt. It's a layer, never a view, so it can't take a click,
// and it presses on with a little settle when a tab is picked (none with Reduce Motion on).

extern DPPatch DPWashiTape;
static char DPTapeKey;

typedef struct { NSString *key, *name; uint32_t rgb; } DPTapeChoice;
static const DPTapeChoice DPTapes[] = {
    { @"tangerine", @"Tangerine", 0xff6a3d }, { @"blueberry", @"Blueberry", 0x3d63ff }, { @"bubblegum", @"Bubblegum", 0xff3d8d },
    { @"clover", @"Clover", 0x1f9d57 }, { @"lagoon", @"Lagoon", 0x0e9f9f }, { @"grape", @"Grape", 0x7b46ff }, { @"lime", @"Lime", 0x74b000 },
};

// For the Washi look picker: the tapes, in order.
NSUInteger DPWashiTapeCount(void) { return sizeof DPTapes / sizeof *DPTapes; }
void DPWashiTapeAt(NSUInteger i, NSString **key, NSString **name, uint32_t *rgb) {
    if (key) *key = DPTapes[i].key;
    if (name) *name = DPTapes[i].name;
    if (rgb) *rgb = DPTapes[i].rgb;
}

static uint32_t DPTapeRGBForKey(NSString *key) {
    for (size_t i = 0; i < sizeof DPTapes / sizeof *DPTapes; i++) if ([DPTapes[i].key isEqual:key]) return DPTapes[i].rgb;
    return DPTapes[0].rgb;
}
static uint32_t DPTapeRGB(void) { return DPTapeRGBForKey(DPChoice(&DPWashiTape) ?: @"tangerine"); }
// A window's tape: its space's own color, if it has one, else the main tape.
uint32_t DPWashiTapeRGBFor(NSWindow *window) {
    NSString *own = DPWashiSpaceTape(DPWashiSpaceOf(window));
    return own ? DPTapeRGBForKey(own) : DPTapeRGB();
}

// The stripes: the tape color, and the tape color 62% of the way to white, 6pt each at -45°, like Washi's CSS.
static CGImageRef DPTapeStripes(uint32_t rgb) {
    static NSMutableDictionary<NSNumber *, id> *cache;   // one per color: spaces can each have their own
    if (!cache) cache = [NSMutableDictionary new];
    id hit = cache[@(rgb)];
    if (hit) return (__bridge CGImageRef)hit;
    const int scale = 2, w = 34 * scale, h = 17 * scale;
    CGColorSpaceRef space = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
    CGContextRef ctx = CGBitmapContextCreate(NULL, w, h, 8, 0, space, (CGBitmapInfo)kCGImageAlphaPremultipliedLast);
    CGFloat r = ((rgb >> 16) & 255) / 255.0, g = ((rgb >> 8) & 255) / 255.0, b = (rgb & 255) / 255.0;
    CGContextSetRGBFillColor(ctx, r + (1 - r) * .38, g + (1 - g) * .38, b + (1 - b) * .38, 1);
    CGContextFillRect(ctx, CGRectMake(0, 0, w, h));
    CGContextSetRGBFillColor(ctx, r, g, b, 1);
    const CGFloat band = 6 * scale * M_SQRT2;   // 6pt measured across the stripe
    for (CGFloat x = -h; x < w + h; x += band * 2) {
        CGContextMoveToPoint(ctx, x, 0); CGContextAddLineToPoint(ctx, x + band, 0);
        CGContextAddLineToPoint(ctx, x + band + h, h); CGContextAddLineToPoint(ctx, x + h, h);
        CGContextClosePath(ctx);
    }
    CGContextFillPath(ctx);
    CGImageRef image = CGBitmapContextCreateImage(ctx);
    cache[@(rgb)] = (__bridge_transfer id)image;
    CGContextRelease(ctx); CGColorSpaceRelease(space);
    return image;
}

// Torn ends: the same outline as Washi's clip-path, in a 28×11 strip.
static CGPathRef DPTapeOutline(CGSize size, BOOL flipped) {
    static const CGFloat pts[][2] = { {0, .18}, {.06, 0}, {.30, .10}, {.52, 0}, {.76, .08}, {1, 0}, {.96, .5}, {1, 1}, {.72, .90}, {.48, 1}, {.24, .92}, {0, 1}, {.04, .5} };
    CGMutablePathRef path = CGPathCreateMutable();
    for (size_t i = 0; i < sizeof pts / sizeof *pts; i++) {
        CGFloat x = pts[i][0] * size.width, y = (flipped ? pts[i][1] : 1 - pts[i][1]) * size.height;
        if (i == 0) CGPathMoveToPoint(path, NULL, x, y); else CGPathAddLineToPoint(path, NULL, x, y);
    }
    CGPathCloseSubpath(path);
    return path;
}

// For the other Washi tweaks: a strip of this tape (the chosen color), torn at both ends, and a recolor for a new choice.
CALayer *DPWashiTapeStrip(CGSize size, BOOL flipped, NSWindow *window) {
    CALayer *tape = [CALayer layer];
    tape.bounds = (CGRect){ CGPointZero, size };
    tape.contentsGravity = kCAGravityResizeAspectFill;
    tape.contentsScale = 2;
    tape.opacity = .82;
    tape.zPosition = 1000;
    tape.contents = (__bridge id)DPTapeStripes(DPWashiTapeRGBFor(window));
    CAShapeLayer *torn = [CAShapeLayer layer];
    torn.frame = tape.bounds;
    CGPathRef outline = DPTapeOutline(size, flipped);
    torn.path = outline;
    CGPathRelease(outline);
    tape.mask = torn;
    return tape;
}
void DPWashiTapeRecolor(CALayer *tape, NSWindow *window) { tape.contents = (__bridge id)DPTapeStripes(DPWashiTapeRGBFor(window)); }

static BOOL DPTapeTabSelected(NSView *tab) {
    if (![tab respondsToSelector:@selector(safeSwiftValueForKey:)]) return NO;
    NSString *state = [[[[tab safeSwiftValueForKey:@"viewModel"] safeSwiftValueForKey:@"stateSubject"] safeSwiftValueForKey:@"currentValue"] description];
    NSRange at = [state rangeOfString:@"selectionStyle: "];
    if (at.location == NSNotFound) return NO;
    NSString *style = [state substringFromIndex:NSMaxRange(at)];
    return ![style hasPrefix:@"nil"] && ![style hasPrefix:@"none"] && ![style hasPrefix:@"above"] && ![style hasPrefix:@"below"];
}

// The tab's visible pill, in the tab's coordinates: its shape view, or the row inset as Dia insets it if there's none.
static NSRect DPTapePill(NSView *tab) {
    NSMutableArray<NSView *> *queue = [NSMutableArray arrayWithObject:tab];
    while (queue.count) {
        NSView *view = queue.firstObject; [queue removeObjectAtIndex:0];
        if (view != tab && DPIsKind(view, DPDiaTabShape) && !view.hidden && view.bounds.size.width > 20) return [view convertRect:view.bounds toView:tab];
        [queue addObjectsFromArray:view.subviews];
    }
    return NSInsetRect(tab.bounds, 6, 2);
}

static BOOL DPCalm(void) { return DPWashiCalm(); }

static void DPTapeOn(NSView *tab) {
    if (!tab.layer) return;
    CALayer *tape = DPGet(tab, &DPTapeKey);
    BOOL want = DPWashiLive(&DPWashiTape) && DPTapeTabSelected(tab) && !tab.hiddenOrHasHiddenAncestor;
    if (!want) {
        if (tape) { [tape removeFromSuperlayer]; DPSet(tab, &DPTapeKey, nil); }
        return;
    }
    BOOL fresh = !tape;
    const CGSize size = CGSizeMake(28, 11);
    if (fresh) {
        tape = [CALayer layer];
        tape.bounds = (CGRect){ CGPointZero, size };
        tape.contentsGravity = kCAGravityResizeAspectFill;
        tape.contentsScale = 2;
        tape.opacity = .82;
        tape.zPosition = 1000;
        tape.shadowOpacity = .14; tape.shadowRadius = 0; tape.shadowColor = NSColor.blackColor.CGColor;
        CAShapeLayer *torn = [CAShapeLayer layer];
        torn.frame = tape.bounds;
        tape.mask = torn;
        DPSet(tab, &DPTapeKey, tape);
    }
    BOOL flipped = tab.layer.geometryFlipped || tab.isFlipped;
    CGPathRef outline = DPTapeOutline(size, flipped);
    ((CAShapeLayer *)tape.mask).path = outline;
    CGPathRelease(outline);
    tape.shadowOffset = CGSizeMake(0, flipped ? 1 : -1);
    [CATransaction begin]; [CATransaction setDisableActions:YES];
    tape.contents = (__bridge id)DPTapeStripes(DPWashiTapeRGBFor(tab.window));
    // On the corner of the tab's pill, not of its whole row (which runs to the window's edge): like Washi, it hangs
    // 1pt off the left (clear of the window edge) and 3pt off the top, so its middle is 13pt in and 2.5pt down from the pill's top-left corner.
    NSRect pill = DPTapePill(tab);
    CGFloat top = tab.isFlipped ? NSMinY(pill) : NSMaxY(pill);
    tape.position = CGPointMake(NSMinX(pill) + 13, top + (tab.isFlipped ? 2.5 : -2.5));
    tape.affineTransform = CGAffineTransformMakeRotation((flipped ? -20 : 20) * M_PI / 180);
    if (tape.superlayer != tab.layer) [tab.layer addSublayer:tape];
    [CATransaction commit];
    if (fresh && !DPCalm()) {
        CAKeyframeAnimation *press = [CAKeyframeAnimation animationWithKeyPath:@"transform.scale"];
        press.values = @[ @1.35, @.94, @1.0 ];
        press.keyTimes = @[ @0, @.6, @1 ];
        press.duration = .26;
        press.timingFunctions = @[ [CAMediaTimingFunction functionWithControlPoints:.2 :.8 :.2 :1], [CAMediaTimingFunction functionWithName:kCAMediaTimingFunctionEaseOut] ];
        CABasicAnimation *fade = [CABasicAnimation animationWithKeyPath:@"opacity"];
        fade.fromValue = @0; fade.toValue = @.82; fade.duration = .14;
        [tape addAnimation:press forKey:@"washiPress"];
        [tape addAnimation:fade forKey:@"washiFade"];
    }
}

static void DPTapeAll(void) {
    for (NSView *tab in DPFindViews(DPDiaTabView)) DPTapeOn(tab);
}

static void DPTapeTab_layout(NSView *self, SEL _cmd) {
    DPCallOriginal(DPTapeTab_layout, self);
    DPTapeOn(self);
}

// Picking a tab doesn't lay the tabs out again, but it does repaint the selection fill: the cue to move the tape.
static void DPTapeFill_updateLayer(NSView *self, SEL _cmd) {
    DPCallOriginal(DPTapeFill_updateLayer, self);
    if (!DPWashiLive(&DPWashiTape)) return;
    static BOOL queued;
    if (queued) return;
    queued = YES;
    dispatch_async(dispatch_get_main_queue(), ^{ queued = NO; DPTapeAll(); });
}

#pragma mark The space dots

// The dots at the bottom of the sidebar, one per space, take each space's tape: the one you're in in full, the others
// faded into the paper. Ours sit exactly over Dia's, so Dia's clicks and hover still work.
static char DPDotKey, DPDotWatchKey;
NSColor *DPWashiPaperColor(BOOL dark);   // WashiPaper.m

static uint32_t DPTapeRGBForSpace(NSString *space) {
    NSString *own = DPWashiSpaceTape(space);
    return own ? DPTapeRGBForKey(own) : DPTapeRGB();
}

static void DPDotOn(NSView *item) {
    NSView *dia = item.subviews.firstObject, *dot = DPGet(item, &DPDotKey);
    NSString *space = item.accessibilityLabel;
    if (!DPWashiLive(&DPWashiTape) || !dia || !space.length) { [dot removeFromSuperview]; DPSet(item, &DPDotKey, nil); return; }
    if (!dot) { dot = [NSView new]; dot.wantsLayer = YES; DPSet(item, &DPDotKey, dot); }
    if (dot.superview != item) [item addSubview:dot positioned:NSWindowAbove relativeTo:dia];
    if (!NSEqualRects(dot.frame, dia.frame)) dot.frame = dia.frame;
    BOOL here = [space isEqual:DPWashiSpaceOf(item.window)];
    BOOL dark = [[item.effectiveAppearance bestMatchFromAppearancesWithNames:@[ NSAppearanceNameAqua, NSAppearanceNameDarkAqua ]] isEqual:NSAppearanceNameDarkAqua];
    uint32_t rgb = DPTapeRGBForSpace(space);
    NSColor *tape = [NSColor colorWithSRGBRed:((rgb >> 16) & 255) / 255.0 green:((rgb >> 8) & 255) / 255.0 blue:(rgb & 255) / 255.0 alpha:1];
    NSColor *color = here ? tape : [[DPWashiPaperColor(dark) colorUsingColorSpace:NSColorSpace.sRGBColorSpace] blendedColorWithFraction:.45 ofColor:tape];
    [CATransaction begin]; [CATransaction setDisableActions:YES];
    dot.layer.cornerRadius = NSHeight(dia.frame) / 2;
    dot.layer.backgroundColor = color.CGColor;
    [CATransaction commit];
}

static void DPDots(NSWindow *window) {
    for (NSView *item in DPFindViews(DPDiaSpaceSwitcherItem)) if (!window || item.window == window) DPDotOn(item);
}

// A new space in the window title: its tab's tape and the dots follow.
@interface DPWashiTapeWatcher : NSObject
@property (nonatomic, weak) NSWindow *window;
@end
@implementation DPWashiTapeWatcher
- (void)observeValueForKeyPath:(NSString *)keyPath ofObject:(id)object change:(NSDictionary *)change context:(void *)context {
    dispatch_async(dispatch_get_main_queue(), ^{
        if (!DPWashiLive(&DPWashiTape)) return;
        DPDots(self.window);
        for (NSView *tab in DPFindViews(DPDiaTabView)) if (tab.window == self.window) tab.needsLayout = YES;
    });
}
- (void)dealloc { [_window removeObserver:self forKeyPath:@"title"]; }
@end

static void DPDot_layout(NSView *self, SEL _cmd) {
    DPCallOriginal(DPDot_layout, self);
    DPDotOn(self);
    NSWindow *window = self.window;
    if (window && !DPGet(window, &DPDotWatchKey)) {
        DPWashiTapeWatcher *watcher = [DPWashiTapeWatcher new];
        watcher.window = window;
        [window addObserver:watcher forKeyPath:@"title" options:0 context:NULL];
        DPSet(window, &DPDotWatchKey, watcher);
    }
}

// For the Spaces list on Washi's page: the spaces in the switcher, in its order.
NSArray<NSString *> *DPWashiSpaces(void) {
    NSMutableArray *spaces = [NSMutableArray new];
    for (NSView *item in DPFindViews(DPDiaSpaceSwitcherItem)) {
        NSString *name = item.accessibilityLabel;
        if (name.length && ![spaces containsObject:name]) [spaces addObject:name];
    }
    return spaces;
}

static void DPInstallWashiTape(void) {
    DPHook(DPDiaSpaceSwitcherItem, @selector(layout), (IMP)DPDot_layout);
    DPHook(DPDiaTabView, @selector(layout), (IMP)DPTapeTab_layout);
    DPHook(DPDiaColorFill, @selector(updateLayer), (IMP)DPTapeFill_updateLayer);
}

static void DPApplyWashiTape(DPPatch *patch) {
    for (NSView *tab in DPFindViews(DPDiaTabView)) {
        CALayer *tape = DPGet(tab, &DPTapeKey);
        if (tape) tape.contents = (__bridge id)DPTapeStripes(DPWashiTapeRGBFor(tab.window));   // a new color shows at once
        DPTapeOn(tab);
    }
    for (NSView *item in DPFindViews(DPDiaPinnedTab)) item.needsLayout = YES;   // Scrapbook's tape on favorites follows
    DPDots(nil);
}

static NSString *DPVerifyWashiTape(DPPatch *patch) {
    NSUInteger taped = 0, selected = 0;
    for (NSView *tab in DPFindViews(DPDiaTabView)) {
        if (tab.hiddenOrHasHiddenAncestor) continue;
        BOOL sel = DPTapeTabSelected(tab);
        CALayer *tape = DPGet(tab, &DPTapeKey);
        selected += sel; taped += tape && tape.superlayer == tab.layer;
        if (!DPWashiLive(patch) && tape) return @"tape left on a tab";
    }
    if (DPWashiLive(patch) && selected && !taped) return @"selected tab has no tape";
    return nil;
}

DP_PATCH(DPWashiTape) {
    .key = @"washiTape",
    .order = 6,
    .title = @"Washi Tape",
    .detail = @"A strip of Washi tape on the selected tab, torn at the ends and stuck on at a tilt, and the space dots in each space’s tape. In Scrapbook, favorites get tape too.",
    .symbol = @"bandage.fill",
    .tint = @"systemPinkColor",
    .section = @"Sidebar",
    .requires = @"washiPaper",
    .rows = DPWashiArtTape,
    .classes = DPClasses(DPDiaTabView, DPDiaColorFill),
    .choice = @"washiTapeChoice",
    .defaultChoice = @"tangerine",
    .install = DPInstallWashiTape,
    .apply = DPApplyWashiTape,
    .verify = DPVerifyWashiTape,
};
