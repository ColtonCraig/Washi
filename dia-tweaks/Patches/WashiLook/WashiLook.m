#import "StdPatch/StdPatch.h"
#import "Patches/WashiShared/WashiShared.h"

// The Washi look picker, on Washi's Settings page: one place for every color, like Washi's own Settings › Look.
// A little Dia drawn in your paper, light and dark side by side, with a key saying which color goes where; then the
// papers (each light and dark together) and the tapes. A click changes Dia at once, and the drawing with it.

extern DPPatch DPWashiTape;
NSUInteger DPWashiPaperCount(void);
void DPWashiPaperAt(NSUInteger i, NSString **key, NSString **name, uint32_t *light, uint32_t *dark);
NSUInteger DPWashiTapeCount(void);
void DPWashiTapeAt(NSUInteger i, NSString **key, NSString **name, uint32_t *rgb);
NSFont *DPCaveat(CGFloat size);
NSFont *DPWashiFigtree(CGFloat size, NSFontWeight weight);   // WashiType.m
NSArray<NSString *> *DPWashiSpaces(void);   // WashiTape.m
NSUInteger DPWashiPaletteCount(void);
void DPWashiPaletteAt(NSUInteger i, NSString **key, NSString **name, uint32_t *desk, uint32_t *tape, uint32_t *s2);
NSDictionary *DPWashiSpaceLookOf(NSString *space);
uint32_t DPWashiMainPaperRGB(BOOL dark);    // WashiPaper.m
uint32_t DPWashiMainTapeRGB(void);
void DPWashiShowGuide(void);                // WashiGuide.m

static NSColor *DPLookHex(uint32_t rgb) {
    return [NSColor colorWithSRGBRed:((rgb >> 16) & 255) / 255.0 green:((rgb >> 8) & 255) / 255.0 blue:(rgb & 255) / 255.0 alpha:1];
}
static NSColor *DPLookInk(BOOL dark) { return DPLookHex(dark ? 0xf3ece2 : 0x2b2118); }
static NSColor *DPLookCard(NSColor *paper, BOOL dark) {
    return [[paper colorUsingColorSpace:NSColorSpace.sRGBColorSpace] blendedColorWithFraction:dark ? .08 : .72 ofColor:NSColor.whiteColor];
}

static NSUInteger DPLookPaperIndex(void) {
    NSString *key = DPChoice(&DPWashiPaper) ?: @"cream";
    for (NSUInteger i = 0; i < DPWashiPaperCount(); i++) { NSString *k; DPWashiPaperAt(i, &k, NULL, NULL, NULL); if ([k isEqual:key]) return i; }
    return 0;
}
static NSUInteger DPLookTapeIndex(void) {
    NSString *key = DPChoice(&DPWashiTape) ?: @"tangerine";
    for (NSUInteger i = 0; i < DPWashiTapeCount(); i++) { NSString *k; DPWashiTapeAt(i, &k, NULL, NULL); if ([k isEqual:key]) return i; }
    return 0;
}

// A torn strip of tape, like Washi's clip-path, centred at `at`, leaning `degrees`.
static void DPLookTape(NSPoint at, CGFloat w, CGFloat h, CGFloat degrees, NSColor *tape) {
    static const CGFloat pts[][2] = { {0, .18}, {.06, 0}, {.30, .10}, {.52, 0}, {.76, .08}, {1, 0}, {.96, .5}, {1, 1}, {.72, .90}, {.48, 1}, {.24, .92}, {0, 1}, {.04, .5} };
    NSBezierPath *path = [NSBezierPath bezierPath];
    for (size_t i = 0; i < sizeof pts / sizeof *pts; i++) {
        NSPoint p = NSMakePoint(pts[i][0] * w - w / 2, pts[i][1] * h - h / 2);
        if (i == 0) [path moveToPoint:p]; else [path lineToPoint:p];
    }
    [path closePath];
    NSAffineTransform *t = [NSAffineTransform transform];
    [t translateXBy:at.x yBy:at.y];
    [t rotateByDegrees:degrees];
    [path transformUsingAffineTransform:t];
    [[tape colorWithAlphaComponent:.85] setFill];
    [path fill];
}

@interface DPWashiLookView : NSView
@end

// Light, dark or Match my Mac, for all of Dia, like Washi's Appearance. Saved with the tweaks' settings.
static NSUserDefaults *DPLookDefaults(void) {
    static NSUserDefaults *d;
    if (!d) d = [[NSUserDefaults alloc] initWithSuiteName:@"com.diapatches"];
    return d;
}
static NSString *DPLookMode(void) {
    NSString *mode = [DPLookDefaults() stringForKey:@"washiAppearance"];
    return [@[ @"light", @"dark" ] containsObject:mode] ? mode : @"auto";
}
void DPWashiApplyAppearance(void) {
    NSString *mode = DPWashiPaper.on ? DPLookMode() : @"auto";
    NSAppearance *want = [mode isEqual:@"light"] ? [NSAppearance appearanceNamed:NSAppearanceNameAqua]
                       : [mode isEqual:@"dark"] ? [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua] : nil;
    if (NSApp.appearance != want && ![NSApp.appearance.name isEqual:want.name]) NSApp.appearance = want;
}

@implementation DPWashiLookView {
    NSMutableArray<NSValue *> *_paperHits, *_tapeHits, *_modeHits;
    NSLayoutConstraint *_height;
    CGFloat _needed;
    NSArray<NSSwitch *> *_feel;
    NSColorWell *_lightWell, *_darkWell;   // Custom paper
    // Spaces: the space being colored, its name tabs, the palette cards, Desk/Tape/Highlight, Reset.
    NSString *_space;
    NSMutableArray<NSValue *> *_spaceTabs, *_cards;
    NSRect _fieldRects[3][3], _resetRect, _guideRect;   // per field: its name, its well, its hex
    NSColorWell *_spaceWells[3];
    NSTextField *_spaceHex[3];
    NSInteger _hover;          // the card under the pointer, or -1
    CGFloat _lift[16];         // each card's hover lift, 0…1, eased
    NSTimer *_liftTimer;
}
static NSString *const DPSpaceFieldKeys[3] = { @"desk", @"tape", @"s2" };
static NSString *const DPSpaceFieldNames[3] = { @"Desk", @"Tape", @"Highlight" };
extern DPPatch DPWashiScrapbook;
// Feel, like Washi's: Paper texture, Scrapbook, Animations.
static NSArray<NSArray<NSString *> *> *DPFeelRows(void) {
    return @[ @[ @"washiTexture", @"Paper texture", @"The grain on every scrap of paper" ],
              @[ @"washiScrapbook", @"Scrapbook", @"Tape on what’s stuck down, crooked scraps, a slanted name" ],
              @[ @"washiMotion", @"Animations", @"Turn off for a calmer Dia: nothing springs or fades" ] ];
}
static BOOL DPFeelOn(NSString *key) { return [key isEqual:@"washiScrapbook"] ? DPWashiScrapbook.on : DPWashiFeel(key); }
- (instancetype)initWithFrame:(NSRect)frame {
    if ((self = [super initWithFrame:frame])) {
        _paperHits = [NSMutableArray new]; _tapeHits = [NSMutableArray new]; _modeHits = [NSMutableArray new];
        _spaceTabs = [NSMutableArray new]; _cards = [NSMutableArray new]; _hover = -1;
        for (int k = 0; k < 3; k++) {
            NSColorWell *well = [NSColorWell colorWellWithStyle:NSColorWellStyleMinimal];
            well.supportsAlpha = NO; well.tag = k;
            well.target = self; well.action = @selector(spaceWell:);
            well.accessibilityLabel = [NSString stringWithFormat:@"The space’s %@", DPSpaceFieldNames[k].lowercaseString];
            [self addSubview:well]; _spaceWells[k] = well;
            NSTextField *hex = [NSTextField textFieldWithString:@""];
            hex.font = [NSFont monospacedSystemFontOfSize:11.5 weight:NSFontWeightMedium];
            hex.bezelStyle = NSTextFieldRoundedBezel; hex.tag = k;
            hex.target = self; hex.action = @selector(spaceHex:);
            hex.accessibilityLabel = [NSString stringWithFormat:@"%@ color, as hex", DPSpaceFieldNames[k]];
            [self addSubview:hex]; _spaceHex[k] = hex;
        }
        [self addTrackingArea:[[NSTrackingArea alloc] initWithRect:NSZeroRect options:NSTrackingMouseMoved | NSTrackingMouseEnteredAndExited | NSTrackingActiveInKeyWindow | NSTrackingInVisibleRect owner:self userInfo:nil]];
        _needed = 420;
        self.identifier = @"Options";   // the page's first group: Appearance at the top, before every option
        NSMutableArray *feel = [NSMutableArray new];
        for (NSArray *row in DPFeelRows()) {
            NSSwitch *sw = [NSSwitch new];
            sw.controlSize = NSControlSizeSmall;
            sw.identifier = row[0]; sw.accessibilityLabel = row[1];
            sw.target = self; sw.action = @selector(feel:);
            [self addSubview:sw]; [feel addObject:sw];
        }
        _feel = feel;
        for (NSUInteger i = 0; i < 2; i++) {
            NSColorWell *well = [NSColorWell colorWellWithStyle:NSColorWellStyleMinimal];
            well.identifier = i ? @"washiCustomDark" : @"washiCustomLight";
            well.supportsAlpha = NO;
            well.target = self; well.action = @selector(customColor:);
            well.accessibilityLabel = i ? @"Your dark paper" : @"Your light paper";
            [self addSubview:well];
            if (i) _darkWell = well; else _lightWell = well;
        }
        [self syncFeel];
        [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(changed) name:DPPatchesDidChangeNotification object:nil];
    }
    return self;
}
- (void)dealloc { [NSNotificationCenter.defaultCenter removeObserver:self]; [_liftTimer invalidate]; }
- (void)changed { [self syncFeel]; self.needsDisplay = YES; }
- (void)syncFeel { for (NSSwitch *sw in _feel) sw.state = DPFeelOn(sw.identifier) ? NSControlStateValueOn : NSControlStateValueOff; }
- (BOOL)custom { return [DPChoice(&DPWashiPaper) isEqual:@"custom"]; }
- (CGFloat)customExtra { return self.custom ? 34 : 0; }
- (CGFloat)paperTopFor:(CGFloat)W { CGFloat pw = floor((W - 8 - 14) / 2), ph = round(pw * .62); return 44 + ph + 32 + 3 * 21 + 10 + 22; }
- (void)customColor:(NSColorWell *)well {
    NSColor *c = [well.color colorUsingColorSpace:NSColorSpace.sRGBColorSpace];
    uint32_t rgb = ((uint32_t)lround(c.redComponent * 255) << 16) | ((uint32_t)lround(c.greenComponent * 255) << 8) | (uint32_t)lround(c.blueComponent * 255);
    [DPWashiDefaults() setObject:@(rgb) forKey:well.identifier];
    if (DPWashiPaper.on && DPWashiPaper.apply) DPWashiPaper.apply(&DPWashiPaper);
    self.needsDisplay = YES;
}
- (void)feel:(NSSwitch *)sw {
    BOOL on = sw.state == NSControlStateValueOn;
    if ([sw.identifier isEqual:@"washiScrapbook"]) {
        DPSetPatch(&DPWashiScrapbook, on, YES);
        [NSNotificationCenter.defaultCenter postNotificationName:DPPatchesDidChangeNotification object:nil];   // its switch below follows
    } else {
        [DPWashiDefaults() setBool:on forKey:sw.identifier];
        if (DPWashiPaper.on && DPWashiPaper.apply) DPWashiPaper.apply(&DPWashiPaper);
    }
}
- (CGFloat)spacesTopFor:(CGFloat)W {
    CGFloat pw = floor((W - 8 - 14) / 2), ph = round(pw * .62);
    return 44 + ph + 32 + 3 * 21 + 10 + 22 + 70 + 30 + 18 + [self customExtra];
}
- (CGFloat)feelTopFor:(CGFloat)W { return [self spacesTopFor:W] + [self measureSpaces:W at:[self spacesTopFor:W]]; }

#pragma mark Spaces

// The space being colored: the one you picked here, else the one in front, else the first.
- (NSString *)chosenSpace {
    NSArray *spaces = DPWashiSpaces();
    if ([spaces containsObject:_space]) return _space;
    NSString *front = DPWashiSpaceOf(NSApp.mainWindow);
    for (NSWindow *w in NSApp.orderedWindows) { if (front) break; front = DPWashiSpaceOf(w); }
    return [spaces containsObject:front] ? front : spaces.firstObject;
}
static NSDictionary *DPSpaceTabAttrs(BOOL on) { return @{ NSFontAttributeName: DPCaveat(18), NSForegroundColorAttributeName: on ? NSColor.labelColor : NSColor.secondaryLabelColor }; }
static NSDictionary *DPSmallAttrs(void) { return @{ NSFontAttributeName: DPWashiFigtree(11.5, NSFontWeightMedium), NSForegroundColorAttributeName: NSColor.secondaryLabelColor }; }

