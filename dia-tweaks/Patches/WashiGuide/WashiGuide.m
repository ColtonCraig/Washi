#import "StdPatch/StdPatch.h"
#import "Patches/WashiShared/WashiShared.h"

// The Washi quick-start guide, as in Washi: a big drawing of Dia in your paper, with handwritten, numbered notes round
// it and a line from each note to its part. Point at a note and its part lights up in the tape color. Opened from
// Help › Washi Quick-start Guide and Settings › Washi, and once by itself the first time Washi is on.

void DPWashiDrawMini(NSRect r, BOOL dark, NSColor *paper, NSColor *tape, NSString *spot);   // WashiLook.m
NSRect DPWashiMiniPart(NSRect r, NSString *part);
NSFont *DPCaveat(CGFloat size);                                  // WashiHand.m
NSFont *DPWashiFigtree(CGFloat size, NSFontWeight weight);       // WashiType.m
NSView *DPWashiPaperMake(NSRect frame);                          // WashiPaper.m
uint32_t DPWashiMainPaperRGB(BOOL dark);
uint32_t DPWashiMainTapeRGB(void);                               // WashiTape.m

// The stage, in its own points; the window scales it to fit the screen.
static const CGFloat DPGW = 1060, DPGH = 690;
static const CGFloat DPStageX = 30, DPStageY = 84;              // where Washi's 1000×540 stage sits in it
static const NSRect DPMini = { { 250, 112 }, { 500, 310 } };    // the drawing, in stage points
static const CGFloat DPMiniW = 220;                              // the drawing's own width (it's drawn at this, scaled)

typedef struct { NSString *part, *title, *keys, *text, *side; CGFloat x, y, w; } DPGuideNote;
static const DPGuideNote DPNotes[] = {
    { @"tools", @"Back and forward", @"", @"And reload, on the toolbar’s paper.", @"top", 200, 0, 236 },
    { @"field", @"Address bar", @"⌘L", @"Type an address, or ask Dia anything.", @"top", 480, 0, 236 },
    { @"favs", @"Favorites", @"", @"Your pinned sites, each on a card.", @"left", 0, 104, 220 },
    { @"name", @"Your space", @"", @"Its name, handwritten. Its colors are in Settings › Washi.", @"left", 0, 176, 220 },
    { @"tab", @"Tabs", @"⌘T", @"The one you’re on is a card, taped down in Scrapbook.", @"left", 0, 248, 220 },
    { @"folders", @"Folders", @"", @"Drag tabs in. Team folders get their own icons.", @"left", 0, 320, 220 },
    { @"ticket", @"Now playing", @"", @"Music in another tab plays from this ticket.", @"left", 0, 392, 220 },
    { @"dots", @"Spaces", @"", @"A dot for each, in its tape. Swipe the sidebar to switch.", @"left", 0, 464, 220 },
    { @"page", @"Your page", @"", @"Every tab is a real page, laid on the paper.", @"right", 780, 170, 220 },
    { @"all", @"Make it yours", @"⌘,", @"Paper, tape, Scrapbook and more, in Settings › Washi.", @"right", 780, 320, 220 },
};
static const NSUInteger DPNoteCount = sizeof DPNotes / sizeof *DPNotes;

static BOOL DPGuideDark(NSView *view) {
    return [[view.effectiveAppearance bestMatchFromAppearancesWithNames:@[ NSAppearanceNameAqua, NSAppearanceNameDarkAqua ]] isEqual:NSAppearanceNameDarkAqua];
}
static NSColor *DPGuideInk(BOOL dark) { return DPWashiRGB(dark ? 0xf3ece2 : 0x2b2118); }
static NSColor *DPGuideTape(void) { return DPWashiRGB(DPWashiMainTapeRGB()); }

// A part's rect in stage points.
static NSRect DPGuidePart(NSString *part) {
    NSRect mini = NSMakeRect(0, 0, DPMiniW, DPMiniW * NSHeight(DPMini) / NSWidth(DPMini));
    NSRect r = DPWashiMiniPart(mini, part);
    CGFloat k = NSWidth(DPMini) / DPMiniW;
    return NSMakeRect(NSMinX(DPMini) + NSMinX(r) * k, NSMinY(DPMini) + NSMinY(r) * k, NSWidth(r) * k, NSHeight(r) * k);
}

#pragma mark A note

