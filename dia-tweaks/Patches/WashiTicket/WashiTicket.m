#import "StdPatch/StdPatch.h"
#import "Patches/WashiShared/WashiShared.h"
NSArray<NSView *> *DPWashiArtTicket(void);   // WashiLook.m

// Now Playing: when a tab other than the one you're on is playing sound, a little ticket at the bottom of its
// space's tabs says which, like Washi's. Click it to go to that tab. Dia's own speaker on the tab is how it knows:
// the ticket comes and goes with it. The room comes from the tab list's bottom (WashiHand.m keeps both strips).

extern DPPatch DPWashiTicket;
NSColor *DPWashiPaperColor(BOOL dark);   // WashiPaper.m
NSFont *DPCaveat(CGFloat size);          // WashiHand.m
#define DPAudioButton "_TtGC5ARCUI21ExpandableWrapperViewGCS_17SidebarCellButtonCSo11NSImageView__"
#define DPTabTitle "_TtC5ARCUI24FeatheredTruncatingLabel"
static char DPTicketStickKey, DPTicketKey, DPTicketSeenKey, DPTicketDirtyKey, DPTicketTabKey;
static const CGFloat DPTicketHeight = 44, DPTicketGap = 6;

static NSView *DPFirst(NSView *root, const char *kind) { return DPFindView(root, ^BOOL(NSView *v) { return v != root && DPIsKind(v, kind); }); }

static BOOL DPTabPlaying(NSView *tab) {
    NSView *speaker = DPFirst(tab, DPAudioButton);
    return speaker && !speaker.hidden && NSWidth(speaker.frame) > 1;
}
static BOOL DPTabSelected(NSView *tab) {
    NSView *shape = DPFirst(tab, DPDiaTabShape);
    return shape && !shape.hidden;
}

// The first tab in this list that plays while it isn't the one you're on.
static NSView *DPFindPlayingTab(NSView *list) {
    __block NSView *found = nil;
    DPFindView(list, ^BOOL(NSView *v) {
        if (DPIsKind(v, DPDiaTabView) && !v.hiddenOrHasHiddenAncestor && DPTabPlaying(v) && !DPTabSelected(v)) { found = v; return YES; }
        return NO;
    });
    return found;
}