// Where everything in Spaces goes, at this width with the section starting at `sy`. Returns its height (0 with no spaces).
// Things wrap onto more lines rather than crowd: the space names, and Desk/Tape/Highlight/Reset.
- (CGFloat)measureSpaces:(CGFloat)W at:(CGFloat)sy {
    [_spaceTabs removeAllObjects]; [_cards removeAllObjects]; _resetRect = NSZeroRect;
    NSArray<NSString *> *spaces = DPWashiSpaces();
    if (!spaces.count) return 0;
    const CGFloat pad = 4, right = W - pad;
    CGFloat y = sy + 26, x = pad;   // under "Spaces" and its line
    for (NSString *name in spaces) {
        CGFloat w = MIN(ceil([name sizeWithAttributes:DPSpaceTabAttrs(YES)].width) + 22, right - pad);
        if (x > pad && x + w > right) { x = pad; y += 32; }
        [_spaceTabs addObject:[NSValue valueWithRect:NSMakeRect(x, y, w, 28)]];
        x += w + 6;
    }
    y += 28 + 12;
    // Washi's palette cards: your main look first, then the seven. 52×40 at most, as in Washi.
    NSUInteger n = DPWashiPaletteCount() + 1;
    CGFloat cell = MIN(66, floor((W - pad * 2) / n)), cw = MIN(52, cell - 10), ch = round(cw * 40 / 52);
    for (NSUInteger i = 0; i < n; i++) [_cards addObject:[NSValue valueWithRect:NSMakeRect(pad + i * cell + (cell - cw) / 2, y + 3, cw, ch)]];
    y += 3 + ch + 6 + 15 + 12;   // the lift room, the card, its name
    // Desk, Tape, Highlight: name, well, hex. Then Reset.
    x = pad;
    for (int k = 0; k < 3; k++) {
        CGFloat lw = ceil([DPSpaceFieldNames[k] sizeWithAttributes:DPSmallAttrs()].width), w = lw + 6 + 34 + 6 + 70;
        if (x > pad && x + w > right) { x = pad; y += 32; }
        _fieldRects[k][0] = NSMakeRect(x, y + 6, lw, 16);
        _fieldRects[k][1] = NSMakeRect(x + lw + 6, y + 2, 34, 22);
        _fieldRects[k][2] = NSMakeRect(x + lw + 6 + 34 + 6, y + 2, 70, 22);
        x += w + 18;
    }
    CGFloat rw = ceil([@"Reset" sizeWithAttributes:DPSmallAttrs()].width) + 16;
    if (x + rw > right) { x = pad; y += 32; }
    _resetRect = NSMakeRect(x - 4, y + 3, rw, 20);
    y += 26 + 14;
    return y - sy + 4;
}

- (void)saveSpace:(NSString *)space look:(NSDictionary *)look {
    if (!space) return;
    NSMutableDictionary *all = [[DPWashiDefaults() dictionaryForKey:@"washiSpaceLooks"] mutableCopy] ?: [NSMutableDictionary new];
    if (look.count) all[space] = look; else [all removeObjectForKey:space];
    [DPWashiDefaults() setObject:all forKey:@"washiSpaceLooks"];
    NSMutableDictionary *old = [[DPWashiDefaults() dictionaryForKey:@"washiSpaceTapes"] mutableCopy];   // the older per-space tape, now in the look
    if (old[space]) { [old removeObjectForKey:space]; [DPWashiDefaults() setObject:old forKey:@"washiSpaceTapes"]; }
    if (DPWashiPaper.on && DPWashiPaper.apply) DPWashiPaper.apply(&DPWashiPaper);   // Dia follows at once
    self.needsDisplay = YES; self.needsLayout = YES;
}
// The space's look as it is now, with an older per-space tape carried into it.
- (NSMutableDictionary *)lookOf:(NSString *)space {
    NSMutableDictionary *look = [DPWashiSpaceLookOf(space) mutableCopy] ?: [NSMutableDictionary new];
    if (!look[@"tape"] && !look[@"preset"] && DPWashiSpaceTape(space)) { uint32_t t; DPWashiSpaceColors(space, NULL, &t, NULL); look[@"tape"] = @(t); }
    return look;
}
- (void)setSpaceColor:(int)k rgb:(NSNumber *)rgb {
    NSString *space = self.chosenSpace;
    NSMutableDictionary *look = [self lookOf:space];
    look[DPSpaceFieldKeys[k]] = rgb;
    [self saveSpace:space look:look];
}
- (void)spaceWell:(NSColorWell *)well {
    NSColor *c = [well.color colorUsingColorSpace:NSColorSpace.sRGBColorSpace];
    [self setSpaceColor:(int)well.tag rgb:@(((uint32_t)lround(c.redComponent * 255) << 16) | ((uint32_t)lround(c.greenComponent * 255) << 8) | (uint32_t)lround(c.blueComponent * 255))];
}
// #rgb, #rrggbb, with or without the #. Empty goes back to the palette's color; anything else shakes its head.
- (void)spaceHex:(NSTextField *)field {
    NSString *t = [[field.stringValue stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceCharacterSet] stringByReplacingOccurrencesOfString:@"#" withString:@""];
    int k = (int)field.tag;
    if (!t.length) {
        NSString *space = self.chosenSpace;
        NSMutableDictionary *look = [self lookOf:space];
        [look removeObjectForKey:DPSpaceFieldKeys[k]];
        [self saveSpace:space look:look];
        return;
    }
    if (t.length == 3) t = [NSString stringWithFormat:@"%C%C%C%C%C%C", [t characterAtIndex:0], [t characterAtIndex:0], [t characterAtIndex:1], [t characterAtIndex:1], [t characterAtIndex:2], [t characterAtIndex:2]];
    unsigned rgb = 0;
    NSScanner *scan = [NSScanner scannerWithString:t];
    if (t.length != 6 || [t rangeOfCharacterFromSet:[NSCharacterSet characterSetWithCharactersInString:@"0123456789abcdefABCDEF"].invertedSet].location != NSNotFound || ![scan scanHexInt:&rgb]) {
        [self shake:field];
        return;
    }
    [self setSpaceColor:k rgb:@(rgb)];
}
- (void)shake:(NSView *)view {
    NSBeep();
    if (DPWashiCalm() || !view.layer) return;
    CAKeyframeAnimation *no = [CAKeyframeAnimation animationWithKeyPath:@"transform.translation.x"];
    no.values = @[ @0, @-6, @5, @-3, @2, @0 ]; no.duration = .32; no.additive = YES;
    [view.layer addAnimation:no forKey:@"washiNo"];
}
- (void)syncSpaceControls {
    NSString *space = self.chosenSpace;
    BOOL shown = space != nil;
    uint32_t c[3] = { 0 };
    unsigned own = shown ? DPWashiSpaceColors(space, &c[0], &c[1], &c[2]) : 0;
    NSDictionary *look = DPWashiSpaceLookOf(space);
    for (int k = 0; k < 3; k++) {
        _spaceWells[k].hidden = _spaceHex[k].hidden = !shown;
        if (!shown) continue;
        _spaceWells[k].frame = _fieldRects[k][1];
        _spaceHex[k].frame = _fieldRects[k][2];
        if (!_spaceWells[k].isActive) _spaceWells[k].color = DPLookHex(c[k]);
        NSString *hex = [NSString stringWithFormat:@"#%06x", c[k]];
        _spaceHex[k].placeholderString = hex;
        BOOL mine = [look[DPSpaceFieldKeys[k]] isKindOfClass:NSNumber.class] || (k == 1 && !look && (own & 2));
        if (_spaceHex[k].currentEditor == nil) _spaceHex[k].stringValue = mine ? hex : @"";
    }
}
// Which card is on: Main with no colors of its own, a palette picked and nothing changed on it, else none.
- (NSInteger)chosenCard {
    NSString *space = self.chosenSpace;
    NSDictionary *look = DPWashiSpaceLookOf(space);
    if (!look) return DPWashiSpaceTape(space) ? -1 : 0;
    if (look[@"desk"] || look[@"tape"] || look[@"s2"]) return -1;
    for (NSUInteger i = 0; i < DPWashiPaletteCount(); i++) { NSString *k; DPWashiPaletteAt(i, &k, NULL, NULL, NULL, NULL); if ([k isEqual:look[@"preset"]]) return i + 1; }
    return -1;
}
- (BOOL)spaceHasOwn { NSDictionary *look = DPWashiSpaceLookOf(self.chosenSpace); return look[@"desk"] || look[@"tape"] || look[@"s2"] || (!look && DPWashiSpaceTape(self.chosenSpace)); }

// Striped tape like Washi's, filling `r` leaning `degrees`, clipped to whatever clip is set.
static void DPLookStripes(NSRect r, CGFloat degrees, NSColor *tape) {
    [NSGraphicsContext saveGraphicsState];
    NSAffineTransform *t = [NSAffineTransform transform];
    [t translateXBy:NSMidX(r) yBy:NSMidY(r)]; [t rotateByDegrees:degrees]; [t translateXBy:-NSMidX(r) yBy:-NSMidY(r)]; [t concat];
    [[NSBezierPath bezierPathWithRect:r] addClip];
    [[tape blendedColorWithFraction:.38 ofColor:NSColor.whiteColor] setFill]; NSRectFillUsingOperation(r, NSCompositingOperationSourceOver);
    [tape setFill];
    CGFloat band = 3.2 * M_SQRT2;
    for (CGFloat x = NSMinX(r) - NSHeight(r); x < NSMaxX(r) + NSHeight(r); x += band * 2) {
        NSBezierPath *b = [NSBezierPath bezierPath];
        [b moveToPoint:NSMakePoint(x, NSMinY(r))]; [b lineToPoint:NSMakePoint(x + band, NSMinY(r))];
        [b lineToPoint:NSMakePoint(x + band + NSHeight(r), NSMaxY(r))]; [b lineToPoint:NSMakePoint(x + NSHeight(r), NSMaxY(r))]; [b closePath]; [b fill];
    }
    [NSGraphicsContext restoreGraphicsState];
}

// One palette card, as Washi's: the desk, a strip of its tape across the top-left, the highlight as a dot.
static void DPLookPaletteCard(NSRect card, BOOL dark, uint32_t desk, uint32_t tape, uint32_t s2, BOOL hollowDot, BOOL on, NSColor *ring, CGFloat lift) {
    card = NSOffsetRect(card, 0, -2 * lift);
    CGFloat s = NSWidth(card) / 52;
    NSBezierPath *shape = [NSBezierPath bezierPathWithRoundedRect:card xRadius:5 yRadius:5];
    NSShadow *cut = [NSShadow new];
    cut.shadowColor = [NSColor colorWithWhite:0 alpha:(dark ? .45 : .16) + lift * .08]; cut.shadowOffset = NSMakeSize(0, -1 - 2 * lift); cut.shadowBlurRadius = 2 + 3 * lift;
    [NSGraphicsContext saveGraphicsState]; [cut set]; [DPLookHex(desk) setFill]; [shape fill]; [NSGraphicsContext restoreGraphicsState];
    [NSGraphicsContext saveGraphicsState]; [shape addClip];
    DPLookStripes(NSMakeRect(NSMinX(card) - 4 * s, NSMinY(card) + 7 * s, 36 * s, 10 * s), -12, DPLookHex(tape));   // rising to the right, as Washi’s rotate(-12deg)
    NSRect dot = NSMakeRect(NSMaxX(card) - 6 * s - 14 * s, NSMaxY(card) - 6 * s - 14 * s, 14 * s, 14 * s);
    if (hollowDot) {
        NSBezierPath *o = [NSBezierPath bezierPathWithOvalInRect:NSInsetRect(dot, .75, .75)];
        CGFloat dash[] = { 2, 1.6 }; [o setLineDash:dash count:2 phase:0]; o.lineWidth = 1.3;
        [[DPLookInk(dark) colorWithAlphaComponent:.4] setStroke]; [o stroke];
    } else { [DPLookHex(s2) setFill]; [[NSBezierPath bezierPathWithOvalInRect:dot] fill]; }
    [NSGraphicsContext restoreGraphicsState];
    NSBezierPath *edge = [NSBezierPath bezierPathWithRoundedRect:NSInsetRect(card, on ? -1.5 : -1, on ? -1.5 : -1) xRadius:on ? 6.5 : 6 yRadius:on ? 6.5 : 6];
    edge.lineWidth = on ? 3 : 2;
    [(on ? ring : [NSColor.labelColor colorWithAlphaComponent:.2]) setStroke]; [edge stroke];
}

