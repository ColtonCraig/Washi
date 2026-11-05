#import "StdPatch/StdPatch.h"

// Washi Bars: the toolbar and the bookmarks bar on Washi's paper, the same sheet as behind the sidebar, in place of the
// site's color. Dia gives the bars the appearance of the site's color (light text over a dark site); on paper they
// take the window's appearance again, so their text and icons stay in the paper's ink. Off, Dia's comes back.

extern DPPatch DPWashiBars;
NSView *DPWashiPaperMake(NSRect frame);         // WashiPaper.m
BOOL DPIsWashiPaperView(NSView *view);
void DPWashiPaperRepaint(NSView *view);
NSColor *DPWashiPaperColor(BOOL dark);
static char DPBarWatchKey, DPBarPaperKey, DPBarAppearanceKey, DPBarCardKey, DPBarLineKey;
#define DPCapsule "_TtC13NavigationBar26NavigationBarCapsuleButton"

static BOOL DPBarDark(NSView *view) {
    return [[view.effectiveAppearance bestMatchFromAppearancesWithNames:@[ NSAppearanceNameAqua, NSAppearanceNameDarkAqua ]] isEqual:NSAppearanceNameDarkAqua];
}

// Washi's card paper for the address field and the bar's buttons, which Dia also fills with the site's color: the
// paper toward white, with a faint ink ring. It sits under everything in them, so their text and icons show on it.
@interface DPWashiBarCard : NSView
@end
@implementation DPWashiBarCard
- (instancetype)initWithFrame:(NSRect)frame {
    if ((self = [super initWithFrame:frame])) { self.wantsLayer = YES; self.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable; self.layer.borderWidth = 1; [self paint]; }
    return self;
}
- (NSView *)hitTest:(NSPoint)point { return nil; }
- (void)paint {
    BOOL dark = DPBarDark(self);
    NSColor *paper = [DPWashiPaperColor(dark) colorUsingColorSpace:NSColorSpace.sRGBColorSpace];
    [CATransaction begin]; [CATransaction setDisableActions:YES];
    self.layer.backgroundColor = [paper blendedColorWithFraction:dark ? .08 : .72 ofColor:NSColor.whiteColor].CGColor;
    self.layer.borderColor = (dark ? [NSColor colorWithWhite:1 alpha:.08] : [NSColor colorWithSRGBRed:43 / 255.0 green:33 / 255.0 blue:24 / 255.0 alpha:.1]).CGColor;
    [CATransaction commit];
}
- (void)viewDidChangeEffectiveAppearance { [super viewDidChangeEffectiveAppearance]; [self paint]; }
@end

// The hairline under the toolbar, in the paper's ink instead of the site's color.
@interface DPWashiBarLine : NSView
@end
@implementation DPWashiBarLine
- (instancetype)initWithFrame:(NSRect)frame { if ((self = [super initWithFrame:frame])) { self.wantsLayer = YES; [self paint]; } return self; }
- (NSView *)hitTest:(NSPoint)point { return nil; }
- (void)paint {
    BOOL dark = DPBarDark(self);
    NSColor *paper = [DPWashiPaperColor(dark) colorUsingColorSpace:NSColorSpace.sRGBColorSpace];
    NSColor *ink = dark ? NSColor.whiteColor : [NSColor colorWithSRGBRed:43 / 255.0 green:33 / 255.0 blue:24 / 255.0 alpha:1];
    self.layer.backgroundColor = [paper blendedColorWithFraction:dark ? .1 : .12 ofColor:ink].CGColor;
}
- (void)viewDidChangeEffectiveAppearance { [super viewDidChangeEffectiveAppearance]; [self paint]; }
@end

static void DPBarCardIn(NSView *box, CGFloat radius, BOOL want) {
    DPWashiBarCard *card = DPGet(box, &DPBarCardKey);
    if (!want) { if (card) { [card removeFromSuperview]; DPSet(box, &DPBarCardKey, nil); } return; }
    if (!card) { card = [[DPWashiBarCard alloc] initWithFrame:box.bounds]; DPSet(box, &DPBarCardKey, card); }
    card.layer.cornerRadius = radius;
    if (box.subviews.firstObject != card) [box addSubview:card positioned:NSWindowBelow relativeTo:nil];   // under all of it
    if (!NSEqualRects(card.frame, box.bounds)) card.frame = box.bounds;
}

