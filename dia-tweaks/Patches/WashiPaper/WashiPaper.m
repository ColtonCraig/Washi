#import "StdPatch/StdPatch.h"

// Washi Paper: Washi's paper behind Dia's tabs and sidebar, the paper color with a fine grain on it, in place of the
// theme color. Light and dark each get their Washi paper (Cream and Cocoa, Newsprint and Ink, and so on), following
// the window's appearance. It sits just above Dia's theme tint, so everything Dia draws on top stays as it is.

extern DPPatch DPWashiPaper;
NSArray<NSView *> *DPWashiLookRows(void);   // WashiLook.m
void DPWashiApplyAppearance(void);
static char DPPaperKey;

typedef struct { NSString *key, *name; uint32_t light, dark; } DPPaperChoice;
static const DPPaperChoice DPPapers[] = {
    { @"cream", @"Cream and Cocoa", 0xfbf6ea, 0x2b2520 },
    { @"news", @"Newsprint and Ink", 0xf1f0ea, 0x1c1c1e },
    { @"blush", @"Blush and Plum", 0xfff0ee, 0x2c2133 },
    { @"mint", @"Mint and Forest", 0xedf9f0, 0x1e2a24 },
    { @"sky", @"Sky and Midnight", 0xeef4ff, 0x22273a },
};

// The paper in the chosen look, for the other Washi tweaks (cards are this paper mixed toward white). Cream when
// Washi Paper is off, since that's Washi's own paper.
NSColor *DPWashiPaperColor(BOOL dark) {
    NSString *key = DPWashiPaper.on ? (DPChoice(&DPWashiPaper) ?: @"cream") : @"cream";
    DPPaperChoice paper = DPPapers[0];
    for (size_t i = 0; i < sizeof DPPapers / sizeof *DPPapers; i++) if ([DPPapers[i].key isEqual:key]) paper = DPPapers[i];
    uint32_t rgb = dark ? paper.dark : paper.light;
    return [NSColor colorWithSRGBRed:((rgb >> 16) & 255) / 255.0 green:((rgb >> 8) & 255) / 255.0 blue:(rgb & 255) / 255.0 alpha:1];
}

// For the Washi look picker: the papers, in order.
NSUInteger DPWashiPaperCount(void) { return sizeof DPPapers / sizeof *DPPapers; }
void DPWashiPaperAt(NSUInteger i, NSString **key, NSString **name, uint32_t *light, uint32_t *dark) {
    if (key) *key = DPPapers[i].key;
    if (name) *name = DPPapers[i].name;
    if (light) *light = DPPapers[i].light;
    if (dark) *dark = DPPapers[i].dark;
}

static NSColor *DPHex(uint32_t rgb) {
    return [NSColor colorWithSRGBRed:((rgb >> 16) & 255) / 255.0 green:((rgb >> 8) & 255) / 255.0 blue:(rgb & 255) / 255.0 alpha:1];
}

// The grain: soft speckles, made once per look. Drawn as a pattern so it tiles at any size and scale. Light paper
// gets dark fibres (multiplied in); dark paper gets pale ones laid on top, since darkening dark paper shows nothing.
static NSImage *DPGrain(BOOL dark) {
    static NSImage *grains[2];
    if (grains[dark]) return grains[dark];
    const int size = 160;
    NSBitmapImageRep *rep = [[NSBitmapImageRep alloc] initWithBitmapDataPlanes:NULL pixelsWide:size pixelsHigh:size bitsPerSample:8
        samplesPerPixel:4 hasAlpha:YES isPlanar:NO colorSpaceName:NSDeviceRGBColorSpace bytesPerRow:size * 4 bitsPerPixel:32];
    uint8_t *px = rep.bitmapData;
    for (int i = 0; i < size * size; i++) {
        uint32_t r = arc4random_uniform(1000);
        uint8_t a, v;
        if (dark) { a = r < 60 ? 24 : r < 260 ? 10 : 0; v = r < 60 ? 255 : 220; }   // a few bright fibres, more faint ones
        else      { a = r < 60 ? 34 : r < 260 ? 14 : 0; v = r < 60 ? 60 : 90; }     // a few darker fibres, more faint ones
        uint8_t c[3] = { v, (uint8_t)(v * .93), (uint8_t)(v * .8) };
        for (int k = 0; k < 3; k++) px[i * 4 + k] = (uint8_t)(c[k] * a / 255);       // premultiplied
        px[i * 4 + 3] = a;
    }
    NSImage *g = [[NSImage alloc] initWithSize:NSMakeSize(size / 2, size / 2)];      // 2x: crisp on Retina
    [g addRepresentation:rep];
    return grains[dark] = g;
}

