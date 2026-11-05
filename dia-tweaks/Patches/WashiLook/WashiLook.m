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

@implementation DPWashiLookView {
    NSMutableArray<NSValue *> *_paperHits, *_tapeHits;
}
- (instancetype)initWithFrame:(NSRect)frame {
    if ((self = [super initWithFrame:frame])) {
        _paperHits = [NSMutableArray new]; _tapeHits = [NSMutableArray new];
        self.identifier = @"Your Look";
        [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(changed) name:DPPatchesDidChangeNotification object:nil];
    }
    return self;
}
- (void)dealloc { [NSNotificationCenter.defaultCenter removeObserver:self]; }
- (void)changed { self.needsDisplay = YES; }
- (BOOL)isFlipped { return YES; }
- (NSSize)intrinsicContentSize { return NSMakeSize(NSViewNoIntrinsicMetric, 352); }
- (void)viewDidChangeEffectiveAppearance { [super viewDidChangeEffectiveAppearance]; self.needsDisplay = YES; }

// A small Dia in this paper: sidebar with favorites, the name, tabs (the selected one a card with tape), the toolbar
// with its address field, and the page laid on the paper as a sheet.
- (void)drawMiniIn:(NSRect)r dark:(BOOL)dark paper:(NSColor *)paper tape:(NSColor *)tape {
    NSColor *ink = DPLookInk(dark), *card = DPLookCard(paper, dark);
    NSBezierPath *window = [NSBezierPath bezierPathWithRoundedRect:r xRadius:9 yRadius:9];
    [paper setFill]; [window fill];
    [[ink colorWithAlphaComponent:.14] setStroke]; window.lineWidth = 1; [window stroke];
    [NSGraphicsContext saveGraphicsState];
    [window addClip];
    CGFloat side = round(NSWidth(r) * .3), x = NSMinX(r), y = NSMinY(r), w = NSWidth(r), h = NSHeight(r);
    // traffic lights
    NSArray *lights = @[ DPLookHex(0xff5f57), DPLookHex(0xfebc2e), DPLookHex(0x28c840) ];
    for (NSUInteger i = 0; i < 3; i++) { [lights[i] setFill]; [[NSBezierPath bezierPathWithOvalInRect:NSMakeRect(x + 7 + i * 7, y + 7, 4.5, 4.5)] fill]; }
    // favorites: two cards with tape
    for (NSUInteger i = 0; i < 2; i++) {
        NSRect tile = NSMakeRect(x + 6 + i * ((side - 15) / 2 + 3), y + 18, (side - 15) / 2, 13);
        [[NSColor colorWithWhite:0 alpha:dark ? .35 : .12] setFill];
        [[NSBezierPath bezierPathWithRoundedRect:NSOffsetRect(tile, 1, 1) xRadius:3 yRadius:3] fill];
        [card setFill]; [[NSBezierPath bezierPathWithRoundedRect:tile xRadius:3 yRadius:3] fill];
        DPLookTape(NSMakePoint(NSMidX(tile), NSMinY(tile) + 1.5), 9, 3.5, i ? -6 : 6, tape);
    }
    // the space name, in handwriting
    [@"Personal" drawAtPoint:NSMakePoint(x + 7, y + 33) withAttributes:@{ NSFontAttributeName: DPCaveat(10.5), NSForegroundColorAttributeName: [ink colorWithAlphaComponent:.86] }];
    // tabs: the second is the selected card with its tape
    for (NSUInteger i = 0; i < 4; i++) {
        NSRect row = NSMakeRect(x + 5, y + 48 + i * 12, side - 10, 10);
        if (i == 1) {
            [[NSColor colorWithWhite:0 alpha:dark ? .35 : .12] setFill];
            [[NSBezierPath bezierPathWithRoundedRect:NSOffsetRect(row, .8, .8) xRadius:3 yRadius:3] fill];
            [card setFill]; [[NSBezierPath bezierPathWithRoundedRect:row xRadius:3 yRadius:3] fill];
            DPLookTape(NSMakePoint(NSMinX(row) + 4, NSMinY(row) + 1), 8, 3, -20, tape);
        }
        [[ink colorWithAlphaComponent:.3] setFill];
        [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(NSMinX(row) + 4, NSMidY(row) - 2, 4, 4) xRadius:1 yRadius:1] fill];
        [[ink colorWithAlphaComponent:i == 1 ? .55 : .28] setFill];
        [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(NSMinX(row) + 11, NSMidY(row) - 1.2, (NSWidth(row) - 18) * (i % 2 ? .8 : .6), 2.4) xRadius:1.2 yRadius:1.2] fill];
    }
    // toolbar: the address field as a card
    NSRect field = NSMakeRect(x + side + 22, y + 6, w - side - 30, 9);
    [card setFill]; [[NSBezierPath bezierPathWithRoundedRect:field xRadius:3 yRadius:3] fill];
    [[ink colorWithAlphaComponent:.1] setStroke]; [[NSBezierPath bezierPathWithRoundedRect:field xRadius:3 yRadius:3] stroke];
    [[ink colorWithAlphaComponent:.3] setFill];
    for (NSUInteger i = 0; i < 2; i++) [[NSBezierPath bezierPathWithOvalInRect:NSMakeRect(x + side + 4 + i * 8, y + 8.5, 4, 4)] fill];
    // the page, a sheet on the paper
    NSRect page = NSMakeRect(x + side, y + 20, w - side - 5, h - 25);
    [[NSColor colorWithWhite:0 alpha:dark ? .4 : .13] setFill];
    [[NSBezierPath bezierPathWithRoundedRect:NSOffsetRect(page, 1.5, 1.5) xRadius:5 yRadius:5] fill];
    [(dark ? DPLookHex(0x232323) : DPLookHex(0xffffff)) setFill];
    [[NSBezierPath bezierPathWithRoundedRect:page xRadius:5 yRadius:5] fill];
    NSColor *text = dark ? [NSColor colorWithWhite:1 alpha:.22] : [NSColor colorWithWhite:0 alpha:.13];
    [text setFill];
    [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(NSMinX(page) + 10, NSMinY(page) + 10, NSWidth(page) * .45, 5) xRadius:2 yRadius:2] fill];
    for (NSUInteger i = 0; i < 4; i++)
        [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(NSMinX(page) + 10, NSMinY(page) + 22 + i * 8, (NSWidth(page) - 20) * (i == 3 ? .55 : .9), 3) xRadius:1.5 yRadius:1.5] fill];
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
    NSDictionary *hand = @{ NSFontAttributeName: DPCaveat(19), NSForegroundColorAttributeName: label };
    for (NSUInteger i = 0; i < 2; i++) {
        NSRect r = NSMakeRect(pad + i * (pw + gap), 4, pw, ph);
        [self drawMiniIn:r dark:i == 1 paper:DPLookHex(i ? dark : light) tape:tape];
        NSString *name = i ? @"Dark" : @"Light";
        NSSize s = [name sizeWithAttributes:hand];
        [name drawAtPoint:NSMakePoint(NSMidX(r) - s.width / 2, NSMaxY(r) + 2) withAttributes:hand];
    }
    // The key: which color goes where.
    CGFloat y = 4 + ph + 32;
    NSArray *key = @[
        @[ DPLookHex(light), DPLookHex(dark), @"Paper", @"behind the sidebar, the toolbar and the page" ],
        @[ DPLookCard(DPLookHex(light), NO), DPLookCard(DPLookHex(dark), YES), @"Card", @"the selected tab, favorites, the address field, pop-ups" ],
        @[ tape, tape, @"Tape", @"the selected tab, and favorites in Scrapbook" ],
    ];
    NSDictionary *bold = @{ NSFontAttributeName: [NSFont systemFontOfSize:12 weight:NSFontWeightSemibold], NSForegroundColorAttributeName: label };
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
    [@"Tape" drawAtPoint:NSMakePoint(pad, y) withAttributes:bold];
    [_tapeHits removeAllObjects];
    for (NSUInteger i = 0; i < DPWashiTapeCount(); i++) {
        uint32_t rgb; DPWashiTapeAt(i, NULL, NULL, &rgb);
        NSRect hit = NSMakeRect(pad + 74 + i * 34, y - 6, 30, 30);
        NSRect dot = NSInsetRect(hit, 4, 4);
        [DPLookHex(rgb) setFill]; [[NSBezierPath bezierPathWithOvalInRect:dot] fill];
        if (i == ti) { NSBezierPath *ring = [NSBezierPath bezierPathWithOvalInRect:NSInsetRect(dot, -3, -3)]; ring.lineWidth = 2; [label setStroke]; [ring stroke]; }
        [_tapeHits addObject:[NSValue valueWithRect:hit]];
    }
}