@class DPWashiGuideView;
@interface DPWashiGuideNote : NSView
@property (nonatomic) NSUInteger index;
@property (nonatomic) BOOL lit;
@property (nonatomic, weak) DPWashiGuideView *guide;
@end

@interface DPWashiGuideView : NSView
@property (nonatomic, copy) NSString *lit;   // the part lit up, or nil
- (void)light:(NSString *)part;
@end

static NSAttributedString *DPNoteText(const DPGuideNote *n, BOOL dark) {
    NSMutableParagraphStyle *para = [NSMutableParagraphStyle new];
    para.alignment = [n->side isEqual:@"left"] ? NSTextAlignmentRight : NSTextAlignmentLeft; para.lineSpacing = 1;
    return [[NSAttributedString alloc] initWithString:n->text attributes:@{ NSFontAttributeName: DPWashiFigtree(13, NSFontWeightMedium),
        NSForegroundColorAttributeName: [DPGuideInk(dark) colorWithAlphaComponent:.72], NSParagraphStyleAttributeName: para }];
}
static CGFloat DPNoteHeight(const DPGuideNote *n) {
    NSRect r = [DPNoteText(n, NO) boundingRectWithSize:NSMakeSize(n->w - 8, 200) options:NSStringDrawingUsesLineFragmentOrigin];
    return 32 + ceil(NSHeight(r)) + 4;
}

@implementation DPWashiGuideNote
- (BOOL)isFlipped { return YES; }
- (void)updateTrackingAreas {
    [super updateTrackingAreas];
    for (NSTrackingArea *a in self.trackingAreas) [self removeTrackingArea:a];
    [self addTrackingArea:[[NSTrackingArea alloc] initWithRect:self.bounds options:NSTrackingMouseEnteredAndExited | NSTrackingActiveAlways owner:self userInfo:nil]];
}
- (void)mouseEntered:(NSEvent *)event { [self.guide light:DPNotes[self.index].part]; }
- (void)mouseExited:(NSEvent *)event { if ([self.guide.lit isEqual:DPNotes[self.index].part]) [self.guide light:nil]; }
- (void)drawRect:(NSRect)dirty {
    const DPGuideNote *n = &DPNotes[self.index];
    BOOL dark = DPGuideDark(self), left = [n->side isEqual:@"left"];
    NSColor *ink = DPGuideInk(dark), *tape = DPGuideTape();
    NSDictionary *title = @{ NSFontAttributeName: DPCaveat(25), NSForegroundColorAttributeName: self.lit ? tape : ink };
    NSDictionary *key = @{ NSFontAttributeName: DPWashiFigtree(10.5, NSFontWeightSemibold), NSForegroundColorAttributeName: [ink colorWithAlphaComponent:.75] };
    CGFloat tw = ceil([n->title sizeWithAttributes:title].width), kw = n->keys.length ? ceil([n->keys sizeWithAttributes:key].width) + 10 : 0;
    CGFloat rowW = 20 + 7 + tw + (kw ? 7 + kw : 0);
    CGFloat x = left ? NSWidth(self.bounds) - 4 - rowW : 4;
    // the number, a tape-colored dot with a cut shadow
    NSRect dot = NSMakeRect(x, 6, 20, 20);
    NSShadow *cut = [NSShadow new]; cut.shadowColor = [NSColor colorWithWhite:0 alpha:dark ? .4 : .18]; cut.shadowOffset = NSMakeSize(0, -1); cut.shadowBlurRadius = 1.5;
    [NSGraphicsContext saveGraphicsState]; [cut set]; [tape setFill]; [[NSBezierPath bezierPathWithOvalInRect:dot] fill]; [NSGraphicsContext restoreGraphicsState];
    NSString *num = [NSString stringWithFormat:@"%lu", (unsigned long)self.index + 1];
    NSDictionary *numA = @{ NSFontAttributeName: DPWashiFigtree(11, NSFontWeightBold), NSForegroundColorAttributeName: NSColor.whiteColor };
    NSSize ns = [num sizeWithAttributes:numA];
    [num drawAtPoint:NSMakePoint(NSMidX(dot) - ns.width / 2, NSMidY(dot) - ns.height / 2) withAttributes:numA];
    [n->title drawAtPoint:NSMakePoint(x + 27, 0) withAttributes:title];
    if (kw) {
        NSRect chip = NSMakeRect(x + 27 + tw + 7, 8, kw, 17);
        [[ink colorWithAlphaComponent:.08] setFill]; [[NSBezierPath bezierPathWithRoundedRect:chip xRadius:4 yRadius:4] fill];
        [[ink colorWithAlphaComponent:.16] setStroke]; [[NSBezierPath bezierPathWithRoundedRect:NSInsetRect(chip, .5, .5) xRadius:4 yRadius:4] stroke];
        [n->keys drawAtPoint:NSMakePoint(NSMinX(chip) + 5, NSMinY(chip) + 1.5) withAttributes:key];
    }
    [DPNoteText(n, dark) drawWithRect:NSMakeRect(4, 32, NSWidth(self.bounds) - 8, NSHeight(self.bounds) - 32) options:NSStringDrawingUsesLineFragmentOrigin];
}
@end

