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
static NSHashTable<NSView *> *DPTaped, *DPDotItems;   // tabs wearing tape; the space dots seen so far

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
uint32_t DPWashiMainTapeRGB(void) { return DPTapeRGB(); }
// Washi's space palettes, as in Washi's Settings › Spaces: a desk (the paper the space sits on), its tape, and a
// highlight. In Washi's order around the color wheel.
typedef struct { NSString *key, *name; uint32_t desk, tape, s2; } DPPaletteChoice;
static const DPPaletteChoice DPPalettes[] = {
    { @"tangerine", @"Tangerine", 0xfdd3ae, 0xff6a3d, 0xffd84d }, { @"lime", @"Lime", 0xeaf3b4, 0x74b000, 0xff7aa8 },
    { @"clover", @"Clover", 0xd2eec6, 0x1f9d57, 0xffe14d }, { @"lagoon", @"Lagoon", 0xc6ede6, 0x0e9f9f, 0xff9370 },
    { @"blueberry", @"Blueberry", 0xcbd9f6, 0x3d63ff, 0xffd84d }, { @"grape", @"Grape", 0xe3d2f6, 0x7b46ff, 0xffd84d },
    { @"bubblegum", @"Bubblegum", 0xfdd1dc, 0xff3d8d, 0x7fe0c9 },
};
static const uint32_t DPMainHighlight = 0xffd84d;   // Washi's own highlight, for a space on the main look
NSUInteger DPWashiPaletteCount(void) { return sizeof DPPalettes / sizeof *DPPalettes; }
void DPWashiPaletteAt(NSUInteger i, NSString **key, NSString **name, uint32_t *desk, uint32_t *tape, uint32_t *s2) {
    if (key) *key = DPPalettes[i].key;
    if (name) *name = DPPalettes[i].name;
    if (desk) *desk = DPPalettes[i].desk;
    if (tape) *tape = DPPalettes[i].tape;
    if (s2) *s2 = DPPalettes[i].s2;
}