- (void)drawSpaces:(CGFloat)W at:(CGFloat)sy {
    [self measureSpaces:W at:sy];
    if (!_cards.count) return;
    const CGFloat pad = 4;
    NSColor *label = NSColor.labelColor, *second = NSColor.secondaryLabelColor;
    BOOL dark = [[self.effectiveAppearance bestMatchFromAppearancesWithNames:@[ NSAppearanceNameAqua, NSAppearanceNameDarkAqua ]] isEqual:NSAppearanceNameDarkAqua];
    NSDictionary *bold = @{ NSFontAttributeName: DPWashiFigtree(12, NSFontWeightSemibold), NSForegroundColorAttributeName: label };
    NSMutableParagraphStyle *tail = [NSMutableParagraphStyle new]; tail.lineBreakMode = NSLineBreakByTruncatingTail;
    NSMutableDictionary *small = [DPSmallAttrs() mutableCopy]; small[NSParagraphStyleAttributeName] = tail;
    [[label colorWithAlphaComponent:.1] setFill]; NSRectFillUsingOperation(NSMakeRect(pad, sy - 10, W - pad * 2, 1), NSCompositingOperationSourceOver);
    [@"Spaces" drawAtPoint:NSMakePoint(pad, sy) withAttributes:bold];
    [@"Each space sits on its own desk, with its own tape and highlight." drawInRect:NSMakeRect(pad + 56, sy + 1, W - pad * 2 - 56, 15) withAttributes:small];
    NSArray<NSString *> *spaces = DPWashiSpaces();
    NSString *chosen = self.chosenSpace;
    uint32_t desk, tape, s2; DPWashiSpaceColors(chosen, &desk, &tape, &s2);
    NSColor *ring = DPLookHex(tape);
    // The space names, the chosen one on card paper with a stroke of its tape under it.
    for (NSUInteger i = 0; i < _spaceTabs.count && i < spaces.count; i++) {
        NSRect r = _spaceTabs[i].rectValue;
        BOOL on = [spaces[i] isEqual:chosen];
        uint32_t d, t; DPWashiSpaceColors(spaces[i], &d, &t, NULL);
        if (on) {
            NSShadow *cut = [NSShadow new]; cut.shadowColor = [NSColor colorWithWhite:0 alpha:dark ? .4 : .14]; cut.shadowOffset = NSMakeSize(0, -1); cut.shadowBlurRadius = 2;
            [NSGraphicsContext saveGraphicsState]; [cut set];
            BOOL ownDesk = DPWashiSpaceColors(spaces[i], NULL, NULL, NULL) & 1;   // its desk, or card paper on the main look
            [(ownDesk ? DPLookHex(dark ? DPWashiNightDesk(d) : d) : DPLookCard(DPLookHex(DPWashiMainPaperRGB(dark)), dark)) setFill];
            [[NSBezierPath bezierPathWithRoundedRect:r xRadius:8 yRadius:8] fill];
            [NSGraphicsContext restoreGraphicsState];
            [[label colorWithAlphaComponent:.12] setStroke]; [[NSBezierPath bezierPathWithRoundedRect:NSInsetRect(r, .5, .5) xRadius:8 yRadius:8] stroke];
        }
        [DPLookHex(t) setFill];
        [[NSBezierPath bezierPathWithOvalInRect:NSMakeRect(NSMinX(r) + 9, NSMidY(r) - 3, 6, 6)] fill];
        NSMutableDictionary *a = [DPSpaceTabAttrs(on) mutableCopy]; a[NSParagraphStyleAttributeName] = tail;
        [spaces[i] drawInRect:NSMakeRect(NSMinX(r) + 19, NSMinY(r) + 2, NSWidth(r) - 23, 24) withAttributes:a];
    }
    // The cards: Main, then Washi's seven.
    NSInteger on = self.chosenCard;
    NSMutableParagraphStyle *mid = [NSMutableParagraphStyle new]; mid.alignment = NSTextAlignmentCenter; mid.lineBreakMode = NSLineBreakByTruncatingTail;
    for (NSUInteger i = 0; i < _cards.count; i++) {
        NSRect card = _cards[i].rectValue;
        uint32_t d, t, h; NSString *name;
        if (i == 0) { d = DPWashiMainPaperRGB(NO); t = DPWashiMainTapeRGB(); h = 0; name = @"Main"; }
        else DPWashiPaletteAt(i - 1, NULL, &name, &d, &t, &h);
        uint32_t shown = i == 0 ? DPWashiMainPaperRGB(dark) : dark ? DPWashiNightDesk(d) : d;
        CGFloat lift = i < 16 ? _lift[i] : 0;
        DPLookPaletteCard(card, dark, shown, t, h, i == 0, (NSInteger)i == on, ring, lift);
        NSRect cell = NSMakeRect(NSMidX(card) - 33, NSMaxY(card) + 6, 66, 15);
        [name drawInRect:cell withAttributes:@{ NSFontAttributeName: DPWashiFigtree(11, (NSInteger)i == on ? NSFontWeightBold : NSFontWeightSemibold), NSForegroundColorAttributeName: (NSInteger)i == on || (NSInteger)i == _hover ? label : second, NSParagraphStyleAttributeName: mid }];
    }
    for (int k = 0; k < 3; k++) [DPSpaceFieldNames[k] drawInRect:_fieldRects[k][0] withAttributes:small];
    if (self.spaceHasOwn) {   // Reset: back to the palette (or to Main), as a small paper button
        [[label colorWithAlphaComponent:.07] setFill]; [[NSBezierPath bezierPathWithRoundedRect:_resetRect xRadius:6 yRadius:6] fill];
        NSMutableParagraphStyle *c = [NSMutableParagraphStyle new]; c.alignment = NSTextAlignmentCenter;
        [@"Reset" drawInRect:NSMakeRect(NSMinX(_resetRect), NSMinY(_resetRect) + 2, NSWidth(_resetRect), 16) withAttributes:@{ NSFontAttributeName: DPWashiFigtree(11.5, NSFontWeightSemibold), NSForegroundColorAttributeName: label, NSParagraphStyleAttributeName: c }];
    }
}

// Hover: the card under the pointer lifts 2pt on Washi's spring, as Washi's .pal:hover does.
- (void)mouseMoved:(NSEvent *)event {
    NSPoint at = [self convertPoint:event.locationInWindow fromView:nil];
    NSInteger hit = -1;
    for (NSUInteger i = 0; i < _cards.count; i++) if (NSPointInRect(at, NSInsetRect(_cards[i].rectValue, -4, -4))) hit = i;
    if (hit != _hover) { _hover = hit; [self easeLift]; }
}
- (void)mouseExited:(NSEvent *)event { if (_hover != -1) { _hover = -1; [self easeLift]; } }
- (void)easeLift {
    if (DPWashiCalm()) { for (NSUInteger i = 0; i < 16; i++) _lift[i] = (NSInteger)i == _hover; self.needsDisplay = YES; return; }
    if (_liftTimer) return;
    __weak DPWashiLookView *weak = self;
    _liftTimer = [NSTimer scheduledTimerWithTimeInterval:1 / 60.0 repeats:YES block:^(NSTimer *timer) {
        DPWashiLookView *me = weak;
        if (!me) { [timer invalidate]; return; }
        BOOL moving = NO;
        for (NSUInteger i = 0; i < 16; i++) {
            CGFloat want = (NSInteger)i == me->_hover, d = want - me->_lift[i];
            if (fabs(d) < .01) me->_lift[i] = want; else { me->_lift[i] += d * .3; moving = YES; }
        }
        NSRect dirty = NSZeroRect;
        for (NSValue *v in me->_cards) dirty = NSUnionRect(dirty, NSInsetRect(v.rectValue, -8, -8));
        [me setNeedsDisplayInRect:NSInsetRect(dirty, 0, -20)];
        if (!moving) { [timer invalidate]; me->_liftTimer = nil; }
    }];
}
- (BOOL)isFlipped { return YES; }
- (NSSize)intrinsicContentSize { return NSMakeSize(NSViewNoIntrinsicMetric, _needed); }
- (void)setHeightConstraint:(NSLayoutConstraint *)c { _height = c; }
// Everything below the drawings has a fixed height; the drawings grow with the width.
- (CGFloat)neededFor:(CGFloat)W {
    return [self feelTopFor:W] + 24 + 3 * 40 + 4 + 58;   // Feel, then the quick-start guide's row
}
- (void)layout {
    [super layout];
    CGFloat need = [self neededFor:NSWidth(self.bounds)], top = [self feelTopFor:NSWidth(self.bounds)];
    CGFloat customY = [self paperTopFor:NSWidth(self.bounds)] + 64;
    uint32_t cl, cd; DPWashiPaperAt(DPWashiPaperCount() - 1, NULL, NULL, &cl, &cd);
    _lightWell.hidden = _darkWell.hidden = !self.custom;
    _lightWell.frame = NSMakeRect(4 + 74, customY, 44, 24);
    _darkWell.frame = NSMakeRect(4 + 74 + 120, customY, 44, 24);
    if (!_lightWell.isActive) _lightWell.color = DPLookHex(cl);
    if (!_darkWell.isActive) _darkWell.color = DPLookHex(cd);
    [self syncSpaceControls];
    for (NSUInteger i = 0; i < _feel.count; i++) {
        NSSize size = _feel[i].fittingSize;
        _feel[i].frame = NSMakeRect(NSWidth(self.bounds) - 4 - size.width, top + 24 + i * 40 + (34 - size.height) / 2, size.width, size.height);
    }
    if (fabs(need - _needed) > .5) { _needed = need; _height.constant = need; [self invalidateIntrinsicContentSize]; }
}
- (void)viewDidChangeEffectiveAppearance { [super viewDidChangeEffectiveAppearance]; self.needsDisplay = YES; }

// A small Dia in this paper: sidebar with favorites, the name, tabs (the selected one a card with tape), the toolbar
// with its address field, and the page laid on the paper as a sheet. `spot` picks out the part one option changes: the
// rest goes pale behind a veil of paper and that part gets a dashed ring in the tape color. It also draws the extras
// some options add: a pop-up, Washi's new tab, a tab lifting under the pointer.
// Where a part of the little Dia is, for the quick-start guide's notes (the same measures DPWashiDrawMini uses).
NSRect DPWashiMiniPart(NSRect r, NSString *part) {
    CGFloat side = round(NSWidth(r) * .3), x = NSMinX(r), y = NSMinY(r), w = NSWidth(r), h = NSHeight(r);
    if ([part isEqual:@"favs"]) return NSMakeRect(x + 6, y + 18, (side - 15) + 3, 13);
    if ([part isEqual:@"name"]) return NSMakeRect(x + 6, y + 33, side - 12, 13);
    if ([part isEqual:@"tab"]) return NSMakeRect(x + 5, y + 60, side - 10, 10);
    if ([part isEqual:@"folders"]) return NSMakeRect(x + 4, y + 72, side - 8, 26);
    if ([part isEqual:@"ticket"]) return NSMakeRect(x + 5, y + h - 30, side - 10, 15);
    if ([part isEqual:@"dots"]) return NSMakeRect(x + side / 2 - 11, y + h - 10, 22, 5);
    if ([part isEqual:@"field"]) return NSMakeRect(x + side + 22, y + 6, w - side - 30, 9);
    if ([part isEqual:@"tools"]) return NSMakeRect(x + side + 3, y + 7.5, 14, 6);
    if ([part isEqual:@"page"]) return NSMakeRect(x + side, y + 20, w - side - 5, h - 25);
    return NSInsetRect(r, 1, 1);   // "all"
}