#pragma mark The guide

@implementation DPWashiGuideView {
    NSMutableArray<DPWashiGuideNote *> *_notes;
    CFTimeInterval _start;
    NSTimer *_drawIn;
    NSRect _gotIt;
}
- (BOOL)isFlipped { return YES; }
- (BOOL)acceptsFirstResponder { return YES; }
- (instancetype)initWithFrame:(NSRect)frame {
    if ((self = [super initWithFrame:frame])) {
        self.wantsLayer = YES;
        _notes = [NSMutableArray new];
        for (NSUInteger i = 0; i < DPNoteCount; i++) {
            const DPGuideNote *n = &DPNotes[i];
            DPWashiGuideNote *note = [[DPWashiGuideNote alloc] initWithFrame:NSMakeRect(DPStageX + n->x, DPStageY + n->y, n->w, DPNoteHeight(n))];
            note.index = i; note.guide = self; note.wantsLayer = YES;
            [self addSubview:note]; [_notes addObject:note];
        }
        _start = -1;
    }
    return self;
}
- (void)dealloc { [_drawIn invalidate]; }

// Each note rises in, one after another; then its line draws itself to its part and the dot pops on.
- (void)play {
    if (DPWashiCalm()) { _start = 0; self.needsDisplay = YES; return; }
    BOOL scrap = DPWashiLive(&DPWashiScrapbook);
    for (NSUInteger i = 0; i < _notes.count; i++)
        DPWashiRiseIn(_notes[i], 8, scrap ? (i % 2 ? 2.5 : -2.5) * DPWashiTilt() : 0, .97, .45, .15 + i * .09);
    _start = CACurrentMediaTime();
    __weak DPWashiGuideView *weak = self;
    [_drawIn invalidate];
    _drawIn = [NSTimer scheduledTimerWithTimeInterval:1 / 60.0 repeats:YES block:^(NSTimer *t) {
        DPWashiGuideView *me = weak;
        if (!me) { [t invalidate]; return; }
        me.needsDisplay = YES;
        if (CACurrentMediaTime() - me->_start > .35 + DPNoteCount * .09 + .5) { [t invalidate]; me->_start = 0; }
    }];
}
- (void)viewDidMoveToWindow { [super viewDidMoveToWindow]; if (self.window && _start < 0) [self play]; }

- (void)light:(NSString *)part {
    if ([part isEqual:_lit] || (!part && !_lit)) return;
    _lit = [part copy];
    for (DPWashiGuideNote *n in _notes) { BOOL on = [DPNotes[n.index].part isEqual:part]; if (n.lit != on) { n.lit = on; n.needsDisplay = YES; } }
    self.needsDisplay = YES;
}

// How far along each line is: 0 before it starts, 1 drawn. With Animations off, always drawn.
- (CGFloat)progress:(NSUInteger)i delay:(CGFloat)delay duration:(CGFloat)duration {
    if (_start <= 0) return 1;
    CGFloat t = (CACurrentMediaTime() - _start - delay - i * .09) / duration;
    t = MAX(0, MIN(1, t));
    return 1 - pow(1 - t, 3);   // easing out, like Washi's (.3,.6,.3,1)
}

