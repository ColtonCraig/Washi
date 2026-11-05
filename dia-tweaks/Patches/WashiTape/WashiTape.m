#import "StdPatch/StdPatch.h"

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

static NSMenu *DPTapeChoices(void) {
    NSMenu *menu = [[NSMenu alloc] initWithTitle:@"Tape"];
    for (size_t i = 0; i < sizeof DPTapes / sizeof *DPTapes; i++)
        [menu addItemWithTitle:DPTapes[i].name action:nil keyEquivalent:@""].representedObject = DPTapes[i].key;
    return menu;
}

static uint32_t DPTapeRGB(void) {
    NSString *key = DPChoice(&DPWashiTape) ?: @"tangerine";
    for (size_t i = 0; i < sizeof DPTapes / sizeof *DPTapes; i++) if ([DPTapes[i].key isEqual:key]) return DPTapes[i].rgb;
    return DPTapes[0].rgb;
}

// The stripes: the tape color, and the tape color 62% of the way to white, 6pt each at -45°, like Washi's CSS.
static CGImageRef DPTapeStripes(uint32_t rgb) {
    static CGImageRef cached; static uint32_t cachedRGB = 0xffffffff;
    if (cached && cachedRGB == rgb) return cached;
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
    if (cached) CGImageRelease(cached);
    cached = CGBitmapContextCreateImage(ctx); cachedRGB = rgb;
    CGContextRelease(ctx); CGColorSpaceRelease(space);
    return cached;
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

static BOOL DPTapeTabSelected(NSView *tab) {
    if (![tab respondsToSelector:@selector(safeSwiftValueForKey:)]) return NO;
    NSString *state = [[[[tab safeSwiftValueForKey:@"viewModel"] safeSwiftValueForKey:@"stateSubject"] safeSwiftValueForKey:@"currentValue"] description];
    NSRange at = [state rangeOfString:@"selectionStyle: "];
    if (at.location == NSNotFound) return NO;
    NSString *style = [state substringFromIndex:NSMaxRange(at)];
    return ![style hasPrefix:@"nil"] && ![style hasPrefix:@"none"] && ![style hasPrefix:@"above"] && ![style hasPrefix:@"below"];
}

static BOOL DPCalm(void) { return NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion; }

static void DPTapeOn(NSView *tab) {
    if (!tab.layer) return;
    CALayer *tape = DPGet(tab, &DPTapeKey);
    BOOL want = DPWashiTape.on && DPTapeTabSelected(tab) && !tab.hiddenOrHasHiddenAncestor;
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
    tape.contents = (__bridge id)DPTapeStripes(DPTapeRGB());
    // Its middle sits 13pt in and 5pt down from the tab's top-left corner, inside the tab so nothing clips it.
    CGFloat h = tab.layer.bounds.size.height;
    tape.position = CGPointMake(13, flipped ? 5 : h - 5);
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
    if (!DPWashiTape.on) return;
    static BOOL queued;
    if (queued) return;
    queued = YES;
    dispatch_async(dispatch_get_main_queue(), ^{ queued = NO; DPTapeAll(); });
}

static void DPInstallWashiTape(void) {
    DPHook(DPDiaTabView, @selector(layout), (IMP)DPTapeTab_layout);
    DPHook(DPDiaColorFill, @selector(updateLayer), (IMP)DPTapeFill_updateLayer);
}

static void DPApplyWashiTape(DPPatch *patch) {
    for (NSView *tab in DPFindViews(DPDiaTabView)) {
        CALayer *tape = DPGet(tab, &DPTapeKey);
        if (tape) tape.contents = (__bridge id)DPTapeStripes(DPTapeRGB());   // a new color shows at once
        DPTapeOn(tab);
    }
}

static NSString *DPVerifyWashiTape(DPPatch *patch) {
    NSUInteger taped = 0, selected = 0;
    for (NSView *tab in DPFindViews(DPDiaTabView)) {
        if (tab.hiddenOrHasHiddenAncestor) continue;
        BOOL sel = DPTapeTabSelected(tab);
        CALayer *tape = DPGet(tab, &DPTapeKey);
        selected += sel; taped += tape && tape.superlayer == tab.layer;
        if (!patch->on && tape) return @"tape left on a tab";
    }
    if (patch->on && selected && !taped) return @"selected tab has no tape";
    return nil;
}

DP_PATCH(DPWashiTape) {
    .key = @"washiTape",
    .order = 6,
    .title = @"Washi Tape",
    .detail = @"A strip of Washi tape on the selected tab, torn at the ends and stuck on at a tilt.",
    .symbol = @"bandage.fill",
    .tint = @"systemPinkColor",
    .section = @"Washi",
    .classes = DPClasses(DPDiaTabView, DPDiaColorFill),
    .choice = @"washiTapeChoice",
    .defaultChoice = @"tangerine",
    .choices = DPTapeChoices,
    .install = DPInstallWashiTape,
    .apply = DPApplyWashiTape,
    .verify = DPVerifyWashiTape,
};