void DPWashiDrawMini(NSRect r, BOOL dark, NSColor *paper, NSColor *tape, NSString *spot) {
    // The guide's drawing ("guide" or "guide:<part>"): every part shows, and only the part named lights up.
    BOOL guide = [spot hasPrefix:@"guide"];
    if (guide) spot = spot.length > 6 ? [spot substringFromIndex:6] : nil;
    NSColor *ink = DPLookInk(dark), *card = DPLookCard(paper, dark);
    NSColor *shade = [NSColor colorWithWhite:0 alpha:dark ? .35 : .12];
    // Drawn as your switches are now, with the option being shown always on.
    extern DPPatch DPWashiTape, DPWashiScrapbook, DPWashiCards, DPWashiHand;
    BOOL tapeOn = (DPWashiTape.on && (DPWashiScrapbook.on || [spot isEqual:@"scrapbook"])) || [spot isEqual:@"tape"], cardsOn = DPWashiCards.on || [spot isEqual:@"cards"] || guide, handOn = DPWashiHand.on || [spot isEqual:@"hand"] || guide;
    BOOL tilt = DPWashiScrapbook.on || [spot isEqual:@"scrapbook"], lift = [spot isEqual:@"lift"], newTab = [spot isEqual:@"newtab"] || [spot isEqual:@"commandbar"];
    NSColor *plain = [ink colorWithAlphaComponent:dark ? .12 : .08];   // Dia's own grey, where Washi Cards is off
    NSMutableArray<NSValue *> *spots = [NSMutableArray new];
    NSBezierPath *window = [NSBezierPath bezierPathWithRoundedRect:r xRadius:9 yRadius:9];
    [paper setFill]; [window fill];
    [[ink colorWithAlphaComponent:.14] setStroke]; window.lineWidth = 1; [window stroke];
    [NSGraphicsContext saveGraphicsState];
    [window addClip];
    CGFloat side = round(NSWidth(r) * .3), x = NSMinX(r), y = NSMinY(r), w = NSWidth(r), h = NSHeight(r);
    NSArray *lights = @[ DPLookHex(0xff5f57), DPLookHex(0xfebc2e), DPLookHex(0x28c840) ];
    for (NSUInteger i = 0; i < 3; i++) { [lights[i] setFill]; [[NSBezierPath bezierPathWithOvalInRect:NSMakeRect(x + 7 + i * 7, y + 7, 4.5, 4.5)] fill]; }
    // favorites: two cards, tilted and taped in Scrapbook
    NSRect favs = NSZeroRect;
    for (NSUInteger i = 0; i < 2; i++) {
        NSRect tile = NSMakeRect(x + 6 + i * ((side - 15) / 2 + 3), y + 18, (side - 15) / 2, 13);
        favs = i ? NSUnionRect(favs, tile) : tile;
        [NSGraphicsContext saveGraphicsState];
        if (tilt) { NSAffineTransform *t = [NSAffineTransform transform]; [t translateXBy:NSMidX(tile) yBy:NSMidY(tile)]; [t rotateByDegrees:i ? 4 : -4]; [t translateXBy:-NSMidX(tile) yBy:-NSMidY(tile)]; [t concat]; }
        if (cardsOn) { [shade setFill]; [[NSBezierPath bezierPathWithRoundedRect:NSOffsetRect(tile, 1, 1) xRadius:3 yRadius:3] fill]; }
        [(cardsOn ? card : plain) setFill]; [[NSBezierPath bezierPathWithRoundedRect:tile xRadius:3 yRadius:3] fill];
        if (tilt && tapeOn) DPLookTape(NSMakePoint(NSMidX(tile), NSMinY(tile) + 2), 9, 3.5, i ? -6 : 6, tape);
        [NSGraphicsContext restoreGraphicsState];
    }
    // the space name, in handwriting
    NSRect name = NSMakeRect(x + 6, y + 33, side - 12, 13);
    NSAffineTransform *lean = [NSAffineTransform transform];
    [NSGraphicsContext saveGraphicsState];
    if (tilt) { [lean translateXBy:NSMidX(name) yBy:NSMidY(name)]; [lean rotateByDegrees:-3]; [lean translateXBy:-NSMidX(name) yBy:-NSMidY(name)]; [lean concat]; }
    if (handOn) [@"Personal" drawAtPoint:NSMakePoint(x + 7, y + 33) withAttributes:@{ NSFontAttributeName: DPCaveat(10.5), NSForegroundColorAttributeName: [ink colorWithAlphaComponent:.86] }];
    [NSGraphicsContext restoreGraphicsState];
    // tabs: the second is the selected card with its tape; the third lifts under a pointer for Paper Hover
    NSRect selected = NSZeroRect, lifted = NSZeroRect;
    for (NSUInteger i = 0; i < 4; i++) {
        NSRect row = NSMakeRect(x + 5, y + 48 + i * 12, side - 10, 10);
        if (lift && i == 2) {
            row = NSOffsetRect(row, 0, -1.5); lifted = row;
            [[NSColor colorWithWhite:0 alpha:dark ? .3 : .1] setFill]; [[NSBezierPath bezierPathWithRoundedRect:NSOffsetRect(row, .5, 1.5) xRadius:3 yRadius:3] fill];
            [[ink colorWithAlphaComponent:.07] setFill]; [[NSBezierPath bezierPathWithRoundedRect:row xRadius:3 yRadius:3] fill];
        }
        if (i == 1) {
            selected = row;
            if (cardsOn) { [shade setFill]; [[NSBezierPath bezierPathWithRoundedRect:NSOffsetRect(row, .8, .8) xRadius:3 yRadius:3] fill]; }
            [(cardsOn ? card : plain) setFill]; [[NSBezierPath bezierPathWithRoundedRect:row xRadius:3 yRadius:3] fill];
            if (tapeOn) DPLookTape(NSMakePoint(NSMinX(row) + 4, NSMinY(row) + 1), 8, 3, -20, tape);
        }
        [[ink colorWithAlphaComponent:.3] setFill];
        [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(NSMinX(row) + 4, NSMidY(row) - 2, 4, 4) xRadius:1 yRadius:1] fill];
        [[ink colorWithAlphaComponent:i == 1 ? .55 : .28] setFill];
        [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(NSMinX(row) + 11, NSMidY(row) - 1.2, (NSWidth(row) - 18) * (i % 2 ? .8 : .6), 2.4) xRadius:1.2 yRadius:1.2] fill];
    }
    if (lift) { // the pointer
        NSPoint tip = NSMakePoint(NSMaxX(lifted) - 8, NSMidY(lifted) + 1);
        NSBezierPath *arrow = [NSBezierPath bezierPath];
        [arrow moveToPoint:tip]; [arrow lineToPoint:NSMakePoint(tip.x, tip.y + 9)]; [arrow lineToPoint:NSMakePoint(tip.x + 2.5, tip.y + 6.5)];
        [arrow lineToPoint:NSMakePoint(tip.x + 6, tip.y + 6)]; [arrow closePath];
        [NSColor.blackColor setFill]; [arrow fill]; [NSColor.whiteColor setStroke]; arrow.lineWidth = .8; [arrow stroke];
    }
    // toolbar: the address field as a card
    NSRect bar = NSMakeRect(x + side, y, w - side, 19);
    NSRect field = NSMakeRect(x + side + 22, y + 6, w - side - 30, 9);
    [card setFill]; [[NSBezierPath bezierPathWithRoundedRect:field xRadius:3 yRadius:3] fill];
    [[ink colorWithAlphaComponent:.1] setStroke]; [[NSBezierPath bezierPathWithRoundedRect:field xRadius:3 yRadius:3] stroke];
    [[ink colorWithAlphaComponent:.3] setFill];
    for (NSUInteger i = 0; i < 2; i++) [[NSBezierPath bezierPathWithOvalInRect:NSMakeRect(x + side + 4 + i * 8, y + 8.5, 4, 4)] fill];
    // the page: a sheet on the paper, or Washi's new tab
    NSRect page = NSMakeRect(x + side, y + 20, w - side - 5, h - 25);
    [[NSColor colorWithWhite:0 alpha:dark ? .4 : .13] setFill];
    [[NSBezierPath bezierPathWithRoundedRect:NSOffsetRect(page, 1.5, 1.5) xRadius:5 yRadius:5] fill];
    NSRect commandBar = NSZeroRect;
    if (newTab) {
        [paper setFill]; [[NSBezierPath bezierPathWithRoundedRect:page xRadius:5 yRadius:5] fill];
        [[ink colorWithAlphaComponent:.1] setStroke]; [[NSBezierPath bezierPathWithRoundedRect:page xRadius:5 yRadius:5] stroke];
        NSDictionary *hello = @{ NSFontAttributeName: DPCaveat(13), NSForegroundColorAttributeName: ink };
        NSSize hs = [@"Good evening" sizeWithAttributes:hello];
        [@"Good evening" drawAtPoint:NSMakePoint(NSMidX(page) - hs.width / 2, NSMinY(page) + 12) withAttributes:hello];
        commandBar = NSMakeRect(NSMinX(page) + NSWidth(page) * .18, NSMinY(page) + 32, NSWidth(page) * .64, 16);
        [shade setFill]; [[NSBezierPath bezierPathWithRoundedRect:NSOffsetRect(commandBar, 1, 1) xRadius:4 yRadius:4] fill];
        [card setFill]; [[NSBezierPath bezierPathWithRoundedRect:commandBar xRadius:4 yRadius:4] fill];
        [[ink colorWithAlphaComponent:.25] setFill];
        [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(NSMinX(commandBar) + 6, NSMidY(commandBar) - 1.2, NSWidth(commandBar) * .4, 2.4) xRadius:1.2 yRadius:1.2] fill];
    } else {
        [(dark ? DPLookHex(0x232323) : DPLookHex(0xffffff)) setFill];
        [[NSBezierPath bezierPathWithRoundedRect:page xRadius:5 yRadius:5] fill];
        NSColor *text = dark ? [NSColor colorWithWhite:1 alpha:.22] : [NSColor colorWithWhite:0 alpha:.13];
        [text setFill];
        [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(NSMinX(page) + 10, NSMinY(page) + 10, NSWidth(page) * .45, 5) xRadius:2 yRadius:2] fill];
        for (NSUInteger i = 0; i < 4; i++)
            [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(NSMinX(page) + 10, NSMinY(page) + 22 + i * 8, (NSWidth(page) - 20) * (i == 3 ? .55 : .9), 3) xRadius:1.5 yRadius:1.5] fill];
    }
    // a pop-up hanging from the sidebar's top, for Paper Pop-ups
    NSRect popup = NSZeroRect;
    if ([spot isEqual:@"popups"]) {
        popup = NSMakeRect(x + side - 30, y + 14, 56, 40);
        [[NSColor colorWithWhite:0 alpha:dark ? .45 : .18] setFill]; [[NSBezierPath bezierPathWithRoundedRect:NSOffsetRect(popup, 0, 2) xRadius:6 yRadius:6] fill];
        [card setFill]; [[NSBezierPath bezierPathWithRoundedRect:popup xRadius:6 yRadius:6] fill];
        [[ink colorWithAlphaComponent:.14] setStroke]; [[NSBezierPath bezierPathWithRoundedRect:popup xRadius:6 yRadius:6] stroke];
        [[ink colorWithAlphaComponent:.3] setFill];
        for (NSUInteger i = 0; i < 3; i++) [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(NSMinX(popup) + 6, NSMinY(popup) + 8 + i * 10, 34 - i * 6, 2.4) xRadius:1.2 yRadius:1.2] fill];
    }
    // the Now Playing ticket at the bottom of the tabs
    NSRect ticket = NSZeroRect;
    if ([spot isEqual:@"ticket"] || guide) {
        ticket = guide ? DPWashiMiniPart(r, @"ticket") : NSMakeRect(x + 5, y + h - 22, side - 10, 15);
        [shade setFill]; [[NSBezierPath bezierPathWithRoundedRect:NSOffsetRect(ticket, 1, 1) xRadius:3 yRadius:3] fill];
        [card setFill]; [[NSBezierPath bezierPathWithRoundedRect:ticket xRadius:3 yRadius:3] fill];
        NSBezierPath *perf = [NSBezierPath bezierPath];
        [perf moveToPoint:NSMakePoint(NSMinX(ticket) + 12, NSMinY(ticket) + 2)]; [perf lineToPoint:NSMakePoint(NSMinX(ticket) + 12, NSMaxY(ticket) - 2)];
        CGFloat d[] = { 1.5, 1.5 }; [perf setLineDash:d count:2 phase:0]; [[ink colorWithAlphaComponent:.3] setStroke]; [perf stroke];
        [@"Now playing" drawAtPoint:NSMakePoint(NSMinX(ticket) + 15, NSMinY(ticket) + 1) withAttributes:@{ NSFontAttributeName: DPCaveat(9), NSForegroundColorAttributeName: [ink colorWithAlphaComponent:.7] }];
    }
    // a folder holding the last two tabs, on card paper with a paper icon
    NSRect folder = NSZeroRect;
    if ([spot isEqual:@"folders"] || guide) {
        folder = NSMakeRect(x + 4, y + 48 + 2 * 12 - 2, side - 8, 26);
        [shade setFill]; [[NSBezierPath bezierPathWithRoundedRect:NSOffsetRect(folder, .8, .8) xRadius:4 yRadius:4] fill];
        [[card colorWithAlphaComponent:.92] setFill]; [[NSBezierPath bezierPathWithRoundedRect:folder xRadius:4 yRadius:4] fill];
        NSImage *icon = [[NSImage imageWithSystemSymbolName:@"wrench.and.screwdriver" accessibilityDescription:nil] imageWithSymbolConfiguration:[NSImageSymbolConfiguration configurationWithPointSize:6 weight:NSFontWeightBold]];
        NSImage *tinted = [NSImage imageWithSize:icon.size flipped:NO drawingHandler:^BOOL(NSRect rect) { [icon drawInRect:rect]; [tape set]; NSRectFillUsingOperation(rect, NSCompositingOperationSourceAtop); return YES; }];
        [tinted drawInRect:NSMakeRect(NSMinX(folder) + 4, NSMinY(folder) + 2, 7, 7) fromRect:NSZeroRect operation:NSCompositingOperationSourceOver fraction:1 respectFlipped:YES hints:nil];
        [@"MDM" drawAtPoint:NSMakePoint(NSMinX(folder) + 13, NSMinY(folder) + 1) withAttributes:@{ NSFontAttributeName: DPWashiFigtree(6, NSFontWeightSemibold), NSForegroundColorAttributeName: [ink colorWithAlphaComponent:.7] }];
        [[ink colorWithAlphaComponent:.28] setFill];
        for (NSUInteger i = 0; i < 2; i++) [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(NSMinX(folder) + 13, NSMinY(folder) + 12 + i * 6, NSWidth(folder) * (i ? .4 : .55), 2.2) xRadius:1.1 yRadius:1.1] fill];
    }
    // a Peek preview as a polaroid over the page
    NSRect polaroid = NSZeroRect;
    if ([spot isEqual:@"polaroid"]) {
        NSRect page2 = NSMakeRect(x + side, y + 20, w - side - 5, h - 25);
        polaroid = NSMakeRect(NSMinX(page2) + NSWidth(page2) * .16, NSMinY(page2) + 5, NSWidth(page2) * .68, NSHeight(page2) - 9);
        [[NSColor colorWithWhite:0 alpha:dark ? .45 : .2] setFill]; [[NSBezierPath bezierPathWithRect:NSOffsetRect(polaroid, 1.5, 2)] fill];
        [[card blendedColorWithFraction:.3 ofColor:NSColor.whiteColor] setFill]; NSRectFillUsingOperation(polaroid, NSCompositingOperationSourceOver);
        NSRect photo = NSMakeRect(NSMinX(polaroid) + 4, NSMinY(polaroid) + 4, NSWidth(polaroid) - 8, NSHeight(polaroid) - 18);
        [(dark ? DPLookHex(0x2a2a2a) : DPLookHex(0xdfe6ee)) setFill]; NSRectFillUsingOperation(photo, NSCompositingOperationSourceOver);
        NSDictionary *hand = @{ NSFontAttributeName: DPCaveat(9), NSForegroundColorAttributeName: [ink colorWithAlphaComponent:.8] };
        NSSize hs = [@"github.com" sizeWithAttributes:hand];
        [@"github.com" drawAtPoint:NSMakePoint(NSMidX(polaroid) - hs.width / 2, NSMaxY(photo) + 1) withAttributes:hand];
    }
    // The guide's space dots at the foot of the sidebar: this space's in its tape, the others faded into the paper.
    NSRect dots = DPWashiMiniPart(r, @"dots");
    if (guide) {
        NSArray *others = @[ tape, DPLookHex(0x1f9d57), DPLookHex(0x3d63ff) ];
        for (NSUInteger i = 0; i < 3; i++) {
            NSColor *c = i ? [paper blendedColorWithFraction:.45 ofColor:others[i]] : others[i];
            [c setFill]; [[NSBezierPath bezierPathWithOvalInRect:NSMakeRect(NSMinX(dots) + 2 + i * 7, NSMinY(dots), 4.5, 4.5)] fill];
        }
    }
    // What the option changes (in the guide, the part a note points at).
    if (guide) {
        if (spot) [spots addObject:[NSValue valueWithRect:NSInsetRect([spot isEqual:@"folders"] ? folder : [spot isEqual:@"ticket"] ? ticket : DPWashiMiniPart(r, spot), -2, -2)]];
    } else if ([spot isEqual:@"tape"]) [spots addObject:[NSValue valueWithRect:NSInsetRect(NSMakeRect(NSMinX(selected), NSMinY(selected) - 3, 14, 8), -1, -1)]];
    else if ([spot isEqual:@"cards"]) { [spots addObject:[NSValue valueWithRect:NSInsetRect(favs, -2, -2)]]; [spots addObject:[NSValue valueWithRect:NSInsetRect(selected, -2, -2)]]; }
    else if ([spot isEqual:@"hand"]) [spots addObject:[NSValue valueWithRect:NSInsetRect(name, -1, -1)]];
    else if (tilt) { [spots addObject:[NSValue valueWithRect:NSInsetRect(favs, -3, -3)]]; [spots addObject:[NSValue valueWithRect:NSInsetRect(name, -1, -1)]]; }
    else if (lift) [spots addObject:[NSValue valueWithRect:NSInsetRect(lifted, -2, -2)]];
    else if ([spot isEqual:@"bars"]) [spots addObject:[NSValue valueWithRect:NSInsetRect(bar, 1, 1)]];
    else if ([spot isEqual:@"sheet"]) [spots addObject:[NSValue valueWithRect:NSInsetRect(page, -3, -3)]];
    else if ([spot isEqual:@"popups"]) [spots addObject:[NSValue valueWithRect:NSInsetRect(popup, -2, -2)]];
    else if ([spot isEqual:@"newtab"]) [spots addObject:[NSValue valueWithRect:NSInsetRect(page, 1, 1)]];
    else if ([spot isEqual:@"polaroid"]) [spots addObject:[NSValue valueWithRect:NSInsetRect(polaroid, -2, -2)]];
    else if ([spot isEqual:@"folders"]) [spots addObject:[NSValue valueWithRect:NSInsetRect(folder, -2, -2)]];
    else if ([spot isEqual:@"ticket"]) [spots addObject:[NSValue valueWithRect:NSInsetRect(ticket, -2, -2)]];
    else if ([spot isEqual:@"commandbar"]) [spots addObject:[NSValue valueWithRect:NSInsetRect(commandBar, -2, -2)]];
    if (spots.count) {
        NSBezierPath *veil = [NSBezierPath bezierPathWithRect:r];
        veil.windingRule = NSWindingRuleEvenOdd;
        for (NSValue *v in spots) [veil appendBezierPath:[NSBezierPath bezierPathWithRoundedRect:v.rectValue xRadius:4 yRadius:4]];
        [[paper colorWithAlphaComponent:.6] setFill]; [veil fill];
        for (NSValue *v in spots) {
            NSBezierPath *ring = [NSBezierPath bezierPathWithRoundedRect:v.rectValue xRadius:4 yRadius:4];
            CGFloat dash[] = { 3, 2 }; [ring setLineDash:dash count:2 phase:0]; ring.lineWidth = 1.4;
            [tape setStroke]; [ring stroke];
        }
    }
    [NSGraphicsContext restoreGraphicsState];
}