// A note's leader: from the note's edge to its part, as Washi draws them (down from a top note; across, then in, from the sides).
- (NSArray<NSValue *> *)leader:(NSUInteger)i {
    const DPGuideNote *n = &DPNotes[i];
    NSRect part = DPGuidePart(n->part), note = _notes[i].frame;
    CGFloat ox = DPStageX, oy = DPStageY;
    part = NSOffsetRect(part, ox, oy);
    if ([n->side isEqual:@"top"]) {
        NSPoint a = NSMakePoint(MIN(MAX(NSMidX(part), NSMinX(note) + 24), NSMaxX(note) - 10), NSMaxY(note) + 4), b = NSMakePoint(NSMidX(part), NSMinY(part) - 5);
        return @[ [NSValue valueWithPoint:a], [NSValue valueWithPoint:b], [NSValue valueWithPoint:NSMakePoint(NSMidX(part), NSMinY(part))] ];
    }
    BOOL left = [n->side isEqual:@"left"];
    CGFloat y1 = NSMinY(note) + 15;
    NSPoint target = [n->part isEqual:@"all"] ? NSMakePoint(NSMaxX(part) - 4, NSMaxY(part) - 26)
                   : NSMakePoint(left ? NSMinX(part) + 3 : NSMaxX(part) - 3, MIN(MAX(y1, NSMinY(part) + 2), NSMaxY(part) - 2));
    NSPoint a = NSMakePoint(left ? NSMaxX(note) + 6 : NSMinX(note) - 6, y1);
    NSPoint mid = NSMakePoint((a.x + target.x) / 2, y1);
    NSPoint end = NSMakePoint(target.x + (left ? -5 : 5), target.y);
    return @[ [NSValue valueWithPoint:a], [NSValue valueWithPoint:mid], [NSValue valueWithPoint:end], [NSValue valueWithPoint:target] ];
}

