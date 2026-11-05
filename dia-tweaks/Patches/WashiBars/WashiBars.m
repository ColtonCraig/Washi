#import "StdPatch/StdPatch.h"

// Washi Bars: the toolbar and the bookmarks bar on Washi's paper, the same sheet as behind the sidebar, in place of the
// site's color. Dia gives the bars the appearance of the site's color (light text over a dark site); on paper they
// take the window's appearance again, so their text and icons stay in the paper's ink. Off, Dia's comes back.

extern DPPatch DPWashiBars;
NSView *DPWashiPaperMake(NSRect frame);         // WashiPaper.m
BOOL DPIsWashiPaperView(NSView *view);
void DPWashiPaperRepaint(NSView *view);
static char DPBarPaperKey, DPBarAppearanceKey;

static BOOL DPIsBar(NSView *view) { return DPIsKind(view, DPDiaToolbar) || DPIsKind(view, DPDiaBookmarksBar); }

// The bar's own fill: its first color view, the bar's full size (not the hairline under it).
static NSView *DPBarFill(NSView *bar) {
    for (NSView *sub in bar.subviews)
        if (DPIsKind(sub, DPDiaColorFill)) return NSHeight(sub.frame) >= 20 ? sub : nil;
    return nil;
}

static NSAppearance *DPWindowAppearance(NSView *view) {
    NSView *frame = view.window.contentView.superview;
    NSAppearance *look = frame ? frame.effectiveAppearance : NSApp.effectiveAppearance;
    NSAppearanceName name = [look bestMatchFromAppearancesWithNames:@[ NSAppearanceNameAqua, NSAppearanceNameDarkAqua ]];
    return [NSAppearance appearanceNamed:name ?: NSAppearanceNameAqua];
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
        return;
    }
    DPBarAppearance(bar, YES);
    if (!paper) { paper = DPWashiPaperMake(fill.frame); paper.autoresizingMask = NSViewNotSizable; DPSet(bar, &DPBarPaperKey, paper); }
    if (paper.superview != bar || [bar.subviews indexOfObject:paper] != [bar.subviews indexOfObject:fill] + 1)
        [bar addSubview:paper positioned:NSWindowAbove relativeTo:fill];
    if (!NSEqualRects(paper.frame, fill.frame)) paper.frame = fill.frame;
    paper.hidden = fill.hidden;
}

static void DPBar_layout(NSView *self, SEL _cmd) {
    DPCallOriginal(DPBar_layout, self);
    DPBarOn(self);
}

// Dia repaints the bar's fill, and sets its appearance again, when the site's color changes.
static void DPBarFill_updateLayer(NSView *self, SEL _cmd) {
    DPCallOriginal(DPBarFill_updateLayer, self);
    if (DPWashiBars.on && DPIsBar(self.superview)) DPBarOn(self.superview);
}

// The window turned light or dark: bars set to the old one follow.
@interface DPWashiBarsWatcher : NSObject
@end
@implementation DPWashiBarsWatcher
- (void)observeValueForKeyPath:(NSString *)keyPath ofObject:(id)object change:(NSDictionary *)change context:(void *)context {
    dispatch_async(dispatch_get_main_queue(), ^{
        if (!DPWashiBars.on) return;
        for (NSView *bar in [DPFindViews(DPDiaToolbar) arrayByAddingObjectsFromArray:DPFindViews(DPDiaBookmarksBar)]) DPBarOn(bar);
    });
}
@end

static void DPInstallWashiBars(void) {
    DPHook(DPDiaToolbar, @selector(layout), (IMP)DPBar_layout);
    DPHook(DPDiaBookmarksBar, @selector(layout), (IMP)DPBar_layout);
    DPHook(DPDiaColorFill, @selector(updateLayer), (IMP)DPBarFill_updateLayer);
    static DPWashiBarsWatcher *watcher;
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
