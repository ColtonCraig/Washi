#import "StdPatch/StdPatch.h"

// Washi Cards: the selected tab and the pinned favorites become scraps of Washi's card paper, the paper mixed toward
// white with a faint ink edge and Washi's "cut" shadow (a hard offset, like paper cut out and laid on the desk, over a
// soft one). They take the paper Washi Paper uses, light and dark. The selected tab stops taking the site's color,
// as in Washi, so its title goes back to the sidebar's ink.

extern DPPatch DPWashiCards;
NSColor *DPWashiPaperColor(BOOL dark);   // WashiPaper.m

#define DPTabBackground "_TtC5TabUI17TabBackgroundView"
#define DPDebossed      "_TtC5TabUI12DebossedView"
static char DPCardKey, DPShadowKey, DPAppearanceKey;

static BOOL DPCardDark(NSView *view) {
    return [[view.effectiveAppearance bestMatchFromAppearancesWithNames:@[ NSAppearanceNameAqua, NSAppearanceNameDarkAqua ]] isEqual:NSAppearanceNameDarkAqua];
}

// Washi's --white: the paper 72% of the way to white in light, 8% in dark.
static NSColor *DPCardColor(BOOL dark) {
    NSColor *paper = [DPWashiPaperColor(dark) colorUsingColorSpace:NSColorSpace.sRGBColorSpace];
    return [paper blendedColorWithFraction:dark ? .08 : .72 ofColor:NSColor.whiteColor];
}

@interface DPWashiCardFill : NSView
@end
@implementation DPWashiCardFill
- (instancetype)initWithFrame:(NSRect)frame {
    if ((self = [super initWithFrame:frame])) {
        self.wantsLayer = YES;
        self.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
        self.layer.cornerRadius = 10;
        self.layer.borderWidth = 1;
        [self paint];
    }
    return self;
}
- (NSView *)hitTest:(NSPoint)point { return nil; }
- (void)paint {
    BOOL dark = DPCardDark(self);
    [CATransaction begin]; [CATransaction setDisableActions:YES];
    self.layer.backgroundColor = DPCardColor(dark).CGColor;
    self.layer.borderColor = (dark ? [NSColor colorWithWhite:1 alpha:.07] : [NSColor colorWithSRGBRed:43 / 255.0 green:33 / 255.0 blue:24 / 255.0 alpha:.08]).CGColor;
    [CATransaction commit];
}
- (void)viewDidChangeEffectiveAppearance { [super viewDidChangeEffectiveAppearance]; [self paint]; }
@end

// The shadow sits under the card, outside the rounded clip the card lives in: a hard offset and a soft one.
@interface DPWashiCardShadow : NSView
@property (nonatomic) CGFloat lift;   // 1 for a tab (Washi's --cut-sm), 2 for a favorite (--cut)
@end
@implementation DPWashiCardShadow {
    CALayer *_soft;
}
- (instancetype)initWithFrame:(NSRect)frame {
    if ((self = [super initWithFrame:frame])) {
        self.wantsLayer = YES;
        _soft = [CALayer layer];
        [self.layer addSublayer:_soft];
    }
    return self;
}
- (NSView *)hitTest:(NSPoint)point { return nil; }
- (BOOL)isFlipped { return NO; }
- (void)paint {
    BOOL dark = DPCardDark(self);
    CGColorRef ink = (dark ? NSColor.blackColor : [NSColor colorWithSRGBRed:43 / 255.0 green:33 / 255.0 blue:24 / 255.0 alpha:1]).CGColor;
    CGPathRef path = CGPathCreateWithRoundedRect(self.bounds, 10, 10, NULL);
    [CATransaction begin]; [CATransaction setDisableActions:YES];
    CALayer *hard = self.layer;
    hard.shadowPath = path; hard.shadowColor = ink; hard.shadowRadius = 0;
    hard.shadowOffset = CGSizeMake(self.lift, -self.lift);
    hard.shadowOpacity = dark ? .4 : (self.lift > 1 ? .12 : .14);
    _soft.frame = self.bounds;
    _soft.shadowPath = path; _soft.shadowColor = ink;
    _soft.shadowRadius = self.lift > 1 ? 7 : 1.5;
    _soft.shadowOffset = CGSizeMake(0, self.lift > 1 ? -4 : -1);
    _soft.shadowOpacity = dark ? .3 : .08;
    [CATransaction commit];
    CGPathRelease(path);
}
- (void)layout { [super layout]; [self paint]; }
- (void)viewDidChangeEffectiveAppearance { [super viewDidChangeEffectiveAppearance]; [self paint]; }
@end