- (void)drawRect:(NSRect)dirty {
    BOOL dark = DPGuideDark(self);
    NSColor *ink = DPGuideInk(dark), *tape = DPGuideTape(), *paper = DPWashiRGB(DPWashiMainPaperRGB(dark));
    // The heading, like Washi's.
    [@"Quick-start guide" drawAtPoint:NSMakePoint(DPStageX, 26) withAttributes:@{ NSFontAttributeName: DPWashiFigtree(26, NSFontWeightBold), NSForegroundColorAttributeName: ink }];
    [@"Here’s what everything is. Point at a note to light up its spot." drawAtPoint:NSMakePoint(DPStageX, 62) withAttributes:@{ NSFontAttributeName: DPWashiFigtree(14, NSFontWeightMedium), NSForegroundColorAttributeName: [ink colorWithAlphaComponent:.68] }];
    // The drawing: the little Dia at its own size, scaled up.
    [NSGraphicsContext saveGraphicsState];
    NSAffineTransform *t = [NSAffineTransform transform];
    CGFloat k = NSWidth(DPMini) / DPMiniW;
    [t translateXBy:DPStageX + NSMinX(DPMini) yBy:DPStageY + NSMinY(DPMini)]; [t scaleBy:k]; [t concat];
    NSRect mini = NSMakeRect(0, 0, DPMiniW, NSHeight(DPMini) / k);
    NSShadow *lift = [NSShadow new]; lift.shadowColor = [NSColor colorWithWhite:0 alpha:dark ? .5 : .16]; lift.shadowOffset = NSMakeSize(0, -2 / k); lift.shadowBlurRadius = 8 / k;
    [NSGraphicsContext saveGraphicsState]; [lift set]; [paper setFill]; [[NSBezierPath bezierPathWithRoundedRect:mini xRadius:9 yRadius:9] fill]; [NSGraphicsContext restoreGraphicsState];
    DPWashiDrawMini(mini, dark, paper, tape, _lit ? [@"guide:" stringByAppendingString:_lit] : @"guide");
    [NSGraphicsContext restoreGraphicsState];
    // The leaders, drawing themselves in, and a dot at each end.
    for (NSUInteger i = 0; i < DPNoteCount; i++) {
        NSArray<NSValue *> *pts = [self leader:i];
        BOOL on = [DPNotes[i].part isEqual:_lit];
        CGFloat length = 0;
        for (NSUInteger j = 1; j + 1 < pts.count; j++) length += hypot(pts[j].pointValue.x - pts[j - 1].pointValue.x, pts[j].pointValue.y - pts[j - 1].pointValue.y);
        CGFloat want = length * [self progress:i delay:.35 duration:.38];
        NSBezierPath *line = [NSBezierPath bezierPath];
        line.lineWidth = on ? 2.6 : 1.6; line.lineCapStyle = NSLineCapStyleRound; line.lineJoinStyle = NSLineJoinStyleRound;
        [line moveToPoint:pts[0].pointValue];
        CGFloat gone = 0;
        NSUInteger last = pts.count - 1;   // the final point is the dot, not part of the line
        for (NSUInteger j = 1; j < last && gone < want; j++) {
            NSPoint a = pts[j - 1].pointValue, b = pts[j].pointValue;
            CGFloat seg = hypot(b.x - a.x, b.y - a.y), use = MIN(seg, want - gone);
            [line lineToPoint:seg > 0 ? NSMakePoint(a.x + (b.x - a.x) * use / seg, a.y + (b.y - a.y) * use / seg) : b];
            gone += use;
        }
        [(on ? tape : [ink colorWithAlphaComponent:.8]) setStroke];
        if (want > 0) [line stroke];
        CGFloat pop = [self progress:i delay:.65 duration:.25];
        if (pop > 0) {
            NSPoint c = pts[last].pointValue;
            CGFloat r = 4 * (pop < 1 ? 1 + .25 * sin(pop * M_PI) : 1) * pop;
            [(on ? tape : ink) setFill]; [[NSBezierPath bezierPathWithOvalInRect:NSMakeRect(c.x - r, c.y - r, r * 2, r * 2)] fill];
        }
    }
    // The foot: where to find it again, and Got it.
    NSDictionary *btn = @{ NSFontAttributeName: DPWashiFigtree(14, NSFontWeightSemibold), NSForegroundColorAttributeName: NSColor.whiteColor };
    CGFloat bw = ceil([@"Got it" sizeWithAttributes:btn].width) + 40;
    _gotIt = NSMakeRect(DPGW - DPStageX - bw, DPGH - 58, bw, 36);
    [@"Open it again any time: Help › Washi Quick-start Guide, or Settings › Washi." drawAtPoint:NSMakePoint(DPStageX, DPGH - 48) withAttributes:@{ NSFontAttributeName: DPWashiFigtree(12.5, NSFontWeightMedium), NSForegroundColorAttributeName: [ink colorWithAlphaComponent:.6] }];
    NSShadow *cut = [NSShadow new]; cut.shadowColor = [NSColor colorWithWhite:0 alpha:dark ? .45 : .2]; cut.shadowOffset = NSMakeSize(0, -2); cut.shadowBlurRadius = 3;
    [NSGraphicsContext saveGraphicsState]; [cut set]; [tape setFill]; [[NSBezierPath bezierPathWithRoundedRect:_gotIt xRadius:10 yRadius:10] fill]; [NSGraphicsContext restoreGraphicsState];
    NSSize gs = [@"Got it" sizeWithAttributes:btn];
    [@"Got it" drawAtPoint:NSMakePoint(NSMidX(_gotIt) - gs.width / 2, NSMidY(_gotIt) - gs.height / 2) withAttributes:btn];
}
- (void)resetCursorRects { [self addCursorRect:_gotIt cursor:NSCursor.pointingHandCursor]; }
- (void)mouseDown:(NSEvent *)event {
    NSPoint at = [self convertPoint:event.locationInWindow fromView:nil];
    if (NSPointInRect(at, _gotIt)) [self.window performClose:nil];
    else [self.window performWindowDragWithEvent:event];
}
- (void)keyDown:(NSEvent *)event {
    if (event.keyCode == 53 || event.keyCode == 36 || event.keyCode == 76) [self.window performClose:nil];   // Esc, Return
    else [super keyDown:event];
}
- (void)viewDidChangeEffectiveAppearance { [super viewDidChangeEffectiveAppearance]; self.needsDisplay = YES; for (NSView *n in _notes) n.needsDisplay = YES; }
@end

// The guide on its paper, at the stage's size (the window scales it). Also for tools/drawings.m.
NSView *DPWashiGuideMake(void) {
    NSView *box = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, DPGW, DPGH)];
    NSView *paper = DPWashiPaperMake(box.bounds);
    [box addSubview:paper];
    DPWashiGuideView *guide = [[DPWashiGuideView alloc] initWithFrame:box.bounds];
    guide.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    [box addSubview:guide];
    return box;
}
void DPWashiGuideLight(NSView *box, NSString *part) {
    for (NSView *v in box.subviews) if ([v isKindOfClass:DPWashiGuideView.class]) [(DPWashiGuideView *)v light:part];
}

@interface DPWashiGuidePanel : NSPanel
@end
@implementation DPWashiGuidePanel
- (BOOL)canBecomeKeyWindow { return YES; }
- (void)cancelOperation:(id)sender { [self performClose:nil]; }
@end

