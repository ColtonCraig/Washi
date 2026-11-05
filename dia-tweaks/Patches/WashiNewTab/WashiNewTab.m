#import "StdPatch/StdPatch.h"
#import "Patches/WashiShared/WashiShared.h"
NSArray<NSView *> *DPWashiArtCommandBar(void);   // WashiLook.m
NSArray<NSView *> *DPWashiArtNewTab(void);   // WashiLook.m
#import "StdPatch/Hide.h"

// Washi New Tab: Dia's own new tab page on Washi's paper, with Washi's hello in handwriting (good evening, and your
// first name) and the date and time under it, where Dia's logo was.
// Paper Command Bar: Dia's "Ask anything" bar, on the new tab page and wherever else it opens, as a card of Washi's
// paper with the cut-paper shadow.

extern DPPatch DPWashiNewTab, DPWashiCommandBar, DPWashiScrapbook;
NSView *DPWashiPaperMake(NSRect frame);              // WashiPaper.m
void DPWashiPaperRepaint(NSView *view);
NSView *DPWashiCardSheet(NSRect frame, CGFloat radius);   // WashiBars.m
NSView *DPWashiCutShadow(CGFloat lift, CGFloat radius);   // WashiCards.m
NSFont *DPCaveat(CGFloat size);                      // WashiHand.m
static char DPBarStickKey, DPNTPaperKey, DPHelloKey, DPBarCardKey, DPBarShadowKey, DPRowCardKey, DPRowShadowKey;
#define DPConnectRow "_TtC10NewTabPageP33_79FE2AF8AA62446573363F42ADABADD817ConnectAppRowView"

// The new tab page's "Connect Slack / Google" rows: card paper with the small cut shadow, like Washi's rows.
static void DPRowCards(NSView *page, BOOL want) {
    DPFindView(page, ^BOOL(NSView *row) {
        if (!DPIsKind(row, DPConnectRow)) return NO;
        NSView *card = DPGet(row, &DPRowCardKey), *shadow = DPGet(row, &DPRowShadowKey);
        if (!want || row.hidden) {
            [card removeFromSuperview]; [shadow removeFromSuperview];
            DPSet(row, &DPRowCardKey, nil); DPSet(row, &DPRowShadowKey, nil);
            return NO;
        }
        CGFloat radius = MAX(row.layer.cornerRadius, 8);
        if (!card) { card = DPWashiCardSheet(row.bounds, radius); card.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable; DPSet(row, &DPRowCardKey, card); }
        if (row.subviews.firstObject != card) [row addSubview:card positioned:NSWindowBelow relativeTo:nil];
        if (!NSEqualRects(card.frame, row.bounds)) card.frame = row.bounds;
        if (!shadow) { shadow = DPWashiCutShadow(1, radius); DPSet(row, &DPRowShadowKey, shadow); }
        if (shadow.superview != row.superview) [row.superview addSubview:shadow positioned:NSWindowBelow relativeTo:row];
        if (!NSEqualRects(shadow.frame, row.frame)) shadow.frame = row.frame;
        return NO;
    });
}

#pragma mark The new tab page

static BOOL DPInNewTab(NSView *view) {
    for (NSView *up = view.superview; up; up = up.superview) if (DPIsKind(up, DPDiaNewTabPage)) return YES;
    return NO;
}

static BOOL DPIsWashiNewTabLogo(NSView *view) {
    return DPWashiPaper.on && (DPIsKind(view, DPDiaNewTabLogo) || DPIsKind(view, DPDiaNewTabLogoParticles)) && DPInNewTab(view);
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
    DPRowCards(page, DPWashiLive(&DPWashiNewTab));
    if (!DPWashiLive(&DPWashiNewTab)) {
        [paper removeFromSuperview]; [hello removeFromSuperview];
        DPSet(page, &DPNTPaperKey, nil); DPSet(page, &DPHelloKey, nil);
        return;
    }
    BOOL arriving = !paper;
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
    // Scrapbook: the hello slants a little, like Washi's (-1.2°).
    CGFloat cx = NSWidth(hello.bounds) / 2, cy = NSHeight(hello.bounds) / 2;
    CGAffineTransform slant = CGAffineTransformTranslate(CGAffineTransformRotate(CGAffineTransformMakeTranslation(cx, cy), (DPWashiLive(&DPWashiScrapbook) ? -1.2 : 0) * M_PI / 180), -cx, -cy);
    if (!CGAffineTransformEqualToTransform(hello.layer.affineTransform, slant)) hello.layer.affineTransform = slant;
    // A new tab's page rises in like Washi's: the hello, then the bar, then the rows (Washi's tin: 10pt, -.4°, .42s).
    if (arriving) {
        DPWashiRiseIn(hello, 10, -.4, 1, .42, 0);
        DPWashiRiseIn(bar, 10, -.4, 1, .42, .05);
        __block CFTimeInterval delay = .1;
        DPFindView(page, ^BOOL(NSView *row) { if (DPIsKind(row, DPConnectRow)) { DPWashiRiseIn(row, 10, -.4, 1, .42, delay); delay += .04; } return NO; });
    }
}

static void DPNewTab_layout(NSView *self, SEL _cmd) {
    DPCallOriginal(DPNewTab_layout, self);
    DPNewTabIn(self);
}

static void DPInstallWashiNewTab(void) {
    DPHook(DPDiaNewTabPage, @selector(layout), (IMP)DPNewTab_layout);
    static NSTimer *clock;
    clock = [NSTimer scheduledTimerWithTimeInterval:20 repeats:YES block:^(NSTimer *t) {
        if (!DPWashiLive(&DPWashiNewTab)) return;
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
        if ((paper.superview == page) != DPWashiLive(patch)) return DPWashiLive(patch) ? @"new tab page has no paper" : @"paper left on the new tab page";
        DPWashiHello *hello = DPGet(page, &DPHelloKey);
        if (DPWashiLive(patch) && hello && !hello.hidden) {
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
    if (!DPWashiLive(&DPWashiCommandBar) || !box) {
        DPWashiStick(panel, &DPBarStickKey, NO, CGSizeZero, NSZeroPoint, 0);
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
    // Scrapbook: taped down across its top edge, like Washi's command bar (46×13).
    CGFloat top = panel.isFlipped ? NSMinY(box.frame) + .5 : NSMaxY(box.frame) - .5;
    DPWashiStick(panel, &DPBarStickKey, DPWashiScrap(), CGSizeMake(46, 13), NSMakePoint(NSMidX(box.frame), top), 2);
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
        if (has != DPWashiLive(patch)) return DPWashiLive(patch) ? @"command bar has no card" : @"card left on the command bar";
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
    .section = @"New Tab",
    .requires = @"washiPaper",
    .rows = DPWashiArtNewTab,
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
    .section = @"New Tab",
    .requires = @"washiPaper",
    .rows = DPWashiArtCommandBar,
    .classes = DPClasses(DPDiaAssistantPanel, DPDiaCommandBar),
    .install = DPInstallWashiCommandBar,
    .apply = DPApplyWashiCommandBar,
    .verify = DPVerifyWashiCommandBar,
};