- (void)choose:(DPPatch *)patch key:(NSString *)key {
    DPSetChoice(patch, key);   // saved even while that tweak is off
    if (patch != &DPWashiPaper && DPWashiPaper.on && DPWashiPaper.apply) DPWashiPaper.apply(&DPWashiPaper);   // everything Washi drew, at once
    self.needsDisplay = YES;
}

- (void)mouseDown:(NSEvent *)event {
    NSPoint at = [self convertPoint:event.locationInWindow fromView:nil];
    for (NSUInteger i = 0; i < _paperHits.count; i++)
        if (NSPointInRect(at, _paperHits[i].rectValue)) { NSString *k; DPWashiPaperAt(i, &k, NULL, NULL, NULL); [self choose:&DPWashiPaper key:k]; return; }
    for (NSUInteger i = 0; i < _tapeHits.count; i++)
        if (NSPointInRect(at, _tapeHits[i].rectValue)) { NSString *k; DPWashiTapeAt(i, &k, NULL, NULL); [self choose:&DPWashiTape key:k]; return; }
}

- (void)resetCursorRects {
    for (NSValue *v in [_paperHits arrayByAddingObjectsFromArray:_tapeHits]) [self addCursorRect:v.rectValue cursor:NSCursor.pointingHandCursor];
}
@end

NSArray<NSView *> *DPWashiLookRows(void) {
    DPWashiLookView *view = [DPWashiLookView new];
    view.translatesAutoresizingMaskIntoConstraints = NO;
    [view.heightAnchor constraintEqualToConstant:352].active = YES;
    return @[ view ];
}