// The address field's rounded box, and each of the bar's capsule buttons (Chat, Share…).
static void DPBarCards(NSView *bar, BOOL want) {
    if (!DPIsKind(bar, DPDiaToolbar)) return;
    DPFindView(bar, ^BOOL(NSView *view) {
        if (DPIsKind(view, DPDiaAddressField)) {
            NSView *box = view.subviews.firstObject;
            if (box && !DPIsKind(box, "NSStackView")) DPBarCardIn(box, MAX(box.layer.cornerRadius, 6), want);
        } else if (DPIsKind(view, DPCapsule)) {
            DPBarCardIn(view, MAX(view.layer.cornerRadius, 6), want && NSWidth(view.bounds) > 0);
        }
        return NO;
    });
}

static void DPBarLine(NSView *bar, BOOL want) {
    NSView *line = nil;
    for (NSView *sub in bar.subviews) if (DPIsKind(sub, DPDiaColorFill) && NSHeight(sub.frame) < 2 && NSHeight(sub.frame) > 0) line = sub;
    DPWashiBarLine *mine = DPGet(bar, &DPBarLineKey);
    if (!want || !line) { if (mine) { [mine removeFromSuperview]; DPSet(bar, &DPBarLineKey, nil); } return; }
    if (!mine) { mine = [[DPWashiBarLine alloc] initWithFrame:line.frame]; DPSet(bar, &DPBarLineKey, mine); }
    if (mine.superview != bar) [bar addSubview:mine positioned:NSWindowAbove relativeTo:line];
    if (!NSEqualRects(mine.frame, line.frame)) mine.frame = line.frame;
    mine.hidden = line.hidden;
}

static BOOL DPIsBar(NSView *view) { return DPIsKind(view, DPDiaToolbar) || DPIsKind(view, DPDiaBookmarksBar); }

// The bar's own fill: its first color view, the bar's full size (not the hairline under it).
static NSView *DPBarFill(NSView *bar) {
    for (NSView *sub in bar.subviews)
        if (DPIsKind(sub, DPDiaColorFill)) return NSHeight(sub.frame) >= 20 ? sub : nil;
    return nil;
}

static NSAppearance *DPWindowAppearance(NSView *view) {
    NSAppearance *look = view.window ? view.window.effectiveAppearance : NSApp.effectiveAppearance;
    NSAppearanceName name = [look bestMatchFromAppearancesWithNames:@[ NSAppearanceNameAqua, NSAppearanceNameDarkAqua ]];
    return [NSAppearance appearanceNamed:name ?: NSAppearanceNameAqua];
}

// The window turned light or dark (macOS, or Dia's own Appearance setting): its bars follow.
@interface DPWashiBarsWatcher : NSObject
@property (nonatomic, weak) NSWindow *window;
@end
static void DPBarOn(NSView *bar);
@implementation DPWashiBarsWatcher
- (void)observeValueForKeyPath:(NSString *)keyPath ofObject:(id)object change:(NSDictionary *)change context:(void *)context {
    dispatch_async(dispatch_get_main_queue(), ^{
        if (!DPWashiBars.on) return;
        for (NSView *bar in [DPFindViews(DPDiaToolbar) arrayByAddingObjectsFromArray:DPFindViews(DPDiaBookmarksBar)])
            if (!self.window || bar.window == self.window) DPBarOn(bar);
    });
}
- (void)dealloc { [_window removeObserver:self forKeyPath:@"effectiveAppearance"]; }
@end

static void DPBarWatch(NSWindow *window) {
    if (!window || DPGet(window, &DPBarWatchKey)) return;
    DPWashiBarsWatcher *watcher = [DPWashiBarsWatcher new];
    watcher.window = window;
    [window addObserver:watcher forKeyPath:@"effectiveAppearance" options:0 context:NULL];
    DPSet(window, &DPBarWatchKey, watcher);
}

static void DPBarAppearance(NSView *bar, BOOL paper) {
    id saved = DPGet(bar, &DPBarAppearanceKey);
    if (paper) {
        if (!saved) DPSet(bar, &DPBarAppearanceKey, bar.appearance ?: (id)NSNull.null);
        NSAppearance *want = DPWindowAppearance(bar);
        if (![bar.appearance.name isEqual:want.name]) bar.appearance = want;
    } else if (saved) {
        bar.appearance = saved == NSNull.null ? nil : saved;
        DPSet(bar, &DPBarAppearanceKey, nil);
    }
}