@interface DPWashiPaperView : NSView
- (void)paint;
@end

@implementation DPWashiPaperView {
    CALayer *_grain;
}
- (instancetype)initWithFrame:(NSRect)frame {
    if ((self = [super initWithFrame:frame])) {
        self.wantsLayer = YES;
        self.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
        _grain = [CALayer layer];
        _grain.autoresizingMask = kCALayerWidthSizable | kCALayerHeightSizable;
        [self.layer addSublayer:_grain];
        [self paint];
    }
    return self;
}
- (NSView *)hitTest:(NSPoint)point { return nil; }                       // never in the way of a click
- (BOOL)isDark {
    return [[self.effectiveAppearance bestMatchFromAppearancesWithNames:@[ NSAppearanceNameAqua, NSAppearanceNameDarkAqua ]] isEqual:NSAppearanceNameDarkAqua];
}
- (void)paint {
    NSString *key = DPChoice(&DPWashiPaper) ?: @"cream";
    DPPaperChoice paper = DPPapers[0];
    for (size_t i = 0; i < sizeof DPPapers / sizeof *DPPapers; i++) if ([DPPapers[i].key isEqual:key]) paper = DPPapers[i];
    BOOL dark = self.isDark;
    [NSAnimationContext runAnimationGroup:^(NSAnimationContext *ctx) {
        ctx.duration = 0;
        self.layer.backgroundColor = DPHex(dark ? paper.dark : paper.light).CGColor;
        self->_grain.frame = self.layer.bounds;
        self->_grain.backgroundColor = [NSColor colorWithPatternImage:DPGrain(dark)].CGColor;
        self->_grain.opacity = 1;
        self->_grain.compositingFilter = dark ? nil : @"multiplyBlendMode";
    }];
}
- (void)viewDidChangeEffectiveAppearance { [super viewDidChangeEffectiveAppearance]; [self paint]; }
- (void)layout { [super layout]; _grain.frame = self.layer.bounds; }
@end

// For the other Washi tweaks: a sheet of this paper (it follows its own appearance), and a repaint for a new choice.
NSView *DPWashiPaperMake(NSRect frame) { return [[DPWashiPaperView alloc] initWithFrame:frame]; }
BOOL DPIsWashiPaperView(NSView *view) { return [view isKindOfClass:DPWashiPaperView.class]; }
void DPWashiPaperRepaint(NSView *view) { if (DPIsWashiPaperView(view)) [(DPWashiPaperView *)view paint]; }

// The theme tint behind one window or the floating sidebar (the same lookup Window Material uses).
static NSView *DPPaperTintIn(NSView *view) {
    for (NSView *sub in view.subviews)
        for (NSView *inner in sub.subviews) if (DPIsKind(inner, DPDiaWindowTint)) return inner;
    return nil;
}

static void DPPaperOver(NSView *tint) {
    NSView *host = tint.superview;
    if (!host) return;
    DPWashiPaperView *paper = DPGet(host, &DPPaperKey);
    if (!DPWashiPaper.on) {
        if (paper) { [paper removeFromSuperview]; DPSet(host, &DPPaperKey, nil); }
        return;
    }
    if (!paper) {
        paper = [[DPWashiPaperView alloc] initWithFrame:host.bounds];
        DPSet(host, &DPPaperKey, paper);
    }
    if (paper.superview != host || [host.subviews indexOfObject:paper] != [host.subviews indexOfObject:tint] + 1)
        [host addSubview:paper positioned:NSWindowAbove relativeTo:tint];
    if (!NSEqualRects(paper.frame, host.bounds)) paper.frame = host.bounds;
}

