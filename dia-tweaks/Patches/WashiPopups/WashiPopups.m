#import "StdPatch/StdPatch.h"

// Paper Pop-ups: Dia's pop-ups (the downloads list, the site menu and the rest that open from the browser window) on
// Washi's card paper, in the window's own light or dark instead of Dia's dark glass. The pop-up keeps its own shape,
// border and shadow; the paper goes over its glass and under everything in it. Pages an extension shows in a
// pop-up draw themselves, so they stay as they are.

extern DPPatch DPWashiPopups;
NSView *DPWashiCardSheet(NSRect frame, CGFloat radius);   // WashiBars.m
static char DPPopCardKey, DPPopLookKey;

static NSAppearance *DPPopWindowLook(NSView *anchor) {
    NSAppearance *look = anchor.window ? anchor.window.effectiveAppearance : NSApp.effectiveAppearance;
    NSAppearanceName name = [look bestMatchFromAppearancesWithNames:@[ NSAppearanceNameAqua, NSAppearanceNameDarkAqua ]];
    return [NSAppearance appearanceNamed:name ?: NSAppearanceNameAqua];
}

static void DPPopPaper(NSPopover *popover, NSView *anchor) {
    NSView *view = popover.contentViewController.view;
    if (!view) return;
    NSView *card = DPGet(popover, &DPPopCardKey);
    if (!DPWashiPopups.on) {
        [card removeFromSuperview]; DPSet(popover, &DPPopCardKey, nil);
        id saved = DPGet(popover, &DPPopLookKey);
        if (saved) { popover.appearance = saved == NSNull.null ? nil : saved; DPSet(popover, &DPPopLookKey, nil); }
        return;
    }
    if (!DPGet(popover, &DPPopLookKey)) DPSet(popover, &DPPopLookKey, popover.appearance ?: (id)NSNull.null);
    popover.appearance = DPPopWindowLook(anchor);
    if (!card) { card = DPWashiCardSheet(view.bounds, 0); card.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable; card.layer.borderWidth = 0; DPSet(popover, &DPPopCardKey, card); }
    // Over any glass that fills the pop-up, under the rest.
    NSView *glass = nil;
    for (NSView *sub in view.subviews)
        if (sub != card && [sub isKindOfClass:NSVisualEffectView.class] && NSWidth(sub.frame) >= NSWidth(view.bounds) - 2 && NSHeight(sub.frame) >= NSHeight(view.bounds) - 2) glass = sub;
    if (glass) { if (card.superview != view || [view.subviews indexOfObject:card] != [view.subviews indexOfObject:glass] + 1) [view addSubview:card positioned:NSWindowAbove relativeTo:glass]; }
    else if (view.subviews.firstObject != card) [view addSubview:card positioned:NSWindowBelow relativeTo:nil];
    if (!NSEqualRects(card.frame, view.bounds)) card.frame = view.bounds;
}

// Only pop-ups that hang from a browser window: Dia's own, not the system's.
static BOOL DPPopFromDia(NSView *anchor) { return DPIsKind(anchor.window, DPDiaWindow); }

static void DPPop_show(NSPopover *self, SEL _cmd, NSRect rect, NSView *anchor, NSRectEdge edge) {
    BOOL ours = DPWashiPopups.on && DPPopFromDia(anchor);
    if (ours) {   // before it draws, so it never flashes dark
        if (!DPGet(self, &DPPopLookKey)) DPSet(self, &DPPopLookKey, self.appearance ?: (id)NSNull.null);
        self.appearance = DPPopWindowLook(anchor);
    }
    DPCallOriginal(DPPop_show, self, rect, anchor, edge);
    if (ours) DPPopPaper(self, anchor);
}

static void DPInstallWashiPopups(void) {
    DPHookClass(NSPopover.class, @selector(showRelativeToRect:ofView:preferredEdge:), (IMP)DPPop_show);
}

DP_PATCH(DPWashiPopups) {
    .key = @"washiPopups",
    .order = 15,
    .title = @"Paper Pop-ups",
    .detail = @"Dia’s pop-ups, like the downloads list, on Washi’s card paper in your light or dark.",
    .symbol = @"bubble.middle.bottom.fill bubble.middle.bottom",
    .tint = @"systemPinkColor",
    .section = @"Washi",
    .classes = DPClasses(DPDiaWindow),
    .install = DPInstallWashiPopups,
};