// A space's colors: its palette (`preset`), with any of desk, tape and highlight you set yourself on top. Saved as
// washiSpaceLooks { space: { preset, desk, tape, s2 } }. A space with none of it is on the main look (its tape may
// still come from the older washiSpaceTapes). Returns which of the three are the space's own: 1 desk, 2 tape, 4
// highlight; the rest are the main look's.
uint32_t DPWashiMainPaperRGB(BOOL dark);   // WashiPaper.m
NSDictionary *DPWashiSpaceLookOf(NSString *space) {
    if (!space) return nil;
    id v = [[DPWashiDefaults() dictionaryForKey:@"washiSpaceLooks"] objectForKey:space];
    return [v isKindOfClass:NSDictionary.class] && [v count] ? v : nil;
}
unsigned DPWashiSpaceColors(NSString *space, uint32_t *desk, uint32_t *tape, uint32_t *s2) {
    NSDictionary *look = DPWashiSpaceLookOf(space);
    const DPPaletteChoice *pal = NULL;
    for (size_t i = 0; i < DPWashiPaletteCount(); i++) if ([DPPalettes[i].key isEqual:look[@"preset"]]) pal = &DPPalettes[i];
    NSString *oldTape = DPWashiSpaceTape(space);
    unsigned own = pal ? 7 : oldTape ? 2 : 0;
    uint32_t d = pal ? pal->desk : DPWashiMainPaperRGB(NO), t = pal ? pal->tape : oldTape ? DPTapeRGBForKey(oldTape) : DPTapeRGB(), h = pal ? pal->s2 : DPMainHighlight;
    NSArray *keys = @[ @"desk", @"tape", @"s2" ];
    for (unsigned k = 0; k < 3; k++) {
        id c = look[keys[k]];
        if (![c isKindOfClass:NSNumber.class]) continue;
        own |= 1u << k;
        if (k == 0) d = [c unsignedIntValue]; else if (k == 1) t = [c unsignedIntValue]; else h = [c unsignedIntValue];
    }
    if (desk) *desk = d;
    if (tape) *tape = t;
    if (s2) *s2 = h;
    return own;
}
// A window's tape: its space's own color, if it has one, else the main tape.
uint32_t DPWashiTapeRGBFor(NSWindow *window) {
    uint32_t tape; DPWashiSpaceColors(DPWashiSpaceOf(window), NULL, &tape, NULL);
    return tape;
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
    BOOL want = DPWashiScrap() && DPTapeTabSelected(tab)   // tape is Scrapbook's, as in Washi
                && !tab.hiddenOrHasHiddenAncestor;
    if (!want) {
        if (tape) { [tape removeFromSuperlayer]; DPSet(tab, &DPTapeKey, nil); [DPTaped removeObject:tab]; }
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
    // On the corner of the tab's pill, not of its whole row (which runs to the window's edge): like Washi, it hangs off
    // the pill's top edge, its middle 17pt in (so its end stays clear of the window's edge) and 2.5pt down.
    NSRect pill = DPTapePill(tab);
    CGFloat top = tab.isFlipped ? NSMinY(pill) : NSMaxY(pill);
    // The first tab in the list: the list's own top edge would cut the tape, so it sits lower and leans less.
    NSView *cell = tab.superview;
    BOOL first = cell.superview.isFlipped ? NSMinY(cell.frame) < 4 : NSMaxY(cell.frame) > NSHeight(cell.superview.bounds) - 4;
    CGFloat inset = first ? 7 : 2.5;
    tape.position = CGPointMake(NSMinX(pill) + 17, top + (tab.isFlipped ? inset : -inset));
    tape.affineTransform = CGAffineTransformMakeRotation((flipped ? -1 : 1) * (first ? 12 : 20) * M_PI / 180);
    if (tape.superlayer != tab.layer) [tab.layer addSublayer:tape];
    if (!DPTaped) DPTaped = [NSHashTable weakObjectsHashTable];
    [DPTaped addObject:tab];
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


static void DPTapeTab_layout(NSView *self, SEL _cmd) {
    DPCallOriginal(DPTapeTab_layout, self);
    DPTapeOn(self);
}

// Picking a tab doesn't lay the tabs out again, but it does repaint the selection fill: the cue to move the tape.
static void DPTapeFill_updateLayer(NSView *self, SEL _cmd) {
    DPCallOriginal(DPTapeFill_updateLayer, self);
    if (!DPWashiLive(&DPWashiTape)) return;
    // Only a fill inside a tab matters: that tab, and the ones wearing tape now (one of them is losing it).
    NSView *tab = self.superview;
    for (int i = 0; tab && i < 6 && !DPIsKind(tab, DPDiaTabView); i++) tab = tab.superview;
    if (!DPIsKind(tab, DPDiaTabView)) return;
    dispatch_async(dispatch_get_main_queue(), ^{
        DPTapeOn(tab);
        for (NSView *other in DPTaped.allObjects) if (other != tab) DPTapeOn(other);
    });
}

#pragma mark The space dots

// The dots at the bottom of the sidebar, one per space, take each space's tape: the one you're in in full, the others
// faded into the paper. Ours sit exactly over Dia's, so Dia's clicks and hover still work.
static char DPDotKey, DPDotWatchKey;
NSColor *DPWashiPaperColor(BOOL dark);   // WashiPaper.m

static uint32_t DPTapeRGBForSpace(NSString *space) {
    uint32_t tape; DPWashiSpaceColors(space, NULL, &tape, NULL);
    return tape;
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
    extern uint32_t DPWashiDeskRGBFor(NSWindow *window, BOOL dark);
    NSColor *color = here ? tape : [DPWashiRGB(DPWashiDeskRGBFor(item.window, dark)) blendedColorWithFraction:.45 ofColor:tape];
    [CATransaction begin]; [CATransaction setDisableActions:YES];
    dot.layer.cornerRadius = NSHeight(dia.frame) / 2;
    dot.layer.backgroundColor = color.CGColor;
    [CATransaction commit];
}

static void DPDots(NSWindow *window) {
    for (NSView *item in DPDotItems.allObjects) if (!window || item.window == window) DPDotOn(item);
}

// A new space in the window title: its tab's tape and the dots follow.
@interface DPWashiTapeWatcher : NSObject
@property (nonatomic, weak) NSWindow *window;
@property (nonatomic, copy) NSString *space;
@end
@implementation DPWashiTapeWatcher
- (void)observeValueForKeyPath:(NSString *)keyPath ofObject:(id)object change:(NSDictionary *)change context:(void *)context {
    // The title changes with every page; only a new space matters here.
    NSString *space = DPWashiSpaceOf(self.window);
    if ([space isEqual:self.space] || (!space && !self.space)) return;
    self.space = space;
    dispatch_async(dispatch_get_main_queue(), ^{
        if (!DPWashiLive(&DPWashiTape)) return;
        DPDots(self.window);
        for (NSView *tab in DPTaped.allObjects) if (tab.window == self.window) DPTapeOn(tab);
    });
}
- (void)dealloc { [_window removeObserver:self forKeyPath:@"title"]; }
@end

static void DPDot_layout(NSView *self, SEL _cmd) {
    DPCallOriginal(DPDot_layout, self);
    if (!DPDotItems) DPDotItems = [NSHashTable weakObjectsHashTable];
    [DPDotItems addObject:self];
    DPDotOn(self);
    NSWindow *window = self.window;
    if (window && !DPGet(window, &DPDotWatchKey)) {
        DPWashiTapeWatcher *watcher = [DPWashiTapeWatcher new];
        watcher.window = window;
        watcher.space = DPWashiSpaceOf(window);
        [window addObserver:watcher forKeyPath:@"title" options:0 context:NULL];
        DPSet(window, &DPDotWatchKey, watcher);
    }
}

// For the Spaces list on Washi's page: the spaces in the switcher, in its order.
static NSArray<NSString *> *DPFakeSpaces;   // for drawing Washi's page with no Dia around (tools/drawings.m)
void DPWashiFakeSpaces(NSArray<NSString *> *spaces) { DPFakeSpaces = spaces; }
NSArray<NSString *> *DPWashiSpaces(void) {
    if (DPFakeSpaces) return DPFakeSpaces;
    NSMutableArray *spaces = [NSMutableArray new];
    for (NSView *item in DPDotItems.allObjects) {
        if (!item.window.isVisible) continue;
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

void DPWashiRefreshAll(DPPatch *from);   // WashiPaper.m
static void DPApplyWashiTape(DPPatch *patch) {
    DPWashiRefreshAll(patch);   // tape is on the field, the bars, pop-ups, the ticket… too
    for (NSView *tab in DPFindViews(DPDiaTabView)) {
        CALayer *tape = DPGet(tab, &DPTapeKey);
        if (tape) tape.contents = (__bridge id)DPTapeStripes(DPWashiTapeRGBFor(tab.window));   // a new color shows at once
        DPTapeOn(tab);
    }
    for (NSView *item in DPFindViews(DPDiaPinnedTab)) item.needsLayout = YES;   // Scrapbook's tape on favorites follows
    for (NSView *item in DPFindViews(DPDiaSpaceSwitcherItem)) { if (!DPDotItems) DPDotItems = [NSHashTable weakObjectsHashTable]; [DPDotItems addObject:item]; }
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
    .detail = @"Washi’s striped tape, torn at the ends, in Scrapbook: on the selected tab, favorites, the address field, the command bar, pop-ups and the ticket. And the space dots in each space’s tape.",
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