static NSArray<NSView *> *DPPaperHosts(void) {
    NSMutableArray *hosts = [NSMutableArray array];
    for (NSWindow *window in NSApp.windows) if (DPIsKind(window.contentView.superview, DPDiaWindowFrame)) [hosts addObject:window.contentView.superview];
    [hosts addObjectsFromArray:DPFindViews(DPDiaFloatingSidebar)];
    return hosts;
}

static void DPPaperFrame_layout(NSView *self, SEL _cmd) {
    DPCallOriginal(DPPaperFrame_layout, self);
    NSView *tint = DPPaperTintIn(self);
    if (tint) DPPaperOver(tint);
}

static void DPPaperSidebar_layout(NSView *self, SEL _cmd) {
    DPCallOriginal(DPPaperSidebar_layout, self);
    NSView *tint = DPPaperTintIn(self);
    if (tint) DPPaperOver(tint);
}

// Everything the Washi tweaks drew follows a new paper or tape at once.
void DPWashiRepaintAll(void) {
    for (NSWindow *window in NSApp.windows) {
        NSView *root = window.contentView.superview ?: window.contentView;
        if (!root) continue;
        DPFindView(root, ^BOOL(NSView *view) {
            if ([NSStringFromClass(view.class) hasPrefix:@"DPWashi"] && [view respondsToSelector:@selector(paint)]) [(id)view paint];
            return NO;
        });
    }
}

static void DPApplyWashiPaper(DPPatch *patch) {
    for (NSView *host in DPPaperHosts()) {
        NSView *tint = DPPaperTintIn(host);
        if (!tint) continue;
        DPPaperOver(tint);
        [(DPWashiPaperView *)DPGet(tint.superview, &DPPaperKey) paint];
    }
    // Washi is one switch: its options follow it, and a new paper repaints everything Washi drew.
    for (NSUInteger k = 0; k < DPPatchCount; k++) {
        DPPatch *option = DPPatches[k];
        if (option != patch && DPRequired(option) == patch && option->apply && !option->unavailable) option->apply(option);
    }
    DPWashiApplyAppearance();
    DPWashiRepaintAll();
}

static NSString *DPVerifyWashiPaper(DPPatch *patch) {
    for (NSView *host in DPPaperHosts()) {
        NSView *tint = DPPaperTintIn(host);
        if (!tint) return @"no theme color to cover";
        BOOL has = NO;
        for (NSView *sub in tint.superview.subviews) if ([sub isKindOfClass:DPWashiPaperView.class]) has = YES;
        if (has != patch->on) return patch->on ? @"no paper behind the window" : @"paper left behind";
    }
    return nil;
}

static void DPInstallWashiPaper(void) {
    DPHook(DPDiaWindowFrame, @selector(layout), (IMP)DPPaperFrame_layout);
    DPHook(DPDiaFloatingSidebar, @selector(layout), (IMP)DPPaperSidebar_layout);
    dispatch_async(dispatch_get_main_queue(), ^{ DPWashiApplyAppearance(); });   // Light, Dark or Match my Mac, from the look picker
}

DP_PATCH(DPWashiPaper) {
    .key = @"washiPaper",
    .order = 5,
    .title = @"Washi",
    .detail = @"Washi’s look in Dia: its paper and grain behind everything, with cards, tape and handwriting as options below. Pick your paper and tape here.",
    .symbol = @"doc.richtext.fill doc.fill",
    .tint = @"systemOrangeColor",
    .section = @"Washi",
    .classes = DPClasses(DPDiaWindowFrame, DPDiaWindowTint, DPDiaFloatingSidebar),
    .disabledBy = @"windowMaterial",   // a material or glass shows instead
    .choice = @"washiPaperChoice",
    .defaultChoice = @"cream",
    .rows = DPWashiLookRows,
    .install = DPInstallWashiPaper,
    .apply = DPApplyWashiPaper,
    .verify = DPVerifyWashiPaper,
};