- (void)drawRect:(NSRect)dirty {
    NSUInteger pi = DPLookPaperIndex(), ti = DPLookTapeIndex();
    uint32_t light, dark, tapeRGB; NSString *paperName;
    DPWashiPaperAt(pi, NULL, &paperName, &light, &dark);
    DPWashiTapeAt(ti, NULL, NULL, &tapeRGB);
    NSColor *tape = DPLookHex(tapeRGB), *label = NSColor.labelColor, *second = NSColor.secondaryLabelColor;
    CGFloat W = NSWidth(self.bounds), pad = 4, gap = 14;
    CGFloat pw = floor((W - pad * 2 - gap) / 2), ph = round(pw * .62);
    // The two drawings, light and dark, with their names in handwriting.
    NSDictionary *bold = @{ NSFontAttributeName: DPWashiFigtree(12, NSFontWeightSemibold), NSForegroundColorAttributeName: label };
    // Appearance: Light, Dark or Match my Mac, a segmented row like Washi's.
    [@"Appearance" drawAtPoint:NSMakePoint(pad, 10) withAttributes:bold];
    [_modeHits removeAllObjects];
    NSArray *modes = @[ @[ @"light", @"Light" ], @[ @"dark", @"Dark" ], @[ @"auto", @"Match my Mac" ] ];
    CGFloat segX = pad + 84, segW = MIN(W - segX - pad, 300);
    NSRect seg = NSMakeRect(segX, 4, segW, 28);
    [[label colorWithAlphaComponent:.07] setFill]; [[NSBezierPath bezierPathWithRoundedRect:seg xRadius:9 yRadius:9] fill];
    NSString *mode = DPLookMode();
    NSMutableParagraphStyle *mid = [NSMutableParagraphStyle new]; mid.alignment = NSTextAlignmentCenter; mid.lineBreakMode = NSLineBreakByTruncatingTail;
    for (NSUInteger i = 0; i < 3; i++) {
        NSRect cellRect = NSInsetRect(NSMakeRect(segX + i * segW / 3, 4, segW / 3, 28), 3, 3);
        BOOL on = [mode isEqual:modes[i][0]];
        if (on) {
            [[NSColor colorWithWhite:0 alpha:.12] setFill]; [[NSBezierPath bezierPathWithRoundedRect:NSOffsetRect(cellRect, 0, 1) xRadius:7 yRadius:7] fill];
            [NSColor.controlBackgroundColor setFill]; [[NSBezierPath bezierPathWithRoundedRect:cellRect xRadius:7 yRadius:7] fill];
        }
        [modes[i][1] drawInRect:NSMakeRect(NSMinX(cellRect) + 2, NSMidY(cellRect) - 8, NSWidth(cellRect) - 4, 16) withAttributes:@{ NSFontAttributeName: DPWashiFigtree(12, NSFontWeightSemibold), NSForegroundColorAttributeName: on ? label : second, NSParagraphStyleAttributeName: mid }];
        [_modeHits addObject:[NSValue valueWithRect:cellRect]];
    }
    NSDictionary *hand = @{ NSFontAttributeName: DPCaveat(19), NSForegroundColorAttributeName: label };
    for (NSUInteger i = 0; i < 2; i++) {
        NSRect r = NSMakeRect(pad + i * (pw + gap), 44, pw, ph);
        DPWashiDrawMini(r, i == 1, DPLookHex(i ? dark : light), tape, nil);
        NSString *name = i ? @"Dark" : @"Light";
        NSSize s = [name sizeWithAttributes:hand];
        [name drawAtPoint:NSMakePoint(NSMidX(r) - s.width / 2, NSMaxY(r) + 2) withAttributes:hand];
    }
    // The key: which color goes where.
    CGFloat y = 44 + ph + 32;
    NSArray *key = @[
        @[ DPLookHex(light), DPLookHex(dark), @"Paper", @"behind the sidebar, the toolbar and the page" ],
        @[ DPLookCard(DPLookHex(light), NO), DPLookCard(DPLookHex(dark), YES), @"Card", @"the selected tab, favorites, the address field, pop-ups" ],
        @[ tape, tape, @"Tape", @"the selected tab, and favorites in Scrapbook" ],
    ];
    NSMutableParagraphStyle *clip = [NSMutableParagraphStyle new]; clip.lineBreakMode = NSLineBreakByTruncatingTail;
    NSDictionary *small = @{ NSFontAttributeName: DPWashiFigtree(11.5, NSFontWeightMedium), NSForegroundColorAttributeName: second, NSParagraphStyleAttributeName: clip };
    for (NSArray *k in key) {
        NSRect chip = NSMakeRect(pad, y + 1, 24, 14);
        NSBezierPath *left = [NSBezierPath bezierPathWithRoundedRect:chip xRadius:4 yRadius:4];
        [NSGraphicsContext saveGraphicsState]; [left addClip];
        [k[0] setFill]; NSRectFillUsingOperation(chip, NSCompositingOperationSourceOver);
        [k[1] setFill]; NSRectFillUsingOperation(NSMakeRect(NSMidX(chip), NSMinY(chip), NSWidth(chip) / 2, NSHeight(chip)), NSCompositingOperationSourceOver);
        [NSGraphicsContext restoreGraphicsState];
        [[label colorWithAlphaComponent:.18] setStroke]; [left stroke];
        [k[2] drawAtPoint:NSMakePoint(pad + 32, y) withAttributes:bold];
        [k[3] drawInRect:NSMakeRect(pad + 74, y + 1, W - pad - 78, 16) withAttributes:small];
        y += 21;
    }
    // Paper and ink: each a circle, light above dark, named under it.
    y += 10;
    [@"Paper and ink" drawAtPoint:NSMakePoint(pad, y) withAttributes:bold];
    y += 22;
    [_paperHits removeAllObjects];
    NSUInteger n = DPWashiPaperCount();
    CGFloat cell = MIN(76, floor((W - pad * 2) / n));
    NSMutableParagraphStyle *center = [NSMutableParagraphStyle new]; center.alignment = NSTextAlignmentCenter; center.lineBreakMode = NSLineBreakByTruncatingTail;
    for (NSUInteger i = 0; i < n; i++) {
        uint32_t l, d; NSString *name; DPWashiPaperAt(i, NULL, &name, &l, &d);
        NSRect hit = NSMakeRect(pad + i * cell, y, cell, 58);
        NSRect dot = NSMakeRect(NSMidX(hit) - 17, y + 2, 34, 34);
        NSBezierPath *circle = [NSBezierPath bezierPathWithOvalInRect:dot];
        [NSGraphicsContext saveGraphicsState]; [circle addClip];
        [DPLookHex(l) setFill]; NSRectFillUsingOperation(dot, NSCompositingOperationSourceOver);
        NSBezierPath *lower = [NSBezierPath bezierPath];   // the dark paper, the lower right half
        [lower moveToPoint:NSMakePoint(NSMaxX(dot), NSMinY(dot))]; [lower lineToPoint:NSMakePoint(NSMaxX(dot), NSMaxY(dot))]; [lower lineToPoint:NSMakePoint(NSMinX(dot), NSMaxY(dot))]; [lower closePath];
        [DPLookHex(d) setFill]; [lower fill];
        [NSGraphicsContext restoreGraphicsState];
        if (i == n - 1) {   // Custom: a little + on it
            [[NSColor colorWithWhite:.5 alpha:.9] setStroke];
            NSBezierPath *plus = [NSBezierPath bezierPath]; plus.lineWidth = 1.6;
            [plus moveToPoint:NSMakePoint(NSMidX(dot) - 5, NSMidY(dot))]; [plus lineToPoint:NSMakePoint(NSMidX(dot) + 5, NSMidY(dot))];
            [plus moveToPoint:NSMakePoint(NSMidX(dot), NSMidY(dot) - 5)]; [plus lineToPoint:NSMakePoint(NSMidX(dot), NSMidY(dot) + 5)];
            [plus stroke];
        }
        if (i == pi) { NSBezierPath *ring = [NSBezierPath bezierPathWithOvalInRect:NSInsetRect(dot, -3.5, -3.5)]; ring.lineWidth = 2.5; [tape setStroke]; [ring stroke]; }
        else { [[label colorWithAlphaComponent:.16] setStroke]; [circle stroke]; }
        NSString *first = [name componentsSeparatedByString:@" "].firstObject;
        [first drawInRect:NSMakeRect(NSMinX(hit), y + 42, cell, 15) withAttributes:@{ NSFontAttributeName: DPWashiFigtree(11, i == pi ? NSFontWeightSemibold : NSFontWeightMedium), NSForegroundColorAttributeName: i == pi ? label : second, NSParagraphStyleAttributeName: center }];
        [_paperHits addObject:[NSValue valueWithRect:hit]];
    }
    // Custom: your own light and dark paper, from the color wells.
    if (self.custom) {
        [@"Your paper" drawAtPoint:NSMakePoint(pad, y + 68) withAttributes:small];
        [@"Light" drawAtPoint:NSMakePoint(pad + 126, y + 68) withAttributes:small];
        [@"Dark" drawAtPoint:NSMakePoint(pad + 246, y + 68) withAttributes:small];
    }
    // Tape: a dot for each.
    y += 70 + [self customExtra];
    [@"Tape" drawAtPoint:NSMakePoint(pad, y + 6) withAttributes:bold];
    [_tapeHits removeAllObjects];
    for (NSUInteger i = 0; i < DPWashiTapeCount(); i++) {
        uint32_t rgb; DPWashiTapeAt(i, NULL, NULL, &rgb);
        NSRect hit = NSMakeRect(pad + 74 + i * 34, y, 30, 30);
        NSRect dot = NSInsetRect(hit, 4, 4);
        [DPLookHex(rgb) setFill]; [[NSBezierPath bezierPathWithOvalInRect:dot] fill];
        if (i == ti) { NSBezierPath *ring = [NSBezierPath bezierPathWithOvalInRect:NSInsetRect(dot, -3, -3)]; ring.lineWidth = 2; [label setStroke]; [ring stroke]; }
        [_tapeHits addObject:[NSValue valueWithRect:hit]];
    }
    // Spaces: pick a space, then its palette, or your own desk, tape and highlight.
    [self drawSpaces:W at:[self spacesTopFor:W]];
    // Feel: each a title and a line under it, with its switch on the right.
    CGFloat top = [self feelTopFor:W];
    [[label colorWithAlphaComponent:.1] setFill]; NSRectFillUsingOperation(NSMakeRect(pad, top - 10, W - pad * 2, 1), NSCompositingOperationSourceOver);
    [@"Feel" drawAtPoint:NSMakePoint(pad, top) withAttributes:bold];
    NSArray *rows = DPFeelRows();
    for (NSUInteger i = 0; i < rows.count; i++) {
        CGFloat ry = top + 24 + i * 40;
        [rows[i][1] drawAtPoint:NSMakePoint(pad, ry + 1) withAttributes:@{ NSFontAttributeName: DPWashiFigtree(13, NSFontWeightMedium), NSForegroundColorAttributeName: label }];
        [rows[i][2] drawInRect:NSMakeRect(pad, ry + 18, W - pad * 2 - 56, 15) withAttributes:small];
    }
    // The quick-start guide: what everything is, with notes pointing at each part.
    CGFloat gy = top + 24 + rows.count * 40 + 8;
    [[label colorWithAlphaComponent:.1] setFill]; NSRectFillUsingOperation(NSMakeRect(pad, gy, W - pad * 2, 1), NSCompositingOperationSourceOver);
    NSString *show = @"Show the guide";
    NSDictionary *btn = @{ NSFontAttributeName: DPWashiFigtree(12, NSFontWeightSemibold), NSForegroundColorAttributeName: NSColor.whiteColor };
    CGFloat bw = ceil([show sizeWithAttributes:btn].width) + 26;
    _guideRect = NSMakeRect(W - pad - bw, gy + 14, bw, 28);
    [@"Quick-start guide" drawAtPoint:NSMakePoint(pad, gy + 13) withAttributes:@{ NSFontAttributeName: DPWashiFigtree(13, NSFontWeightMedium), NSForegroundColorAttributeName: label }];
    [@"What everything is, with a note pointing at each part" drawInRect:NSMakeRect(pad, gy + 30, NSMinX(_guideRect) - pad - 12, 15) withAttributes:small];
    NSShadow *cut = [NSShadow new]; cut.shadowColor = [NSColor colorWithWhite:0 alpha:.18]; cut.shadowOffset = NSMakeSize(0, -1); cut.shadowBlurRadius = 2;
    [NSGraphicsContext saveGraphicsState]; [cut set]; [tape setFill]; [[NSBezierPath bezierPathWithRoundedRect:_guideRect xRadius:8 yRadius:8] fill]; [NSGraphicsContext restoreGraphicsState];
    [show drawAtPoint:NSMakePoint(NSMinX(_guideRect) + 13, NSMidY(_guideRect) - 8) withAttributes:btn];
}

