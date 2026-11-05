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
NSArray<NSString *> *DPWashiSpaces(void);   // WashiTape.m

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
    NSMutableArray<NSArray *> *_spaceHits;   // rect, space, tape key ("" for the main tape)
}
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
        _paperHits = [NSMutableArray new]; _tapeHits = [NSMutableArray new]; _modeHits = [NSMutableArray new]; _spaceHits = [NSMutableArray new];
        _needed = 420;
        self.identifier = @"Your Look";
        NSMutableArray *feel = [NSMutableArray new];
        for (NSArray *row in DPFeelRows()) {
            NSSwitch *sw = [NSSwitch new];
            sw.controlSize = NSControlSizeSmall;
            sw.identifier = row[0]; sw.accessibilityLabel = row[1];
            sw.target = self; sw.action = @selector(feel:);
            [self addSubview:sw]; [feel addObject:sw];
        }
        _feel = feel;
        [self syncFeel];
        [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(changed) name:DPPatchesDidChangeNotification object:nil];
    }
    return self;
}
- (void)dealloc { [NSNotificationCenter.defaultCenter removeObserver:self]; }
- (void)changed { [self syncFeel]; self.needsDisplay = YES; }
- (void)syncFeel { for (NSSwitch *sw in _feel) sw.state = DPFeelOn(sw.identifier) ? NSControlStateValueOn : NSControlStateValueOff; }
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
- (CGFloat)feelTopFor:(CGFloat)W {
    CGFloat pw = floor((W - 8 - 14) / 2), ph = round(pw * .62);
    return 44 + ph + 32 + 3 * 21 + 10 + 22 + 70 + 30 + 18 + [self spacesHeight];
}
// Spaces, when there's more than one: each can have its own tape.
- (CGFloat)spacesHeight { NSUInteger n = DPWashiSpaces().count; return n > 1 ? 44 + n * 32 : 0; }
- (BOOL)isFlipped { return YES; }
- (NSSize)intrinsicContentSize { return NSMakeSize(NSViewNoIntrinsicMetric, _needed); }
- (void)setHeightConstraint:(NSLayoutConstraint *)c { _height = c; }
// Everything below the drawings has a fixed height; the drawings grow with the width.
- (CGFloat)neededFor:(CGFloat)W {
    return [self feelTopFor:W] + 24 + 3 * 40 + 4;
}
- (void)layout {
    [super layout];
    CGFloat need = [self neededFor:NSWidth(self.bounds)], top = [self feelTopFor:NSWidth(self.bounds)];
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
void DPWashiDrawMini(NSRect r, BOOL dark, NSColor *paper, NSColor *tape, NSString *spot) {
    NSColor *ink = DPLookInk(dark), *card = DPLookCard(paper, dark);
    NSColor *shade = [NSColor colorWithWhite:0 alpha:dark ? .35 : .12];
    // Drawn as your switches are now, with the option being shown always on.
    extern DPPatch DPWashiTape, DPWashiScrapbook, DPWashiCards, DPWashiHand;
    BOOL tapeOn = DPWashiTape.on || [spot isEqual:@"tape"], cardsOn = DPWashiCards.on || [spot isEqual:@"cards"], handOn = DPWashiHand.on || [spot isEqual:@"hand"];
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
    if ([spot isEqual:@"ticket"]) {
        ticket = NSMakeRect(x + 5, y + h - 22, side - 10, 15);
        [shade setFill]; [[NSBezierPath bezierPathWithRoundedRect:NSOffsetRect(ticket, 1, 1) xRadius:3 yRadius:3] fill];
        [card setFill]; [[NSBezierPath bezierPathWithRoundedRect:ticket xRadius:3 yRadius:3] fill];
        NSBezierPath *perf = [NSBezierPath bezierPath];
        [perf moveToPoint:NSMakePoint(NSMinX(ticket) + 12, NSMinY(ticket) + 2)]; [perf lineToPoint:NSMakePoint(NSMinX(ticket) + 12, NSMaxY(ticket) - 2)];
        CGFloat d[] = { 1.5, 1.5 }; [perf setLineDash:d count:2 phase:0]; [[ink colorWithAlphaComponent:.3] setStroke]; [perf stroke];
        [@"Now playing" drawAtPoint:NSMakePoint(NSMinX(ticket) + 15, NSMinY(ticket) + 1) withAttributes:@{ NSFontAttributeName: DPCaveat(9), NSForegroundColorAttributeName: [ink colorWithAlphaComponent:.7] }];
    }
    // a folder holding the last two tabs, on card paper with a paper icon
    NSRect folder = NSZeroRect;
    if ([spot isEqual:@"folders"]) {
        folder = NSMakeRect(x + 4, y + 48 + 2 * 12 - 2, side - 8, 26);
        [shade setFill]; [[NSBezierPath bezierPathWithRoundedRect:NSOffsetRect(folder, .8, .8) xRadius:4 yRadius:4] fill];
        [[card colorWithAlphaComponent:.92] setFill]; [[NSBezierPath bezierPathWithRoundedRect:folder xRadius:4 yRadius:4] fill];
        NSImage *icon = [[NSImage imageWithSystemSymbolName:@"wrench.and.screwdriver" accessibilityDescription:nil] imageWithSymbolConfiguration:[NSImageSymbolConfiguration configurationWithPointSize:6 weight:NSFontWeightBold]];
        NSImage *tinted = [NSImage imageWithSize:icon.size flipped:NO drawingHandler:^BOOL(NSRect rect) { [icon drawInRect:rect]; [tape set]; NSRectFillUsingOperation(rect, NSCompositingOperationSourceAtop); return YES; }];
        [tinted drawInRect:NSMakeRect(NSMinX(folder) + 4, NSMinY(folder) + 2, 7, 7) fromRect:NSZeroRect operation:NSCompositingOperationSourceOver fraction:1 respectFlipped:YES hints:nil];
        [@"MDM" drawAtPoint:NSMakePoint(NSMinX(folder) + 13, NSMinY(folder) + 1) withAttributes:@{ NSFontAttributeName: [NSFont systemFontOfSize:6 weight:NSFontWeightSemibold], NSForegroundColorAttributeName: [ink colorWithAlphaComponent:.7] }];
        [[ink colorWithAlphaComponent:.28] setFill];
        for (NSUInteger i = 0; i < 2; i++) [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(NSMinX(folder) + 13, NSMinY(folder) + 12 + i * 6, NSWidth(folder) * (i ? .4 : .55), 2.2) xRadius:1.1 yRadius:1.1] fill];
    }
    // What the option changes.
    if ([spot isEqual:@"tape"]) [spots addObject:[NSValue valueWithRect:NSInsetRect(NSMakeRect(NSMinX(selected), NSMinY(selected) - 3, 14, 8), -1, -1)]];
    else if ([spot isEqual:@"cards"]) { [spots addObject:[NSValue valueWithRect:NSInsetRect(favs, -2, -2)]]; [spots addObject:[NSValue valueWithRect:NSInsetRect(selected, -2, -2)]]; }
    else if ([spot isEqual:@"hand"]) [spots addObject:[NSValue valueWithRect:NSInsetRect(name, -1, -1)]];
    else if (tilt) { [spots addObject:[NSValue valueWithRect:NSInsetRect(favs, -3, -3)]]; [spots addObject:[NSValue valueWithRect:NSInsetRect(name, -1, -1)]]; }
    else if (lift) [spots addObject:[NSValue valueWithRect:NSInsetRect(lifted, -2, -2)]];
    else if ([spot isEqual:@"bars"]) [spots addObject:[NSValue valueWithRect:NSInsetRect(bar, 1, 1)]];
    else if ([spot isEqual:@"sheet"]) [spots addObject:[NSValue valueWithRect:NSInsetRect(page, -3, -3)]];
    else if ([spot isEqual:@"popups"]) [spots addObject:[NSValue valueWithRect:NSInsetRect(popup, -2, -2)]];
    else if ([spot isEqual:@"newtab"]) [spots addObject:[NSValue valueWithRect:NSInsetRect(page, 1, 1)]];
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
    NSDictionary *bold = @{ NSFontAttributeName: [NSFont systemFontOfSize:12 weight:NSFontWeightSemibold], NSForegroundColorAttributeName: label };
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
        [modes[i][1] drawInRect:NSMakeRect(NSMinX(cellRect) + 2, NSMidY(cellRect) - 8, NSWidth(cellRect) - 4, 16) withAttributes:@{ NSFontAttributeName: [NSFont systemFontOfSize:12 weight:NSFontWeightSemibold], NSForegroundColorAttributeName: on ? label : second, NSParagraphStyleAttributeName: mid }];
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
    NSDictionary *small = @{ NSFontAttributeName: [NSFont systemFontOfSize:11.5], NSForegroundColorAttributeName: second, NSParagraphStyleAttributeName: clip };
    for (NSArray *k in key) {
        NSRect chip = NSMakeRect(pad, y + 1, 24, 14);
        NSBezierPath *left = [NSBezierPath bezierPathWithRoundedRect:chip xRadius:4 yRadius:4];
        [NSGraphicsContext saveGraphicsState]; [left addClip];
        [k[0] setFill]; NSRectFill(chip);
        [k[1] setFill]; NSRectFill(NSMakeRect(NSMidX(chip), NSMinY(chip), NSWidth(chip) / 2, NSHeight(chip)));
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
        [DPLookHex(l) setFill]; NSRectFill(dot);
        NSBezierPath *lower = [NSBezierPath bezierPath];   // the dark paper, the lower right half
        [lower moveToPoint:NSMakePoint(NSMaxX(dot), NSMinY(dot))]; [lower lineToPoint:NSMakePoint(NSMaxX(dot), NSMaxY(dot))]; [lower lineToPoint:NSMakePoint(NSMinX(dot), NSMaxY(dot))]; [lower closePath];
        [DPLookHex(d) setFill]; [lower fill];
        [NSGraphicsContext restoreGraphicsState];
        if (i == pi) { NSBezierPath *ring = [NSBezierPath bezierPathWithOvalInRect:NSInsetRect(dot, -3.5, -3.5)]; ring.lineWidth = 2.5; [tape setStroke]; [ring stroke]; }
        else { [[label colorWithAlphaComponent:.16] setStroke]; [circle stroke]; }
        NSString *first = [name componentsSeparatedByString:@" "].firstObject;
        [first drawInRect:NSMakeRect(NSMinX(hit), y + 42, cell, 15) withAttributes:@{ NSFontAttributeName: [NSFont systemFontOfSize:11 weight:i == pi ? NSFontWeightSemibold : NSFontWeightRegular], NSForegroundColorAttributeName: i == pi ? label : second, NSParagraphStyleAttributeName: center }];
        [_paperHits addObject:[NSValue valueWithRect:hit]];
    }
    // Tape: a dot for each.
    y += 70;
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
    // Spaces: a row each, its name and the same dots, with "Same" for the main tape.
    [_spaceHits removeAllObjects];
    NSArray<NSString *> *spaces = DPWashiSpaces();
    if (spaces.count > 1) {
        CGFloat sy = y + 30 + 18;
        [[label colorWithAlphaComponent:.1] setFill]; NSRectFill(NSMakeRect(pad, sy - 10, W - pad * 2, 1));
        [@"Spaces" drawAtPoint:NSMakePoint(pad, sy) withAttributes:bold];
        [@"Give a space its own tape: its tabs, Scrapbook tape and dot use it." drawInRect:NSMakeRect(pad + 54, sy + 1, W - pad * 2 - 54, 15) withAttributes:small];
        NSDictionary *spaceName = @{ NSFontAttributeName: DPCaveat(17), NSForegroundColorAttributeName: label };
        NSMutableParagraphStyle *tail = [NSMutableParagraphStyle new]; tail.lineBreakMode = NSLineBreakByTruncatingTail;
        for (NSUInteger r = 0; r < spaces.count; r++) {
            CGFloat ry = sy + 26 + r * 32;
            NSString *own = DPWashiSpaceTape(spaces[r]) ?: @"";
            NSMutableDictionary *nameAttrs = [spaceName mutableCopy]; nameAttrs[NSParagraphStyleAttributeName] = tail;
            [spaces[r] drawInRect:NSMakeRect(pad, ry + 2, 66, 24) withAttributes:nameAttrs];
            for (NSUInteger i = 0; i <= DPWashiTapeCount(); i++) {
                NSRect hit = NSMakeRect(pad + 74 + i * 34, ry, 30, 30), dot = NSInsetRect(hit, 5, 5);
                NSString *key = @"";
                if (i == 0) {   // Same as the main tape: a dashed ring
                    NSBezierPath *ring = [NSBezierPath bezierPathWithOvalInRect:dot];
                    CGFloat dash[] = { 2.5, 2 }; [ring setLineDash:dash count:2 phase:0]; ring.lineWidth = 1.4;
                    [tape setStroke]; [ring stroke];
                } else {
                    uint32_t rgb; DPWashiTapeAt(i - 1, &key, NULL, &rgb);
                    [DPLookHex(rgb) setFill]; [[NSBezierPath bezierPathWithOvalInRect:dot] fill];
                }
                if ([own isEqual:key]) { NSBezierPath *ring = [NSBezierPath bezierPathWithOvalInRect:NSInsetRect(dot, -3, -3)]; ring.lineWidth = 2; [label setStroke]; [ring stroke]; }
                [_spaceHits addObject:@[ [NSValue valueWithRect:hit], spaces[r], key ]];
            }
        }
    }
    // Feel: each a title and a line under it, with its switch on the right.
    CGFloat top = [self feelTopFor:W];
    [[label colorWithAlphaComponent:.1] setFill]; NSRectFill(NSMakeRect(pad, top - 10, W - pad * 2, 1));
    [@"Feel" drawAtPoint:NSMakePoint(pad, top) withAttributes:bold];
    NSArray *rows = DPFeelRows();
    for (NSUInteger i = 0; i < rows.count; i++) {
        CGFloat ry = top + 24 + i * 40;
        [rows[i][1] drawAtPoint:NSMakePoint(pad, ry + 1) withAttributes:@{ NSFontAttributeName: [NSFont systemFontOfSize:13], NSForegroundColorAttributeName: label }];
        [rows[i][2] drawInRect:NSMakeRect(pad, ry + 18, W - pad * 2 - 56, 15) withAttributes:small];
    }
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
    for (NSArray *hit in _spaceHits)
        if (NSPointInRect(at, [hit[0] rectValue])) {
            NSMutableDictionary *all = [[DPWashiDefaults() dictionaryForKey:@"washiSpaceTapes"] mutableCopy] ?: [NSMutableDictionary new];
            if ([hit[2] length]) all[hit[1]] = hit[2]; else [all removeObjectForKey:hit[1]];
            [DPWashiDefaults() setObject:all forKey:@"washiSpaceTapes"];
            if (DPWashiPaper.on && DPWashiPaper.apply) DPWashiPaper.apply(&DPWashiPaper);
            self.needsDisplay = YES;
            return;
        }
    for (NSUInteger i = 0; i < _paperHits.count; i++)
        if (NSPointInRect(at, _paperHits[i].rectValue)) { NSString *k; DPWashiPaperAt(i, &k, NULL, NULL, NULL); [self choose:&DPWashiPaper key:k]; return; }
    for (NSUInteger i = 0; i < _tapeHits.count; i++)
        if (NSPointInRect(at, _tapeHits[i].rectValue)) { NSString *k; DPWashiTapeAt(i, &k, NULL, NULL); [self choose:&DPWashiTape key:k]; return; }
}

- (void)resetCursorRects {
    for (NSValue *v in [[_paperHits arrayByAddingObjectsFromArray:_tapeHits] arrayByAddingObjectsFromArray:_modeHits]) [self addCursorRect:v.rectValue cursor:NSCursor.pointingHandCursor];
    for (NSArray *hit in _spaceHits) [self addCursorRect:[hit[0] rectValue] cursor:NSCursor.pointingHandCursor];
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
        [self.heightAnchor constraintEqualToConstant:132].active = YES;
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
- (NSRect)artRect { CGFloat w = MIN(200, NSWidth(self.bounds) * .5); return NSMakeRect(0, 4, w, 124); }
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
    art.size.height = MIN(NSHeight(art), round(NSWidth(art) * .62));
    DPWashiDrawMini(art, dark, DPLookHex(dark ? darkRGB : light), DPLookHex(tapeRGB), _spot);
    if (_tilt) [@"How crooked" drawAtPoint:NSMakePoint(NSMaxX(art) + 18, 18) withAttributes:@{ NSFontAttributeName: [NSFont systemFontOfSize:12 weight:NSFontWeightSemibold], NSForegroundColorAttributeName: NSColor.labelColor }];
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