static void DPBarOn(NSView *bar) {
    NSView *fill = DPBarFill(bar), *paper = DPGet(bar, &DPBarPaperKey);
    BOOL on = DPWashiBars.on && fill;
    if (!on) {
        if (paper) { [paper removeFromSuperview]; DPSet(bar, &DPBarPaperKey, nil); }
        DPBarAppearance(bar, NO);
        DPBarCards(bar, NO); DPBarLine(bar, NO);
        return;
    }
    DPBarWatch(bar.window);
    DPBarAppearance(bar, YES);
    if (!paper) { paper = DPWashiPaperMake(fill.frame); paper.autoresizingMask = NSViewNotSizable; DPSet(bar, &DPBarPaperKey, paper); }
    if (paper.superview != bar || [bar.subviews indexOfObject:paper] != [bar.subviews indexOfObject:fill] + 1)
        [bar addSubview:paper positioned:NSWindowAbove relativeTo:fill];
    if (!NSEqualRects(paper.frame, fill.frame)) paper.frame = fill.frame;
    paper.hidden = fill.hidden;
    DPBarCards(bar, YES); DPBarLine(bar, YES);
}

static void DPBar_layout(NSView *self, SEL _cmd) {
    DPCallOriginal(DPBar_layout, self);
    DPBarOn(self);
}

// The address field and capsules come and go without the bar laying out again.
static void DPBarPart_layout(NSView *self, SEL _cmd) {
    DPCallOriginal(DPBarPart_layout, self);
    if (!DPWashiBars.on) return;
    for (NSView *up = self.superview; up; up = up.superview) if (DPIsKind(up, DPDiaToolbar)) { DPBarOn(up); break; }
}

// Dia repaints the bar's fill, and sets its appearance again, when the site's color changes.
static void DPBarFill_updateLayer(NSView *self, SEL _cmd) {
    DPCallOriginal(DPBarFill_updateLayer, self);
    if (DPWashiBars.on && DPIsBar(self.superview)) DPBarOn(self.superview);
}

static void DPInstallWashiBars(void) {
    DPHook(DPDiaToolbar, @selector(layout), (IMP)DPBar_layout);
    DPHook(DPDiaBookmarksBar, @selector(layout), (IMP)DPBar_layout);
    DPHook(DPDiaColorFill, @selector(updateLayer), (IMP)DPBarFill_updateLayer);
    DPHook(DPDiaAddressField, @selector(layout), (IMP)DPBarPart_layout);
    DPHook(DPCapsule, @selector(layout), (IMP)DPBarPart_layout);
    static DPWashiBarsWatcher *watcher;   // macOS's own switch, for every window (each window also has its own watcher)
    watcher = [DPWashiBarsWatcher new];
    [NSApp addObserver:watcher forKeyPath:@"effectiveAppearance" options:0 context:NULL];
}

static void DPApplyWashiBars(DPPatch *patch) {
    for (NSView *bar in [DPFindViews(DPDiaToolbar) arrayByAddingObjectsFromArray:DPFindViews(DPDiaBookmarksBar)]) {
        DPBarOn(bar);
        DPWashiPaperRepaint(DPGet(bar, &DPBarPaperKey));
    }
}

static NSString *DPVerifyWashiBars(DPPatch *patch) {
    for (NSView *bar in [DPFindViews(DPDiaToolbar) arrayByAddingObjectsFromArray:DPFindViews(DPDiaBookmarksBar)]) {
        NSView *fill = DPBarFill(bar);
        if (!fill || bar.hiddenOrHasHiddenAncestor) continue;
        BOOL has = NO;
        for (NSView *sub in bar.subviews) if (DPIsWashiPaperView(sub)) has = YES;
        if (has != patch->on) return patch->on ? @"a bar has no paper" : @"paper left on a bar";
        if (patch->on && ![bar.effectiveAppearance.name isEqual:DPWindowAppearance(bar).name]) return @"a bar kept the site's appearance";
    }
    return nil;
}

DP_PATCH(DPWashiBars) {
    .key = @"washiBars",
    .order = 11,
    .title = @"Paper Toolbar",
    .detail = @"The toolbar and bookmarks bar on Washi’s paper instead of the site’s color.",
    .symbol = @"menubar.rectangle",
    .tint = @"systemYellowColor",
    .section = @"Washi",
    .classes = DPClasses(DPDiaToolbar, DPDiaBookmarksBar, DPDiaColorFill),
    .install = DPInstallWashiBars,
    .apply = DPApplyWashiBars,
    .verify = DPVerifyWashiBars,
};