- (void)choose:(DPPatch *)patch key:(NSString *)key {
    DPSetChoice(patch, key);   // saved even while that tweak is off
    if (patch != &DPWashiPaper && DPWashiPaper.on && DPWashiPaper.apply) DPWashiPaper.apply(&DPWashiPaper);   // everything Washi drew, at once
    self.needsDisplay = YES;
}

- (void)mouseDown:(NSEvent *)event {
    NSPoint at = [self convertPoint:event.locationInWindow fromView:nil];
    NSArray *modes = @[ @"light", @"dark", @"auto" ];
    for (NSUInteger i = 0; i < _modeHits.count; i++)
        if (NSPointInRect(at, _modeHits[i].rectValue)) {
            [DPLookDefaults() setObject:modes[i] forKey:@"washiAppearance"];
            DPWashiApplyAppearance();
            self.needsDisplay = YES;
            return;
        }
    if (NSPointInRect(at, _guideRect)) { DPWashiShowGuide(); return; }
    NSArray<NSString *> *spaces = DPWashiSpaces();
    for (NSUInteger i = 0; i < _spaceTabs.count && i < spaces.count; i++)
        if (NSPointInRect(at, _spaceTabs[i].rectValue)) { _space = spaces[i]; [self.window makeFirstResponder:nil]; self.needsDisplay = YES; self.needsLayout = YES; return; }
    for (NSUInteger i = 0; i < _cards.count; i++)
        if (NSPointInRect(at, NSInsetRect(_cards[i].rectValue, -4, -4))) {
            NSString *key = nil;
            if (i) DPWashiPaletteAt(i - 1, &key, NULL, NULL, NULL, NULL);
            [self.window makeFirstResponder:nil];
            [self saveSpace:self.chosenSpace look:key ? @{ @"preset": key } : nil];   // a palette, fresh; or Main
            return;
        }
    if (self.spaceHasOwn && NSPointInRect(at, _resetRect)) {
        NSString *space = self.chosenSpace;
        NSDictionary *look = DPWashiSpaceLookOf(space);
        [self.window makeFirstResponder:nil];
        [self saveSpace:space look:look[@"preset"] ? @{ @"preset": look[@"preset"] } : nil];
        return;
    }
    for (NSUInteger i = 0; i < _paperHits.count; i++)
        if (NSPointInRect(at, _paperHits[i].rectValue)) { NSString *k; DPWashiPaperAt(i, &k, NULL, NULL, NULL); [self choose:&DPWashiPaper key:k]; return; }
    for (NSUInteger i = 0; i < _tapeHits.count; i++)
        if (NSPointInRect(at, _tapeHits[i].rectValue)) { NSString *k; DPWashiTapeAt(i, &k, NULL, NULL); [self choose:&DPWashiTape key:k]; return; }
}

- (void)resetCursorRects {
    for (NSValue *v in [[_paperHits arrayByAddingObjectsFromArray:_tapeHits] arrayByAddingObjectsFromArray:_modeHits]) [self addCursorRect:v.rectValue cursor:NSCursor.pointingHandCursor];
    for (NSValue *v in [_spaceTabs arrayByAddingObjectsFromArray:_cards]) [self addCursorRect:v.rectValue cursor:NSCursor.pointingHandCursor];
    if (self.spaceHasOwn) [self addCursorRect:_resetRect cursor:NSCursor.pointingHandCursor];
    if (!NSIsEmptyRect(_guideRect)) [self addCursorRect:_guideRect cursor:NSCursor.pointingHandCursor];
}
@end

NSArray<NSView *> *DPWashiLookRows(void) {
    DPWashiLookView *view = [DPWashiLookView new];
    view.translatesAutoresizingMaskIntoConstraints = NO;
    NSLayoutConstraint *height = [view.heightAnchor constraintEqualToConstant:420];
    height.active = YES;
    [view setHeightConstraint:height];
    return @[ view ];
}

#pragma mark Close-ups

// Each option's drawing: a close-up of just what it changes, in your paper and tape, at a size you can read.
static void DPArtCard(NSRect r, CGFloat radius, NSColor *card, BOOL dark, CGFloat lift) {
    if (lift > 0) { [[NSColor colorWithWhite:0 alpha:dark ? .42 : .14] setFill]; [[NSBezierPath bezierPathWithRoundedRect:NSOffsetRect(r, lift, lift) xRadius:radius yRadius:radius] fill]; }
    [card setFill]; [[NSBezierPath bezierPathWithRoundedRect:r xRadius:radius yRadius:radius] fill];
    [[[DPLookInk(dark) colorWithAlphaComponent:.1] colorWithAlphaComponent:.1] setStroke];
    NSBezierPath *edge = [NSBezierPath bezierPathWithRoundedRect:NSInsetRect(r, .5, .5) xRadius:radius yRadius:radius]; edge.lineWidth = 1; [edge stroke];
}
static void DPArtLine(CGFloat x, CGFloat y, CGFloat w, CGFloat h, NSColor *c) { [c setFill]; [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(x, y, w, h) xRadius:h / 2 yRadius:h / 2] fill]; }
static void DPArtText(NSString *t, NSPoint at, NSFont *f, NSColor *c) { [t drawAtPoint:at withAttributes:@{ NSFontAttributeName: f, NSForegroundColorAttributeName: c }]; }
static void DPArtLean(NSRect r, CGFloat degrees, void (^draw)(void)) {
    [NSGraphicsContext saveGraphicsState];
    NSAffineTransform *t = [NSAffineTransform transform];
    [t translateXBy:NSMidX(r) yBy:NSMidY(r)]; [t rotateByDegrees:degrees]; [t translateXBy:-NSMidX(r) yBy:-NSMidY(r)]; [t concat];
    draw();
    [NSGraphicsContext restoreGraphicsState];
}
// A sidebar tab: icon, title, and a card when it's the selected one.
static void DPArtTab(NSRect r, NSString *title, NSColor *icon, BOOL selected, NSColor *card, BOOL dark, NSColor *ink) {
    if (selected) DPArtCard(r, 8, card, dark, 1.2);
    [icon setFill]; [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(NSMinX(r) + 9, NSMidY(r) - 6, 12, 12) xRadius:3 yRadius:3] fill];
    DPArtText(title, NSMakePoint(NSMinX(r) + 28, NSMidY(r) - 8), DPWashiFigtree(12, selected ? NSFontWeightSemibold : NSFontWeightMedium), [ink colorWithAlphaComponent:selected ? .9 : .65]);
}