@interface DPWashiTicketView : NSView
@property (nonatomic, weak) NSView *tab;
@end
@implementation DPWashiTicketView {
    NSTextField *_kicker, *_title;
    NSImageView *_icon;
}
- (instancetype)initWithFrame:(NSRect)frame {
    if ((self = [super initWithFrame:frame])) {
        self.wantsLayer = YES;
        _kicker = [NSTextField labelWithString:@"Now playing"];
        _kicker.font = DPCaveat(15); _kicker.textColor = NSColor.secondaryLabelColor;
        _title = [NSTextField labelWithString:@""];
        _title.font = [NSFont systemFontOfSize:12 weight:NSFontWeightSemibold]; _title.textColor = NSColor.labelColor;
        _title.lineBreakMode = NSLineBreakByTruncatingTail; _title.maximumNumberOfLines = 1;
        _icon = [NSImageView new]; _icon.imageScaling = NSImageScaleProportionallyUpOrDown;
        for (NSView *v in @[ _kicker, _title, _icon ]) [self addSubview:v];
        self.toolTip = @"Go to the tab that's playing";
    }
    return self;
}
- (BOOL)isFlipped { return YES; }
- (void)viewDidChangeEffectiveAppearance { [super viewDidChangeEffectiveAppearance]; self.needsDisplay = YES; }
- (void)showTab:(NSView *)tab {
    self.tab = tab;
    NSTextField *title = (NSTextField *)DPFirst(tab, DPTabTitle);
    NSString *text = [title isKindOfClass:NSTextField.class] ? title.stringValue : @"";
    if (![_title.stringValue isEqual:text]) _title.stringValue = text ?: @"";
    NSImageView *icon = (NSImageView *)DPFindView(tab, ^BOOL(NSView *v) { return [v isKindOfClass:NSImageView.class] && ((NSImageView *)v).image && NSWidth(v.frame) == 16; });
    if (_icon.image != icon.image) _icon.image = icon.image;
}
- (void)layout {
    [super layout];
    CGFloat w = NSWidth(self.bounds), stub = 34;
    _icon.frame = NSMakeRect((stub - 16) / 2, (NSHeight(self.bounds) - 16) / 2, 16, 16);
    _kicker.frame = NSMakeRect(stub + 8, 3, w - stub - 16, 19);
    _title.frame = NSMakeRect(stub + 8, 21, w - stub - 16, 16);
}
// A ticket: card paper with the cut-paper shadow, a stub on the left behind a perforation, notches at its ends.
- (void)drawRect:(NSRect)dirty {
    BOOL dark = [[self.effectiveAppearance bestMatchFromAppearancesWithNames:@[ NSAppearanceNameAqua, NSAppearanceNameDarkAqua ]] isEqual:NSAppearanceNameDarkAqua];
    NSColor *paper = [DPWashiPaperColor(dark) colorUsingColorSpace:NSColorSpace.sRGBColorSpace];
    NSColor *card = [paper blendedColorWithFraction:dark ? .08 : .72 ofColor:NSColor.whiteColor];
    NSColor *ink = dark ? NSColor.whiteColor : [NSColor colorWithSRGBRed:43 / 255.0 green:33 / 255.0 blue:24 / 255.0 alpha:1];
    NSRect body = NSMakeRect(0, 0, NSWidth(self.bounds) - 2, NSHeight(self.bounds) - 2);
    CGFloat stub = 34;
    NSBezierPath *ticket = [NSBezierPath bezierPathWithRoundedRect:body xRadius:6 yRadius:6];
    NSBezierPath *notches = [NSBezierPath bezierPath];
    [notches appendBezierPathWithOvalInRect:NSMakeRect(stub - 4, -4, 8, 8)];
    [notches appendBezierPathWithOvalInRect:NSMakeRect(stub - 4, NSMaxY(body) - 4, 8, 8)];
    [ticket appendBezierPath:notches];
    ticket.windingRule = NSWindingRuleEvenOdd;
    NSAffineTransform *down = [NSAffineTransform transform]; [down translateXBy:1.5 yBy:1.5];
    NSBezierPath *shadow = [ticket copy]; [shadow transformUsingAffineTransform:down];
    [[NSColor colorWithWhite:0 alpha:dark ? .4 : .13] setFill]; [shadow fill];
    [card setFill]; [ticket fill];
    [[ink colorWithAlphaComponent:.1] setStroke]; ticket.lineWidth = 1; [ticket stroke];
    NSBezierPath *perforation = [NSBezierPath bezierPath];
    [perforation moveToPoint:NSMakePoint(stub, 6)]; [perforation lineToPoint:NSMakePoint(stub, NSMaxY(body) - 6)];
    CGFloat dash[] = { 2, 2.5 }; [perforation setLineDash:dash count:2 phase:0];
    [[ink colorWithAlphaComponent:.28] setStroke]; [perforation stroke];
}
- (void)mouseDown:(NSEvent *)event {
    NSView *tab = self.tab;
    if (!tab) return;
    if (!DPWashiCalm()) {
        CAKeyframeAnimation *press = [CAKeyframeAnimation animationWithKeyPath:@"transform.scale"];
        press.values = @[ @1, @.96, @1 ]; press.duration = .2;
        [self.layer addAnimation:press forKey:@"washiPress"];
    }
    [tab accessibilityPerformPress];   // Dia's tab button: the same as clicking the tab
}
- (void)resetCursorRects { [self addCursorRect:self.bounds cursor:NSCursor.pointingHandCursor]; }
@end

// Looked for again only when a tab's sound or selection changed (DPTicketCheck), not on every layout.
@interface DPWeakBox : NSObject
@property (nonatomic, weak) NSView *view;
@end
@implementation DPWeakBox
@end
static NSView *DPPlayingTab(NSView *list) {
    DPWeakBox *box = DPGet(list, &DPTicketTabKey);
    if (box && !DPGet(list, &DPTicketDirtyKey)) return box.view;
    if (!box) { box = [DPWeakBox new]; DPSet(list, &DPTicketTabKey, box); }
    box.view = DPFindPlayingTab(list);
    DPSet(list, &DPTicketDirtyKey, nil);
    return box.view;
}

CGFloat DPWashiTicketRoom(NSView *list) {
    if (!DPWashiLive(&DPWashiTicket)) return 0;
    return DPPlayingTab(list) ? DPTicketHeight + DPTicketGap + 8 : 0;
}

void DPWashiTicketGone(NSView *list) {
    NSView *ticket = DPGet(list, &DPTicketKey);
    if (!ticket) return;
    [ticket removeFromSuperview];
    DPSet(list, &DPTicketKey, nil);
}