static NSView *DPCardAncestor(NSView *view, const char *kind) {
    for (NSView *up = view.superview; up; up = up.superview) if (DPIsKind(up, kind)) return up;
    return nil;
}

// A card inside `inside` (just above `above`, or on top), and its shadow in `host` just below `under`.
static void DPCardIn(NSView *inside, NSView *above, NSView *host, NSView *under, CGFloat lift, BOOL want) {
    DPWashiCardFill *card = DPGet(inside, &DPCardKey);
    DPWashiCardShadow *shadow = DPGet(host, &DPShadowKey);
    if (!want) {
        if (card) { [card removeFromSuperview]; DPSet(inside, &DPCardKey, nil); }
        if (shadow) { [shadow removeFromSuperview]; DPSet(host, &DPShadowKey, nil); }
        return;
    }
    if (!card) { card = [[DPWashiCardFill alloc] initWithFrame:inside.bounds]; DPSet(inside, &DPCardKey, card); }
    if (card.superview != inside) {
        if (above) [inside addSubview:card positioned:NSWindowAbove relativeTo:above];
        else [inside addSubview:card];
    }
    if (!NSEqualRects(card.frame, inside.bounds)) card.frame = inside.bounds;
    if (!shadow) { shadow = [DPWashiCardShadow new]; shadow.lift = lift; DPSet(host, &DPShadowKey, shadow); }
    if (shadow.superview != host) [host addSubview:shadow positioned:NSWindowBelow relativeTo:under];
    NSRect frame = [under convertRect:under.bounds toView:host];
    if (!NSEqualRects(shadow.frame, frame)) shadow.frame = frame;
    shadow.hidden = under.hidden;
}

// Dia gives the selected tab the appearance of the site's color, so a dark site's title is light. On paper it goes
// back to the sidebar's; Dia's comes back with the patch off.
static void DPCardAppearance(NSView *tab, BOOL plain) {
    for (NSView *part in tab.subviews) {
        if (plain && part.appearance) { DPSet(part, &DPAppearanceKey, part.appearance); part.appearance = nil; }
        else if (!plain) { NSAppearance *dia = DPGet(part, &DPAppearanceKey); if (dia) { part.appearance = dia; DPSet(part, &DPAppearanceKey, nil); } }
    }
}

// The selected tab: its shape (shown only while it's selected) holds the fill; the card goes on top of that fill.
static void DPCardTab(NSView *shape) {
    NSView *tab = DPCardAncestor(shape, DPDiaTabView), *background = shape.superview;
    if (!tab || !DPIsKind(background, DPTabBackground)) return;
    NSView *fill = shape.subviews.lastObject;   // ARCUI.FlippedView, holding the site's color
    for (NSView *sub in shape.subviews) if (!DPIsKind(sub, "_TtC5TabUIP33_903BE4B7F5DFD8B21A7A465D1A9EF8E416RimHighlightView") && ![sub isKindOfClass:DPWashiCardFill.class]) fill = sub;
    if (!fill) return;
    BOOL on = DPWashiCards.on;
    DPCardIn(fill, nil, background, shape, 1, on);
    DPCardAppearance(tab, on && !shape.hidden);
}

// A pinned favorite: its card covers the debossed well, under the icon.
static void DPCardTile(NSView *item) {
    NSView *clip = nil, *well = nil;
    for (NSView *sub in item.subviews) for (NSView *inner in sub.subviews) if (DPIsKind(inner, DPDebossed)) { clip = sub; well = inner; }
    if (!clip) return;
    DPCardIn(clip, well, item, clip, 2, DPWashiCards.on);
}