void DPWashiDrawArt(NSRect r, BOOL dark, NSColor *paper, NSColor *tape, NSString *spot) {
    NSColor *ink = DPLookInk(dark), *card = DPLookCard(paper, dark), *plain = [ink colorWithAlphaComponent:dark ? .12 : .07];
    NSColor *faint = [ink colorWithAlphaComponent:.22], *blue = DPLookHex(0x3d63ff), *green = DPLookHex(0x1f9d57), *orange = DPLookHex(0xff6a3d);
    NSBezierPath *frame = [NSBezierPath bezierPathWithRoundedRect:r xRadius:10 yRadius:10];
    [paper setFill]; [frame fill];
    [[ink colorWithAlphaComponent:.12] setStroke]; [frame stroke];
    [NSGraphicsContext saveGraphicsState]; [frame addClip];
    CGFloat x = NSMinX(r), y = NSMinY(r), w = NSWidth(r), h = NSHeight(r), cx = NSMidX(r);
    if ([spot isEqual:@"tape"]) {   // one selected tab, its tape on the corner
        NSRect tab = NSMakeRect(x + 22, y + 44, w - 44, 34);
        DPArtTab(NSOffsetRect(tab, 0, -40), @"Inbox", blue, NO, card, dark, ink);
        DPArtTab(tab, @"Hardware Inventory", orange, YES, card, dark, ink);
        DPArtTab(NSOffsetRect(tab, 0, 40), @"Okta", green, NO, card, dark, ink);
        DPLookTape(NSMakePoint(NSMinX(tab) + 14, NSMinY(tab) + 2), 30, 11, -20, tape);
    } else if ([spot isEqual:@"cards"]) {   // favorites and the selected tab as card paper, Dia's grey for the rest
        CGFloat tw = (w - 56) / 3;
        for (NSUInteger i = 0; i < 3; i++) { NSRect t = NSMakeRect(x + 16 + i * (tw + 12), y + 14, tw, 34); DPArtLean(t, i == 1 ? .9 : -1, ^{ DPArtCard(t, 8, card, dark, 2); }); [@[ blue, green, orange ][i] setFill]; [[NSBezierPath bezierPathWithOvalInRect:NSMakeRect(NSMidX(t) - 6, NSMidY(t) - 6, 12, 12)] fill]; }
        DPArtTab(NSMakeRect(x + 12, y + 62, w - 24, 30), @"Selected tab", orange, YES, card, dark, ink);
        DPArtTab(NSMakeRect(x + 12, y + 96, w - 24, 26), @"Another tab", blue, NO, card, dark, ink);
    } else if ([spot isEqual:@"hand"]) {   // the space's name in handwriting, and the pinned divider in pencil
        DPArtText(@"Personal", NSMakePoint(x + 16, y + 10), DPCaveat(34), [ink colorWithAlphaComponent:.88]);
        DPArtTab(NSMakeRect(x + 10, y + 58, w - 20, 26), @"Calendar", blue, NO, card, dark, ink);
        NSBezierPath *pencil = [NSBezierPath bezierPath]; pencil.lineWidth = 1.4; pencil.lineCapStyle = NSLineCapStyleRound;
        [pencil moveToPoint:NSMakePoint(x + 16, y + 92)];
        for (CGFloat px = x + 16; px < x + w - 16; px += 6) [pencil lineToPoint:NSMakePoint(px + 6, y + 92 + .9 * sin((px - x) / 9.0) + .45 * sin((px - x) / 3.7))];
        [[ink colorWithAlphaComponent:.3] setStroke]; [pencil stroke];
        DPArtTab(NSMakeRect(x + 10, y + 98, w - 20, 26), @"Notes", green, NO, card, dark, ink);
    } else if ([spot isEqual:@"scrapbook"]) {   // crooked taped favorites, a slanted name, a stamp that wiggles
        CGFloat tw = (w - 56) / 3;
        for (NSUInteger i = 0; i < 3; i++) {
            NSRect t = NSMakeRect(x + 16 + i * (tw + 12), y + 18, tw, 32);
            CGFloat lean = i == 1 ? 5 : i ? -4 : -6;
            DPArtLean(t, lean, ^{ DPArtCard(t, 8, card, dark, 2); DPLookTape(NSMakePoint(NSMidX(t), NSMinY(t) + 1), 30, 11, i % 2 ? -6 : 6, tape); });
        }
        NSRect name = NSMakeRect(x + 16, y + 62, 110, 34);
        DPArtLean(name, -2.5, ^{ DPArtText(@"Personal", NSMakePoint(NSMinX(name), NSMinY(name)), DPCaveat(28), ink); });
        NSRect stamp = NSMakeRect(x + w - 50, y + 72, 30, 30);
        DPArtLean(stamp, -12, ^{ DPArtCard(stamp, 15, card, dark, 1); DPArtLine(NSMidX(stamp) - 6, NSMidY(stamp) - 1, 12, 2.2, faint); });
        // wiggle marks either side of the stamp
        [[ink colorWithAlphaComponent:.4] setStroke];
        for (NSNumber *side in @[ @-1, @1 ]) {
            NSBezierPath *wig = [NSBezierPath bezierPath]; wig.lineWidth = 1.4; wig.lineCapStyle = NSLineCapStyleRound;
            CGFloat sx = NSMidX(stamp) + side.doubleValue * 21;
            [wig moveToPoint:NSMakePoint(sx, NSMidY(stamp) - 7)];
            [wig curveToPoint:NSMakePoint(sx, NSMidY(stamp) + 7) controlPoint1:NSMakePoint(sx + side.doubleValue * 5, NSMidY(stamp) - 3) controlPoint2:NSMakePoint(sx + side.doubleValue * 5, NSMidY(stamp) + 3)];
            [wig stroke];
        }
    } else if ([spot isEqual:@"lift"]) {   // a tab lifting under the pointer, a new tab dropping in
        DPArtTab(NSMakeRect(x + 12, y + 14, w - 24, 28), @"Resting tab", blue, NO, card, dark, ink);
        NSRect up = NSMakeRect(x + 12, y + 48, w - 24, 30);
        [[NSColor colorWithWhite:0 alpha:dark ? .32 : .1] setFill]; [[NSBezierPath bezierPathWithRoundedRect:NSOffsetRect(up, 1, 3) xRadius:8 yRadius:8] fill];
        [[ink colorWithAlphaComponent:.07] setFill]; [[NSBezierPath bezierPathWithRoundedRect:up xRadius:8 yRadius:8] fill];
        DPArtTab(up, @"Under the pointer", green, NO, card, dark, ink);
        NSPoint tip = NSMakePoint(NSMaxX(up) - 30, NSMidY(up) + 2);
        NSBezierPath *arrow = [NSBezierPath bezierPath];
        [arrow moveToPoint:tip]; [arrow lineToPoint:NSMakePoint(tip.x, tip.y + 14)]; [arrow lineToPoint:NSMakePoint(tip.x + 4, tip.y + 10)]; [arrow lineToPoint:NSMakePoint(tip.x + 9.5, tip.y + 9.5)]; [arrow closePath];
        [NSColor.blackColor setFill]; [arrow fill]; [NSColor.whiteColor setStroke]; arrow.lineWidth = 1; [arrow stroke];
        NSRect drop = NSMakeRect(x + 12, y + 88, w - 24, 28);
        [[ink colorWithAlphaComponent:.25] setStroke];
        NSBezierPath *fall = [NSBezierPath bezierPath]; CGFloat d[] = { 2, 2 }; [fall setLineDash:d count:2 phase:0];
        [fall moveToPoint:NSMakePoint(NSMaxX(drop) - 14, NSMinY(drop) - 6)]; [fall lineToPoint:NSMakePoint(NSMaxX(drop) - 14, NSMinY(drop) + 2)]; [fall stroke];
        DPArtTab(drop, @"New tab", orange, NO, card, dark, ink);
    } else if ([spot isEqual:@"bars"]) {   // the toolbar on paper, the address field a card, bookmarks below
        [faint setFill];
        for (NSUInteger i = 0; i < 3; i++) [[NSBezierPath bezierPathWithOvalInRect:NSMakeRect(x + 14 + i * 16, y + 22, 8, 8)] fill];
        NSRect field = NSMakeRect(x + 66, y + 14, w - 80, 24);
        DPArtCard(field, 7, card, dark, 0);
        DPArtText(@"github.com / Washi", NSMakePoint(NSMinX(field) + 10, NSMinY(field) + 4), DPWashiFigtree(12, NSFontWeightSemibold), [ink colorWithAlphaComponent:.8]);
        [[ink colorWithAlphaComponent:.12] setFill]; NSRectFillUsingOperation(NSMakeRect(x, y + 48, w, 1), NSCompositingOperationSourceOver);
        NSArray *marks = @[ @"Docs", @"Okta", @"Jira" ];
        for (NSUInteger i = 0; i < 3; i++) { [@[ green, blue, orange ][i] setFill]; [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(x + 16 + i * 58, y + 60, 10, 10) xRadius:2 yRadius:2] fill]; DPArtText(marks[i], NSMakePoint(x + 30 + i * 58, y + 57), DPWashiFigtree(11.5, NSFontWeightMedium), [ink colorWithAlphaComponent:.7]); }
        NSRect page = NSMakeRect(x + 8, y + 84, w - 16, 60);
        [(dark ? DPLookHex(0x232323) : NSColor.whiteColor) setFill]; [[NSBezierPath bezierPathWithRoundedRect:page xRadius:6 yRadius:6] fill];
    } else if ([spot isEqual:@"sheet"]) {   // the page laid on the paper, its cut-paper shadow showing
        NSRect page = NSMakeRect(x + 30, y + 14, w - 52, h - 30);
        [[NSColor colorWithWhite:0 alpha:dark ? .45 : .16] setFill]; [[NSBezierPath bezierPathWithRoundedRect:NSOffsetRect(page, 4, 4) xRadius:7 yRadius:7] fill];
        [(dark ? DPLookHex(0x232323) : NSColor.whiteColor) setFill]; [[NSBezierPath bezierPathWithRoundedRect:page xRadius:7 yRadius:7] fill];
        NSColor *text = dark ? [NSColor colorWithWhite:1 alpha:.22] : [NSColor colorWithWhite:0 alpha:.13];
        DPArtLine(NSMinX(page) + 14, NSMinY(page) + 14, NSWidth(page) * .5, 7, text);
        for (NSUInteger i = 0; i < 5; i++) DPArtLine(NSMinX(page) + 14, NSMinY(page) + 32 + i * 11, (NSWidth(page) - 28) * (i == 4 ? .5 : .92), 4, text);
    } else if ([spot isEqual:@"popups"]) {   // a pop-up on card paper hanging from its button
        NSRect button = NSMakeRect(x + 22, y + 12, 26, 26);
        DPArtCard(button, 8, plain, dark, 0);
        DPArtLine(NSMidX(button) - 5, NSMidY(button) - 1, 10, 2.2, faint);
        NSRect pop = NSMakeRect(x + 16, y + 46, w - 60, 74);
        [[NSColor colorWithWhite:0 alpha:dark ? .45 : .16] setFill]; [[NSBezierPath bezierPathWithRoundedRect:NSOffsetRect(pop, 0, 4) xRadius:10 yRadius:10] fill];
        DPArtCard(pop, 10, card, dark, 0);
        NSArray *rows = @[ @"Claude.dmg", @"Snapshot.png", @"Notes.pdf" ];
        for (NSUInteger i = 0; i < 3; i++) { DPArtText(rows[i], NSMakePoint(NSMinX(pop) + 30, NSMinY(pop) + 10 + i * 21), DPWashiFigtree(12, NSFontWeightMedium), [ink colorWithAlphaComponent:.75]); DPArtLine(NSMinX(pop) + 12, NSMinY(pop) + 16 + i * 21, 10, 3, faint); }
    } else if ([spot isEqual:@"newtab"]) {   // Washi's new tab: the hello, the date, the bar
        NSDictionary *hand = @{ NSFontAttributeName: DPCaveat(28), NSForegroundColorAttributeName: ink };
        NSSize hs = [@"Good evening" sizeWithAttributes:hand];
        [@"Good evening" drawAtPoint:NSMakePoint(cx - hs.width / 2, y + 12) withAttributes:hand];
        NSDictionary *date = @{ NSFontAttributeName: DPWashiFigtree(11, NSFontWeightSemibold), NSForegroundColorAttributeName: [ink colorWithAlphaComponent:.55] };
        NSSize ds = [@"Thursday, November 5" sizeWithAttributes:date];
        [@"Thursday, November 5" drawAtPoint:NSMakePoint(cx - ds.width / 2, y + 50) withAttributes:date];
        NSRect bar = NSMakeRect(x + 20, y + 74, w - 40, 30);
        DPArtCard(bar, 10, card, dark, 2);
        DPArtText(@"Ask anything…", NSMakePoint(NSMinX(bar) + 12, NSMinY(bar) + 7), DPWashiFigtree(12, NSFontWeightMedium), [ink colorWithAlphaComponent:.45]);
    } else if ([spot isEqual:@"commandbar"]) {   // the command bar as a card, taped down in Scrapbook
        NSRect bar = NSMakeRect(x + 14, y + 26, w - 28, 72);
        DPArtCard(bar, 14, card, dark, 3);
        DPArtText(@"Ask anything…", NSMakePoint(NSMinX(bar) + 16, NSMinY(bar) + 12), DPWashiFigtree(13, NSFontWeightMedium), [ink colorWithAlphaComponent:.45]);
        NSRect add = NSMakeRect(NSMinX(bar) + 12, NSMaxY(bar) - 30, 96, 20);
        [[ink colorWithAlphaComponent:.2] setStroke]; [[NSBezierPath bezierPathWithRoundedRect:add xRadius:10 yRadius:10] stroke];
        DPArtText(@"+ Add tabs", NSMakePoint(NSMinX(add) + 12, NSMinY(add) + 2), DPWashiFigtree(11, NSFontWeightMedium), [ink colorWithAlphaComponent:.6]);
        DPLookTape(NSMakePoint(cx, NSMinY(bar)), 46, 13, 2, tape);
    } else if ([spot isEqual:@"ticket"]) {   // the Now Playing ticket: stub, handwriting, equalizer
        NSRect t = NSMakeRect(x + 16, y + 40, w - 32, 48);
        DPArtLean(t, -1, ^{
            DPArtCard(t, 7, card, dark, 1.5);
            NSBezierPath *perf = [NSBezierPath bezierPath]; CGFloat d[] = { 2, 2.5 }; [perf setLineDash:d count:2 phase:0];
            [perf moveToPoint:NSMakePoint(NSMinX(t) + 38, NSMinY(t) + 6)]; [perf lineToPoint:NSMakePoint(NSMinX(t) + 38, NSMaxY(t) - 6)];
            [[ink colorWithAlphaComponent:.3] setStroke]; [perf stroke];
            [DPLookHex(0xff0033) setFill]; [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(NSMinX(t) + 11, NSMidY(t) - 8, 16, 16) xRadius:4 yRadius:4] fill];
            DPArtText(@"Now playing", NSMakePoint(NSMinX(t) + 46, NSMinY(t) + 3), DPCaveat(17), [ink colorWithAlphaComponent:.6]);
            DPArtText(@"The Scam that Broke Polls", NSMakePoint(NSMinX(t) + 46, NSMinY(t) + 24), DPWashiFigtree(11.5, NSFontWeightSemibold), ink);
            for (NSUInteger i = 0; i < 3; i++) { static const CGFloat bars[] = { 9, 14, 6 }; CGFloat bh = bars[i]; [tape setFill]; [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(NSMaxX(t) - 22 + i * 5, NSMidY(t) + 7 - bh, 3, bh) xRadius:1 yRadius:1] fill]; }
        });
        DPLookTape(NSMakePoint(NSMaxX(t) - 30, NSMinY(t)), 30, 11, 6, tape);
    } else if ([spot isEqual:@"folders"]) {   // a manila folder in its color, its icon, its tabs on a line
        NSRect head = NSMakeRect(x + 12, y + 14, w - 24, 34);
        NSColor *fc = green, *fpaper = dark ? [DPLookHex(0x2e2820) blendedColorWithFraction:.3 ofColor:fc] : [DPLookHex(0xfdf8ec) blendedColorWithFraction:.3 ofColor:fc];
        NSBezierPath *folder = [NSBezierPath bezierPath];
        [folder appendBezierPathWithRoundedRect:NSMakeRect(NSMinX(head), NSMinY(head) + 5, NSWidth(head), 29) xRadius:8 yRadius:8];
        [folder appendBezierPathWithRoundedRect:NSMakeRect(NSMinX(head), NSMinY(head), 40, 12) xRadius:5 yRadius:5];
        [[fc colorWithAlphaComponent:.4] setFill]; NSAffineTransform *dn = [NSAffineTransform transform]; [dn translateXBy:0 yBy:1]; NSBezierPath *sh = [folder copy]; [sh transformUsingAffineTransform:dn]; [sh fill];
        [fpaper setFill]; [folder fill];
        NSImage *icon = [[NSImage imageWithSystemSymbolName:@"wrench.and.screwdriver" accessibilityDescription:nil] imageWithSymbolConfiguration:[NSImageSymbolConfiguration configurationWithPointSize:13 weight:NSFontWeightSemibold]];
        NSImage *tinted = [NSImage imageWithSize:icon.size flipped:NO drawingHandler:^BOOL(NSRect rr) { [icon drawInRect:rr]; [(dark ? [fc blendedColorWithFraction:.25 ofColor:NSColor.whiteColor] : [fc blendedColorWithFraction:.2 ofColor:NSColor.blackColor]) set]; NSRectFillUsingOperation(rr, NSCompositingOperationSourceAtop); return YES; }];
        [tinted drawInRect:NSMakeRect(NSMinX(head) + 10, NSMinY(head) + 12, 16, 15) fromRect:NSZeroRect operation:NSCompositingOperationSourceOver fraction:1 respectFlipped:YES hints:nil];
        DPArtText(@"MDM", NSMakePoint(NSMinX(head) + 32, NSMinY(head) + 11), DPWashiFigtree(13, NSFontWeightSemibold), dark ? DPLookHex(0xf3ece2) : DPLookHex(0x2b2118));
        [[fc colorWithAlphaComponent:.45] setFill]; [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(NSMinX(head) + 10, NSMaxY(head) + 4, 2, 64) xRadius:1 yRadius:1] fill];
        DPArtTab(NSMakeRect(NSMinX(head) + 18, NSMaxY(head) + 4, NSWidth(head) - 18, 30), @"Iru", blue, NO, card, dark, ink);
        DPArtTab(NSMakeRect(NSMinX(head) + 18, NSMaxY(head) + 36, NSWidth(head) - 18, 30), @"Hexnode", ink, NO, card, dark, ink);
    } else if ([spot isEqual:@"polaroid"]) {   // a link's preview as a polaroid
        NSRect p = NSMakeRect(cx - 64, y + 12, 128, h - 24);
        DPArtLean(p, -2, ^{
            [[NSColor colorWithWhite:0 alpha:dark ? .45 : .2] setFill]; NSRectFillUsingOperation(NSOffsetRect(p, 2, 3), NSCompositingOperationSourceOver);
            [[card blendedColorWithFraction:.3 ofColor:NSColor.whiteColor] setFill]; NSRectFillUsingOperation(p, NSCompositingOperationSourceOver);
            NSRect photo = NSMakeRect(NSMinX(p) + 7, NSMinY(p) + 7, NSWidth(p) - 14, NSHeight(p) - 34);
            [(dark ? DPLookHex(0x2c3440) : DPLookHex(0xdfe6ee)) setFill]; NSRectFillUsingOperation(photo, NSCompositingOperationSourceOver);
            DPArtLine(NSMinX(photo) + 8, NSMinY(photo) + 10, 50, 5, [NSColor colorWithWhite:dark ? 1 : 0 alpha:.15]);
            NSDictionary *hand = @{ NSFontAttributeName: DPCaveat(18), NSForegroundColorAttributeName: [ink colorWithAlphaComponent:.85] };
            NSSize hs = [@"github.com" sizeWithAttributes:hand];
            [@"github.com" drawAtPoint:NSMakePoint(NSMidX(p) - hs.width / 2, NSMaxY(photo) + 2) withAttributes:hand];
            DPLookTape(NSMakePoint(NSMidX(p), NSMinY(p)), 40, 11, -3, tape);
        });
    } else if ([spot isEqual:@"quit"]) {   // the paper note ⌘Q shows
        NSRect note = NSMakeRect(x + 18, y + h / 2 - 22, w - 36, 44);
        DPArtCard(note, 8, card, dark, 2);
        NSMutableAttributedString *t = [[NSMutableAttributedString alloc] initWithString:@"Press " attributes:@{ NSFontAttributeName: DPCaveat(21), NSForegroundColorAttributeName: ink }];
        [t appendAttributedString:[[NSAttributedString alloc] initWithString:@"⌘Q" attributes:@{ NSFontAttributeName: DPWashiFigtree(14, NSFontWeightBold), NSForegroundColorAttributeName: ink, NSBaselineOffsetAttributeName: @2 }]];
        [t appendAttributedString:[[NSAttributedString alloc] initWithString:@" again to quit" attributes:@{ NSFontAttributeName: DPCaveat(21), NSForegroundColorAttributeName: ink }]];
        NSSize ts = t.size; [t drawAtPoint:NSMakePoint(cx - ts.width / 2, NSMidY(note) - ts.height / 2)];
    } else if ([spot isEqual:@"toasts"]) {   // one of Dia's notices on card paper
        // the bottom of a page, and Washi's toast rising from it: card paper, a tick in the tape color
        NSRect page = NSMakeRect(x + 8, y + 6, w - 16, h - 12);
        [(dark ? DPLookHex(0x232323) : DPLookHex(0xffffff)) setFill]; [[NSBezierPath bezierPathWithRoundedRect:page xRadius:8 yRadius:8] fill];
        for (NSUInteger i = 0; i < 3; i++) DPArtLine(NSMinX(page) + 14, NSMinY(page) + 16 + i * 12, (NSWidth(page) - 28) * (i == 2 ? .5 : .85), 4, faint);
        NSRect toast = NSMakeRect(cx - 82, NSMaxY(page) - 50, 164, 38);
        DPArtCard(toast, 12, card, dark, 2);
        NSImage *tick = [[NSImage imageWithSystemSymbolName:@"checkmark" accessibilityDescription:nil] imageWithSymbolConfiguration:[NSImageSymbolConfiguration configurationWithPointSize:12 weight:NSFontWeightBold]];
        NSImage *tinted = [NSImage imageWithSize:tick.size flipped:NO drawingHandler:^BOOL(NSRect rr) { [tick drawInRect:rr]; [tape set]; NSRectFillUsingOperation(rr, NSCompositingOperationSourceAtop); return YES; }];
        [tinted drawInRect:NSMakeRect(NSMinX(toast) + 13, NSMidY(toast) - tick.size.height / 2, tick.size.width, tick.size.height) fromRect:NSZeroRect operation:NSCompositingOperationSourceOver fraction:1 respectFlipped:YES hints:nil];
        DPArtText(@"Copied current URL", NSMakePoint(NSMinX(toast) + 33, NSMidY(toast) - 8), DPWashiFigtree(12, NSFontWeightSemibold), ink);
        if (DPWashiScrapbook.on) DPLookTape(NSMakePoint(cx, NSMinY(toast)), 40, 11, 3, tape);
    } else if ([spot isEqual:@"newtabtop"]) {   // "+ New Tab" at the top, under the name
        DPArtText(@"Personal", NSMakePoint(x + 16, y + 8), DPCaveat(26), [ink colorWithAlphaComponent:.88]);
        NSRect row = NSMakeRect(x + 10, y + 44, w - 20, 28);
        [[ink colorWithAlphaComponent:.06] setFill]; [[NSBezierPath bezierPathWithRoundedRect:row xRadius:8 yRadius:8] fill];
        DPArtText(@"+   New Tab", NSMakePoint(NSMinX(row) + 10, NSMinY(row) + 5), DPWashiFigtree(12.5, NSFontWeightMedium), [ink colorWithAlphaComponent:.7]);
        DPArtTab(NSMakeRect(x + 10, y + 78, w - 20, 26), @"Calendar", blue, NO, card, dark, ink);
        DPArtTab(NSMakeRect(x + 10, y + 106, w - 20, 26), @"Notes", green, NO, card, dark, ink);
    } else if ([spot isEqual:@"type"]) {   // Figtree, Washi's letters
        DPArtText(@"Aa", NSMakePoint(x + 16, y + 8), DPWashiFigtree(44, NSFontWeightBold), ink);
        DPArtText(@"Figtree", NSMakePoint(x + 86, y + 22), DPWashiFigtree(15, NSFontWeightSemibold), [ink colorWithAlphaComponent:.7]);
        DPArtTab(NSMakeRect(x + 10, y + 70, w - 20, 26), @"Hardware Inventory", orange, YES, card, dark, ink);
        DPArtTab(NSMakeRect(x + 10, y + 100, w - 20, 26), @"RBAC Okta Build Plan", green, NO, card, dark, ink);
    }
    [NSGraphicsContext restoreGraphicsState];
}

