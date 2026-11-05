#import "StdPatch/StdPatch.h"
#import "StdPatch/Hide.h"

// Washi New Tab: Dia's own new tab page on Washi's paper, with Washi's hello in handwriting (good evening, and your
// first name) and the date and time under it, where Dia's logo was.
// Paper Command Bar: Dia's "Ask anything" bar, on the new tab page and wherever else it opens, as a card of Washi's
// paper with the cut-paper shadow.

extern DPPatch DPWashiNewTab, DPWashiCommandBar;
NSView *DPWashiPaperMake(NSRect frame);              // WashiPaper.m
void DPWashiPaperRepaint(NSView *view);
NSView *DPWashiCardSheet(NSRect frame, CGFloat radius);   // WashiBars.m
NSView *DPWashiCutShadow(CGFloat lift, CGFloat radius);   // WashiCards.m
NSFont *DPCaveat(CGFloat size);                      // WashiHand.m
static char DPNTPaperKey, DPHelloKey, DPBarCardKey, DPBarShadowKey;

#pragma mark The new tab page

static BOOL DPInNewTab(NSView *view) {
    for (NSView *up = view.superview; up; up = up.superview) if (DPIsKind(up, DPDiaNewTabPage)) return YES;
    return NO;
}

static BOOL DPIsWashiNewTabLogo(NSView *view) {
    return (DPIsKind(view, DPDiaNewTabLogo) || DPIsKind(view, DPDiaNewTabLogoParticles)) && DPInNewTab(view);
}

static NSString *DPGreeting(void) {
    NSInteger h = [NSCalendar.currentCalendar component:NSCalendarUnitHour fromDate:NSDate.date];
    NSString *part = h < 5 ? @"Still up" : h < 12 ? @"Good morning" : h < 17 ? @"Good afternoon" : h < 22 ? @"Good evening" : @"Still up";
    NSString *name = [NSFullUserName() componentsSeparatedByString:@" "].firstObject;
    return name.length ? [NSString stringWithFormat:@"%@, %@", part, name] : part;
}

static NSString *DPToday(void) {
    static NSDateFormatter *day, *time;
    if (!day) {
        day = [NSDateFormatter new]; day.localizedDateFormatFromTemplate = @"EEEEMMMMd";
        time = [NSDateFormatter new]; time.timeStyle = NSDateFormatterShortStyle; time.dateStyle = NSDateFormatterNoStyle;
    }
    return [NSString stringWithFormat:@"%@ · %@", [day stringFromDate:NSDate.date], [time stringFromDate:NSDate.date]];
}

@interface DPWashiHello : NSView
@property (nonatomic, strong) NSTextField *hello, *date;
@end
@implementation DPWashiHello
- (instancetype)initWithFrame:(NSRect)frame {
    if ((self = [super initWithFrame:frame])) {
        _hello = [NSTextField labelWithString:@""];
        _hello.font = DPCaveat(46); _hello.textColor = NSColor.labelColor; _hello.alignment = NSTextAlignmentCenter;
        _hello.lineBreakMode = NSLineBreakByTruncatingTail; _hello.maximumNumberOfLines = 1;
        _date = [NSTextField labelWithString:@""];
        _date.font = [NSFont systemFontOfSize:14 weight:NSFontWeightSemibold]; _date.textColor = NSColor.secondaryLabelColor;
        _date.alignment = NSTextAlignmentCenter; _date.lineBreakMode = NSLineBreakByTruncatingTail; _date.maximumNumberOfLines = 1;
        [self addSubview:_hello]; [self addSubview:_date];
        self.wantsLayer = YES;
        [self tick];
    }
    return self;
}
- (BOOL)isFlipped { return YES; }
- (NSView *)hitTest:(NSPoint)point { return nil; }
- (void)tick {
    NSString *hello = DPGreeting(), *date = DPToday();
    if (![_hello.stringValue isEqual:hello]) _hello.stringValue = hello;
    if (![_date.stringValue isEqual:date]) _date.stringValue = date;
}
- (void)layout {
    [super layout];
    CGFloat w = NSWidth(self.bounds);
    _hello.frame = NSMakeRect(12, 0, w - 24, 58);   // tall enough for Caveat's loops above and tails below
    _date.frame = NSMakeRect(12, 60, w - 24, 20);
}
@end

