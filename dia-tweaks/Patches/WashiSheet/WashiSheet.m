#import "StdPatch/StdPatch.h"
#import "Patches/WashiShared/WashiShared.h"
NSArray<NSView *> *DPWashiArtSheet(void);   // WashiLook.m

// Paper Sheet: the web page as a sheet laid on Washi's paper, with Washi's cut-paper shadow (a hard 2pt offset over a
// soft one) under its edge. It uses the gap Dia leaves around the page, so it never moves the page; with
// Edge-to-Edge Web Pages on there's no gap to show it in. The shadow lives inside the page's own container, so it
// moves and animates with the page (the sidebar sliding, a window resize).

extern DPPatch DPWashiSheet;
NSView *DPWashiCutShadow(CGFloat lift, CGFloat radius);   // WashiCards.m
static char DPSheetKey;

// The page's rounded clip inside its container, for its corner radius.
static CGFloat DPSheetRadius(NSView *container) {
    for (NSView *sub in container.subviews) if (sub.layer.cornerRadius > 0) return sub.layer.cornerRadius;
    return 10;
}

static void DPSheetIn(NSView *container) {
    NSView *shadow = DPGet(container, &DPSheetKey);
    if (!DPWashiLive(&DPWashiSheet)) { [shadow removeFromSuperview]; DPSet(container, &DPSheetKey, nil); return; }
    if (!shadow) {
        shadow = DPWashiCutShadow(2, DPSheetRadius(container));
        shadow.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
        DPSet(container, &DPSheetKey, shadow);
    }
    if (container.subviews.firstObject != shadow) [container addSubview:shadow positioned:NSWindowBelow relativeTo:nil];
    if (!NSEqualRects(shadow.frame, container.bounds)) shadow.frame = container.bounds;
    container.layer.masksToBounds = NO;   // the shadow falls just outside the page
}

static void DPSheet_layout(NSView *self, SEL _cmd) {
    DPCallOriginal(DPSheet_layout, self);
    DPSheetIn(self);
}

static void DPInstallWashiSheet(void) {
    DPHook(DPDiaContentContainer, @selector(layout), (IMP)DPSheet_layout);
}

static void DPApplyWashiSheet(DPPatch *patch) {
    for (NSView *container in DPFindViews(DPDiaContentContainer)) DPSheetIn(container);
}

static NSString *DPVerifyWashiSheet(DPPatch *patch) {
    for (NSView *container in DPFindViews(DPDiaContentContainer)) {
        if (container.hiddenOrHasHiddenAncestor) continue;
        BOOL has = [DPGet(container, &DPSheetKey) superview] == container;
        if (has != DPWashiLive(patch)) return DPWashiLive(patch) ? @"page has no sheet shadow" : @"sheet shadow left under the page";
    }
    return nil;
}

DP_PATCH(DPWashiSheet) {
    .key = @"washiSheet",
    .order = 14,
    .title = @"Paper Sheet",
    .detail = @"The web page as a sheet laid on Washi’s paper, with the cut-paper shadow under its edge.",
    .symbol = @"doc.fill doc",
    .tint = @"systemBrownColor",
    .section = @"Window",
    .requires = @"washiPaper",
    .rows = DPWashiArtSheet,
    .classes = DPClasses(DPDiaContentContainer),
    .disabledBy = @"edgeToEdge",   // no gap around the page to show it in
    .install = DPInstallWashiSheet,
    .apply = DPApplyWashiSheet,
    .verify = DPVerifyWashiSheet,
};