#pragma mark The drawings under each option

// Under each Washi option's switch on its page: the little Dia, in your paper and the Settings window's light or
// dark, with the part that option changes picked out. Scrapbook also gets how crooked it should be.
@interface DPWashiArtView : NSView
@property (nonatomic, copy) NSString *spot;
@end
@implementation DPWashiArtView {
    NSSegmentedControl *_tilt;
}
- (BOOL)isFlipped { return YES; }
- (void)viewDidChangeEffectiveAppearance { [super viewDidChangeEffectiveAppearance]; self.needsDisplay = YES; }
- (instancetype)initWithSpot:(NSString *)spot {
    if ((self = [super initWithFrame:NSZeroRect])) {
        _spot = [spot copy];
        self.translatesAutoresizingMaskIntoConstraints = NO;
        [self.heightAnchor constraintEqualToConstant:156].active = YES;
        [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(changed) name:DPPatchesDidChangeNotification object:nil];
        if ([spot isEqual:@"scrapbook"]) {
            _tilt = [NSSegmentedControl segmentedControlWithLabels:@[ @"Subtle", @"Playful", @"Wild" ] trackingMode:NSSegmentSwitchTrackingSelectOne target:self action:@selector(tilted:)];
            _tilt.controlSize = NSControlSizeSmall;
            NSString *v = [DPWashiDefaults() stringForKey:@"washiTilt"];
            _tilt.selectedSegment = [v isEqual:@"playful"] ? 1 : [v isEqual:@"wild"] ? 2 : 0;
            [self addSubview:_tilt];
        }
    }
    return self;
}
- (void)dealloc { [NSNotificationCenter.defaultCenter removeObserver:self]; }
- (void)changed { self.needsDisplay = YES; }
- (void)tilted:(NSSegmentedControl *)control {
    [DPWashiDefaults() setObject:@[ @"subtle", @"playful", @"wild" ][control.selectedSegment] forKey:@"washiTilt"];
    if (DPWashiPaper.on && DPWashiPaper.apply) DPWashiPaper.apply(&DPWashiPaper);
}
- (NSRect)artRect { CGFloat w = MIN(240, NSWidth(self.bounds) * .55); return NSMakeRect(0, 4, w, 146); }
- (void)layout {
    [super layout];
    if (!_tilt) return;
    NSRect art = [self artRect];
    NSSize size = _tilt.fittingSize;
    _tilt.frame = NSMakeRect(NSMaxX(art) + 18, 40, MIN(size.width, NSWidth(self.bounds) - NSMaxX(art) - 18), size.height);
}
- (void)drawRect:(NSRect)dirty {
    BOOL dark = [[self.effectiveAppearance bestMatchFromAppearancesWithNames:@[ NSAppearanceNameAqua, NSAppearanceNameDarkAqua ]] isEqual:NSAppearanceNameDarkAqua];
    uint32_t light, darkRGB, tapeRGB;
    DPWashiPaperAt(DPLookPaperIndex(), NULL, NULL, &light, &darkRGB);
    DPWashiTapeAt(DPLookTapeIndex(), NULL, NULL, &tapeRGB);
    NSRect art = [self artRect];
    DPWashiDrawArt(art, dark, DPLookHex(dark ? darkRGB : light), DPLookHex(tapeRGB), _spot);
    if (_tilt) [@"How crooked" drawAtPoint:NSMakePoint(NSMaxX(art) + 18, 18) withAttributes:@{ NSFontAttributeName: DPWashiFigtree(12, NSFontWeightSemibold), NSForegroundColorAttributeName: NSColor.labelColor }];
}
@end

#define DPWashiArt(fn, spot) NSArray<NSView *> *fn(void) { return @[ [[DPWashiArtView alloc] initWithSpot:spot] ]; }
DPWashiArt(DPWashiArtTape, @"tape")
DPWashiArt(DPWashiArtCards, @"cards")
DPWashiArt(DPWashiArtHand, @"hand")
DPWashiArt(DPWashiArtScrapbook, @"scrapbook")
DPWashiArt(DPWashiArtLift, @"lift")
DPWashiArt(DPWashiArtBars, @"bars")
DPWashiArt(DPWashiArtSheet, @"sheet")
DPWashiArt(DPWashiArtPopups, @"popups")
DPWashiArt(DPWashiArtNewTab, @"newtab")
DPWashiArt(DPWashiArtCommandBar, @"commandbar")
DPWashiArt(DPWashiArtTicket, @"ticket")
DPWashiArt(DPWashiArtFolders, @"folders")
DPWashiArt(DPWashiArtPolaroid, @"polaroid")
DPWashiArt(DPWashiArtQuit, @"quit")
DPWashiArt(DPWashiArtToasts, @"toasts")
DPWashiArt(DPWashiArtNewTabTop, @"newtabtop")
DPWashiArt(DPWashiArtType, @"type")