static const CGFloat DPHelloHeight = 80;

static void DPNewTabIn(NSView *page) {
    NSView *paper = DPGet(page, &DPNTPaperKey);
    DPWashiHello *hello = DPGet(page, &DPHelloKey);
    NSView *logo = DPFindView(page, ^BOOL(NSView *v) { return DPIsKind(v, DPDiaNewTabLogo); });
    NSView *bar = DPFindView(page, ^BOOL(NSView *v) { return DPIsKind(v, DPDiaAssistantPanel); });
    if (!DPWashiNewTab.on) {
        [paper removeFromSuperview]; [hello removeFromSuperview];
        DPSet(page, &DPNTPaperKey, nil); DPSet(page, &DPHelloKey, nil);
        return;
    }
    if (!paper) { paper = DPWashiPaperMake(page.bounds); DPSet(page, &DPNTPaperKey, paper); }
    if (page.subviews.firstObject != paper) [page addSubview:paper positioned:NSWindowBelow relativeTo:nil];
    if (!NSEqualRects(paper.frame, page.bounds)) paper.frame = page.bounds;

    NSView *host = logo.superview ?: bar.superview;
    if (!host || !bar) { [hello removeFromSuperview]; return; }
    if (!hello) { hello = [[DPWashiHello alloc] initWithFrame:NSZeroRect]; DPSet(page, &DPHelloKey, hello); }
    if (hello.superview != host) [host addSubview:hello];
    // Centred over the bar, ending 16pt above it, and never above the page's top.
    NSRect barFrame = [host convertRect:bar.bounds fromView:bar];
    CGFloat barTop = host.isFlipped ? NSMinY(barFrame) : NSMaxY(barFrame);
    CGFloat w = MIN(NSWidth(host.bounds) - 32, 720);
    NSRect frame = NSMakeRect(NSMidX(host.bounds) - w / 2, 0, w, DPHelloHeight);
    frame.origin.y = host.isFlipped ? barTop - 16 - DPHelloHeight : barTop + 16;
    if (host.isFlipped ? NSMinY(frame) < 4 : NSMaxY(frame) > NSHeight(host.bounds) - 4) { hello.hidden = YES; return; }
    hello.hidden = NO;
    if (!NSEqualRects(hello.frame, frame)) hello.frame = frame;
}

static void DPNewTab_layout(NSView *self, SEL _cmd) {
    DPCallOriginal(DPNewTab_layout, self);
    DPNewTabIn(self);
}

static void DPInstallWashiNewTab(void) {
    DPHook(DPDiaNewTabPage, @selector(layout), (IMP)DPNewTab_layout);
    static NSTimer *clock;
    clock = [NSTimer scheduledTimerWithTimeInterval:20 repeats:YES block:^(NSTimer *t) {
        if (!DPWashiNewTab.on) return;
        for (NSView *page in DPFindViews(DPDiaNewTabPage)) [(DPWashiHello *)DPGet(page, &DPHelloKey) tick];
    }];
    clock.tolerance = 5;
}

static void DPApplyWashiNewTab(DPPatch *patch) {
    DPApplyHides(patch);
    for (NSView *page in DPFindViews(DPDiaNewTabPage)) { DPNewTabIn(page); DPWashiPaperRepaint(DPGet(page, &DPNTPaperKey)); page.needsLayout = YES; }
}

static NSString *DPVerifyWashiNewTab(DPPatch *patch) {
    NSString *hides = DPVerifyHides(patch);
    if (hides) return hides;
    for (NSView *page in DPFindViews(DPDiaNewTabPage)) {
        NSView *paper = DPGet(page, &DPNTPaperKey);
        if ((paper.superview == page) != patch->on) return patch->on ? @"new tab page has no paper" : @"paper left on the new tab page";
        DPWashiHello *hello = DPGet(page, &DPHelloKey);
        if (patch->on && hello && !hello.hidden) {
            NSView *bar = DPFindView(page, ^BOOL(NSView *v) { return DPIsKind(v, DPDiaAssistantPanel); });
            NSRect barFrame = [hello.superview convertRect:bar.bounds fromView:bar];
            if (NSIntersectsRect(hello.frame, barFrame)) return @"hello runs into the command bar";
        }
    }
    return nil;
}