static void DPCardShape_layout(NSView *self, SEL _cmd) {
    DPCallOriginal(DPCardShape_layout, self);
    DPCardTab(self);
}
static void DPCardShape_setHidden(NSView *self, SEL _cmd, BOOL hidden) {
    DPCallOriginal(DPCardShape_setHidden, self, hidden);
    DPCardTab(self);
}
static void DPCardTile_layout(NSView *self, SEL _cmd) {
    DPCallOriginal(DPCardTile_layout, self);
    DPCardTile(self);
}
// Dia puts the site's appearance back each time it repaints the selected tab's color.
static void DPCardFill_updateLayer(NSView *self, SEL _cmd) {
    DPCallOriginal(DPCardFill_updateLayer, self);
    if (!DPWashiCards.on) return;
    NSView *shape = DPCardAncestor(self, DPDiaTabShape);
    if (shape) DPCardTab(shape);
}

static void DPInstallWashiCards(void) {
    DPHook(DPDiaTabShape, @selector(layout), (IMP)DPCardShape_layout);
    DPHook(DPDiaTabShape, @selector(setHidden:), (IMP)DPCardShape_setHidden);
    DPHook(DPDiaPinnedTab, @selector(layout), (IMP)DPCardTile_layout);
    DPHook(DPDiaColorFill, @selector(updateLayer), (IMP)DPCardFill_updateLayer);
}

static void DPApplyWashiCards(DPPatch *patch) {
    for (NSView *shape in DPFindViews(DPDiaTabShape)) DPCardTab(shape);
    for (NSView *item in DPFindViews(DPDiaPinnedTab)) DPCardTile(item);
    // A new paper shows at once.
    for (NSView *shape in DPFindViews(DPDiaTabShape)) DPFindView(shape, ^BOOL(NSView *v) { if ([v isKindOfClass:DPWashiCardFill.class]) [(DPWashiCardFill *)v paint]; return NO; });
    for (NSView *item in DPFindViews(DPDiaPinnedTab)) DPFindView(item, ^BOOL(NSView *v) { if ([v isKindOfClass:DPWashiCardFill.class]) [(DPWashiCardFill *)v paint]; return NO; });
}

static NSString *DPVerifyWashiCards(DPPatch *patch) {
    for (NSView *item in DPFindViews(DPDiaPinnedTab)) {
        BOOL has = DPFindView(item, ^BOOL(NSView *v) { return [v isKindOfClass:DPWashiCardFill.class]; }) != nil;
        if (has != patch->on) return patch->on ? @"a favorite has no card" : @"a card left on a favorite";
    }
    for (NSView *shape in DPFindViews(DPDiaTabShape)) {
        if (shape.hiddenOrHasHiddenAncestor || !DPCardAncestor(shape, DPDiaTabView)) continue;
        BOOL has = DPFindView(shape, ^BOOL(NSView *v) { return [v isKindOfClass:DPWashiCardFill.class]; }) != nil;
        if (has != patch->on) return patch->on ? @"the selected tab has no card" : @"a card left on a tab";
    }
    return nil;
}

DP_PATCH(DPWashiCards) {
    .key = @"washiCards",
    .order = 7,
    .title = @"Washi Cards",
    .detail = @"The selected tab and your favorites as scraps of Washi card paper, with Washi’s cut-paper shadow.",
    .symbol = @"rectangle.on.rectangle.angled.fill rectangle.on.rectangle",
    .tint = @"systemBrownColor",
    .section = @"Washi",
    .classes = DPClasses(DPDiaTabShape, DPDiaTabView, DPDiaPinnedTab, DPDiaColorFill, DPTabBackground, DPDebossed),
    .install = DPInstallWashiCards,
    .apply = DPApplyWashiCards,
    .verify = DPVerifyWashiCards,
};