static NSPanel *DPGuidePanel;
void DPWashiShowGuide(void) {
    if (DPGuidePanel.isVisible) { [DPGuidePanel makeKeyAndOrderFront:nil]; return; }
    NSScreen *screen = (NSApp.keyWindow ?: NSApp.mainWindow).screen ?: NSScreen.mainScreen;
    NSRect room = screen.visibleFrame;
    CGFloat scale = MIN(1.1, MIN(NSWidth(room) * .92 / DPGW, NSHeight(room) * .9 / DPGH));
    NSSize size = NSMakeSize(round(DPGW * scale), round(DPGH * scale));
    DPWashiGuidePanel *panel = [[DPWashiGuidePanel alloc] initWithContentRect:NSMakeRect(0, 0, size.width, size.height)
        styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskFullSizeContentView backing:NSBackingStoreBuffered defer:NO];
    panel.title = @"Washi Quick-start Guide";
    panel.titlebarAppearsTransparent = YES; panel.titleVisibility = NSWindowTitleHidden;
    panel.movableByWindowBackground = YES; panel.releasedWhenClosed = NO; panel.hidesOnDeactivate = NO;
    panel.floatingPanel = NO; panel.level = NSNormalWindowLevel;
    NSView *box = DPWashiGuideMake();
    box.frame = NSMakeRect(0, 0, size.width, size.height);
    for (NSView *v in box.subviews) { v.frame = box.bounds; }
    NSView *guide = box.subviews.lastObject;
    [guide setBoundsSize:NSMakeSize(DPGW, DPGH)];   // the stage, scaled to the window
    box.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    panel.contentView = box;
    [panel center];
    if (!DPWashiCalm()) panel.animationBehavior = NSWindowAnimationBehaviorAlertPanel;
    [panel makeKeyAndOrderFront:nil];
    [panel makeFirstResponder:guide];
    DPGuidePanel = panel;
    [DPWashiDefaults() setBool:YES forKey:@"washiGuideSeen"];
}

// Help › Washi Quick-start Guide (while Washi is on), and the guide by itself the first time Washi is.
@interface DPWashiGuideMenu : NSObject
@end
@implementation DPWashiGuideMenu
+ (instancetype)shared { static DPWashiGuideMenu *m; if (!m) m = [DPWashiGuideMenu new]; return m; }
- (void)show:(id)sender { DPWashiShowGuide(); }
- (BOOL)validateMenuItem:(NSMenuItem *)item { item.hidden = !DPWashiPaper.on; return DPWashiPaper.on; }
@end

static void DPGuideAddMenu(void) {
    NSMenu *help = NSApp.helpMenu;
    if (!help) for (NSMenuItem *item in NSApp.mainMenu.itemArray) if ([item.title isEqual:@"Help"]) help = item.submenu;
    if (!help || [help itemWithTitle:@"Washi Quick-start Guide"]) return;
    NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:@"Washi Quick-start Guide" action:@selector(show:) keyEquivalent:@""];
    item.target = DPWashiGuideMenu.shared;
    item.image = [NSImage imageWithSystemSymbolName:@"map" accessibilityDescription:nil];
    [help insertItem:item atIndex:0];
    [help insertItem:NSMenuItem.separatorItem atIndex:1];
}

void DPWashiGuideFirstTime(void) {
    DPGuideAddMenu();
    if ([DPWashiDefaults() boolForKey:@"washiGuideSeen"] || !DPWashiPaper.on) return;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.5 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        if (!DPWashiPaper.on || [DPWashiDefaults() boolForKey:@"washiGuideSeen"]) return;
        for (NSWindow *w in NSApp.windows)
            if (w.isVisible && DPIsKind(w.contentView.superview, DPDiaWindowFrame)) { DPWashiShowGuide(); return; }
    });
}

__attribute__((constructor)) static void DPGuideStart(void) {
    if (getenv("DIAPATCH_SAFE")) return;
    dispatch_async(dispatch_get_main_queue(), ^{
        DPGuideAddMenu();   // when DiaTweaks comes in after Dia's menus are made
        [NSNotificationCenter.defaultCenter addObserverForName:NSApplicationDidFinishLaunchingNotification object:nil queue:nil usingBlock:^(NSNotification *n) { DPGuideAddMenu(); }];
    });
}