#pragma mark The command bar

// The bar's rounded box: the clip inside the assistant panel that holds the command bar.
static NSView *DPBarBox(NSView *panel) {
    for (NSView *sub in panel.subviews)
        if (sub.layer.cornerRadius > 0 && !sub.hidden && DPFindView(sub, ^BOOL(NSView *v) { return DPIsKind(v, DPDiaCommandBar); })) return sub;
    return nil;
}

static void DPCommandBarIn(NSView *panel) {
    NSView *box = DPBarBox(panel), *card = DPGet(panel, &DPBarCardKey), *shadow = DPGet(panel, &DPBarShadowKey);
    if (!DPWashiCommandBar.on || !box) {
        [card removeFromSuperview]; [shadow removeFromSuperview];
        DPSet(panel, &DPBarCardKey, nil); DPSet(panel, &DPBarShadowKey, nil);
        return;
    }
    CGFloat radius = box.layer.cornerRadius;
    if (!card) { card = DPWashiCardSheet(box.bounds, radius); card.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable; DPSet(panel, &DPBarCardKey, card); }
    if (box.subviews.firstObject != card) [box addSubview:card positioned:NSWindowBelow relativeTo:nil];
    if (!NSEqualRects(card.frame, box.bounds)) card.frame = box.bounds;
    if (!shadow) { shadow = DPWashiCutShadow(2, radius); DPSet(panel, &DPBarShadowKey, shadow); }
    if (shadow.superview != panel) [panel addSubview:shadow positioned:NSWindowBelow relativeTo:box];
    if (!NSEqualRects(shadow.frame, box.frame)) shadow.frame = box.frame;
}

static void DPPanel_layout(NSView *self, SEL _cmd) {
    DPCallOriginal(DPPanel_layout, self);
    DPCommandBarIn(self);
}

static void DPInstallWashiCommandBar(void) {
    DPHook(DPDiaAssistantPanel, @selector(layout), (IMP)DPPanel_layout);
}

static void DPApplyWashiCommandBar(DPPatch *patch) {
    for (NSView *panel in DPFindViews(DPDiaAssistantPanel)) DPCommandBarIn(panel);
}

static NSString *DPVerifyWashiCommandBar(DPPatch *patch) {
    for (NSView *panel in DPFindViews(DPDiaAssistantPanel)) {
        NSView *box = DPBarBox(panel);
        if (!box || panel.hiddenOrHasHiddenAncestor) continue;
        BOOL has = [DPGet(panel, &DPBarCardKey) superview] == box;
        if (has != patch->on) return patch->on ? @"command bar has no card" : @"card left on the command bar";
    }
    return nil;
}

DP_PATCH(DPWashiNewTab) {
    .key = @"washiNewTab",
    .order = 12,
    .title = @"Washi New Tab",
    .detail = @"Dia’s new tab page on Washi’s paper, with a handwritten hello and the date where the logo was.",
    .symbol = @"sun.horizon.fill sun.horizon",
    .tint = @"systemOrangeColor",
    .section = @"Washi",
    .classes = DPClasses(DPDiaNewTabPage, DPDiaNewTabLogo, DPDiaNewTabLogoParticles, DPDiaAssistantPanel),
    .hides = DPIsWashiNewTabLogo,
    .install = DPInstallWashiNewTab,
    .apply = DPApplyWashiNewTab,
    .verify = DPVerifyWashiNewTab,
};

DP_PATCH(DPWashiCommandBar) {
    .key = @"washiCommandBar",
    .order = 13,
    .title = @"Paper Command Bar",
    .detail = @"Dia’s Ask anything bar as a card of Washi’s paper, with the cut-paper shadow.",
    .symbol = @"text.bubble.fill text.bubble",
    .tint = @"systemIndigoColor",
    .section = @"Washi",
    .classes = DPClasses(DPDiaAssistantPanel, DPDiaCommandBar),
    .install = DPInstallWashiCommandBar,
    .apply = DPApplyWashiCommandBar,
    .verify = DPVerifyWashiCommandBar,
};