void DPWashiTicketIn(NSView *list, NSRect room) {
    NSView *tab = DPPlayingTab(list);
    if (!tab) { DPWashiTicketGone(list); return; }
    DPWashiTicketView *ticket = DPGet(list, &DPTicketKey);
    BOOL fresh = !ticket;
    if (!ticket) { ticket = [[DPWashiTicketView alloc] initWithFrame:NSZeroRect]; DPSet(list, &DPTicketKey, ticket); }
    if (ticket.superview != list) [list addSubview:ticket];
    [ticket showTab:tab];
    NSRect frame = NSMakeRect(NSMinX(room) + 8, list.isFlipped ? NSMinY(room) + DPTicketGap : NSMinY(room) + 8, NSWidth(room) - 16, DPTicketHeight);
    if (!NSEqualRects(ticket.frame, frame)) ticket.frame = frame;
    // Scrapbook: a degree crooked, taped on at its top right (30×11, leaning 6°), like Washi's ticket.
    BOOL scrap = DPWashiLive(&DPWashiScrapbook);
    CGFloat cx = NSWidth(ticket.bounds) / 2, cy = NSHeight(ticket.bounds) / 2;
    [CATransaction begin]; [CATransaction setDisableActions:YES];
    ticket.layer.affineTransform = CGAffineTransformTranslate(CGAffineTransformRotate(CGAffineTransformMakeTranslation(cx, cy), (scrap ? -1 : 0) * M_PI / 180), -cx, -cy);
    [CATransaction commit];
    DPWashiStick(ticket, &DPTicketStickKey, DPWashiScrap(), CGSizeMake(30, 11), NSMakePoint(NSWidth(ticket.bounds) - 31, 0.5), 6);
    if (fresh && !DPWashiCalm()) {   // slides up out of the bottom like a ticket being printed
        CABasicAnimation *rise = [CABasicAnimation animationWithKeyPath:@"opacity"];
        rise.fromValue = @0; rise.toValue = @1; rise.duration = .25;
        rise.timingFunction = [CAMediaTimingFunction functionWithControlPoints:.3 :1.18 :.5 :1];
        [ticket.layer addAnimation:rise forKey:@"washiTicket"];
    }
}

// Dia shows or hides a tab's speaker as sound starts and stops: the list looks again, once per change.
static void DPTicketCheck(NSView *tab) {
    if (!DPWashiLive(&DPWashiTicket) && !DPGet(tab, &DPTicketSeenKey)) return;
    BOOL playing = DPTabPlaying(tab) && !DPTabSelected(tab);
    NSNumber *seen = DPGet(tab, &DPTicketSeenKey);
    if (seen && seen.boolValue == playing) return;
    DPSet(tab, &DPTicketSeenKey, @(playing));
    NSView *list = tab;
    while (list && !DPIsKind(list, DPDiaTabList)) list = list.superview;
    if (list) { DPSet(list, &DPTicketDirtyKey, @YES); dispatch_async(dispatch_get_main_queue(), ^{ list.needsLayout = YES; }); }
}

static void DPTicketTab_layout(NSView *self, SEL _cmd) {
    DPCallOriginal(DPTicketTab_layout, self);
    DPTicketCheck(self);
}
static void DPTicketSpeaker_setHidden(NSView *self, SEL _cmd, BOOL hidden) {
    DPCallOriginal(DPTicketSpeaker_setHidden, self, hidden);
    for (NSView *up = self.superview; up; up = up.superview) if (DPIsKind(up, DPDiaTabView)) { DPTicketCheck(up); break; }
}

// Picking a tab repaints its selection fill without laying it out: the cue that the one you're on changed.
static void DPTicketFill_updateLayer(NSView *self, SEL _cmd) {
    DPCallOriginal(DPTicketFill_updateLayer, self);
    NSView *shape = self.superview.superview, *tab = shape.superview.superview;   // tab › background › shape › clip › fill
    if (DPIsKind(shape, DPDiaTabShape) && DPIsKind(tab, DPDiaTabView)) DPTicketCheck(tab);
}

static void DPInstallWashiTicket(void) {
    DPHook(DPDiaColorFill, @selector(updateLayer), (IMP)DPTicketFill_updateLayer);
    DPHook(DPDiaTabView, @selector(layout), (IMP)DPTicketTab_layout);
    DPHook(DPAudioButton, @selector(setHidden:), (IMP)DPTicketSpeaker_setHidden);
}

static void DPApplyWashiTicket(DPPatch *patch) {
    for (NSView *list in DPFindViews(DPDiaTabList)) { DPSet(list, &DPTicketDirtyKey, @YES); list.needsLayout = YES; }
}

static NSString *DPVerifyWashiTicket(DPPatch *patch) {
    for (NSView *list in DPFindViews(DPDiaTabList)) {
        if (list.hiddenOrHasHiddenAncestor) continue;
        NSView *ticket = DPGet(list, &DPTicketKey);
        if (!DPWashiLive(patch) && ticket.superview) return @"ticket left on the sidebar";
        for (NSView *sub in list.subviews)
            if (ticket.superview && DPIsKind(sub, "_TtC7TabListP33_9A67AB465A78F9E1122D59704CA866E621SpacePagingScrollView") && NSIntersectsRect(sub.frame, ticket.frame)) return @"ticket overlaps the tabs";
    }
    return nil;
}

DP_PATCH(DPWashiTicket) {
    .key = @"washiTicket",
    .defaultOn = YES,
    .order = 9,
    .title = @"Now Playing",
    .detail = @"When another tab is playing sound, a little ticket at the bottom of your tabs says which. Click it to go there.",
    .symbol = @"ticket.fill ticket",
    .tint = @"systemRedColor",
    .section = @"Sidebar",
    .requires = @"washiPaper",
    .rows = DPWashiArtTicket,
    .classes = DPClasses(DPDiaTabList, DPDiaTabView),
    .install = DPInstallWashiTicket,
    .apply = DPApplyWashiTicket,
    .verify = DPVerifyWashiTicket,
};
