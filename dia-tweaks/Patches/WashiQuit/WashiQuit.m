#import "StdPatch/StdPatch.h"
#import "Patches/WashiShared/WashiShared.h"

// Press ⌘Q Twice: like Washi, ⌘Q once shows a little paper note at the bottom of the window, "Press ⌘Q again to quit",
// and only a second ⌘Q within two seconds quits. Quitting from the menu with the mouse quits at once, as asked.
// Paper Toasts: Dia's little notices (Copied Current URL and the like) on Washi's card paper, in the window's light
// or dark, taped down in Scrapbook.

extern DPPatch DPWashiQuit, DPWashiToasts;
NSColor *DPWashiPaperColor(BOOL dark);                    // WashiPaper.m
NSView *DPWashiCardSheet(NSRect frame, CGFloat radius);   // WashiBars.m
NSFont *DPCaveat(CGFloat size);                           // WashiHand.m
static CFTimeInterval DPQuitAsked;
static char DPToastCardKey, DPToastStickKey;

#pragma mark The note

@interface DPWashiQuitNote : NSView
@end
@implementation DPWashiQuitNote
- (BOOL)isFlipped { return YES; }
- (NSView *)hitTest:(NSPoint)point { return nil; }
- (void)drawRect:(NSRect)dirty {
    BOOL dark = [[self.effectiveAppearance bestMatchFromAppearancesWithNames:@[ NSAppearanceNameAqua, NSAppearanceNameDarkAqua ]] isEqual:NSAppearanceNameDarkAqua];
    NSColor *paper = [DPWashiPaperColor(dark) colorUsingColorSpace:NSColorSpace.sRGBColorSpace];
    NSColor *card = [paper blendedColorWithFraction:dark ? .1 : .75 ofColor:NSColor.whiteColor];
    NSColor *ink = dark ? [NSColor colorWithSRGBRed:.95 green:.93 blue:.89 alpha:1] : [NSColor colorWithSRGBRed:43 / 255.0 green:33 / 255.0 blue:24 / 255.0 alpha:1];
    NSRect note = NSMakeRect(0, 0, NSWidth(self.bounds) - 3, NSHeight(self.bounds) - 3);
    [[NSColor colorWithWhite:0 alpha:dark ? .45 : .14] setFill]; [[NSBezierPath bezierPathWithRoundedRect:NSOffsetRect(note, 2, 2) xRadius:8 yRadius:8] fill];
    [card setFill]; [[NSBezierPath bezierPathWithRoundedRect:note xRadius:8 yRadius:8] fill];
    [[ink colorWithAlphaComponent:.1] setStroke]; [[NSBezierPath bezierPathWithRoundedRect:NSInsetRect(note, .5, .5) xRadius:8 yRadius:8] stroke];
    NSMutableParagraphStyle *mid = [NSMutableParagraphStyle new]; mid.alignment = NSTextAlignmentCenter;
    NSMutableAttributedString *text = [[NSMutableAttributedString alloc] initWithString:@"Press " attributes:@{ NSFontAttributeName: DPCaveat(21), NSForegroundColorAttributeName: ink, NSParagraphStyleAttributeName: mid }];
    [text appendAttributedString:[[NSAttributedString alloc] initWithString:@"⌘Q" attributes:@{ NSFontAttributeName: [NSFont systemFontOfSize:14 weight:NSFontWeightBold], NSForegroundColorAttributeName: ink, NSBaselineOffsetAttributeName: @2, NSParagraphStyleAttributeName: mid }]];
    [text appendAttributedString:[[NSAttributedString alloc] initWithString:@" again to quit" attributes:@{ NSFontAttributeName: DPCaveat(21), NSForegroundColorAttributeName: ink, NSParagraphStyleAttributeName: mid }]];
    [text drawInRect:NSMakeRect(10, 7, NSWidth(note) - 20, 30)];
}
@end

static void DPShowQuitNote(void) {
    NSWindow *window = NSApp.keyWindow ?: NSApp.mainWindow;
    NSView *root = window.contentView;
    if (!root) return;
    for (NSView *old in root.subviews) if ([old isKindOfClass:DPWashiQuitNote.class]) [old removeFromSuperview];
    DPWashiQuitNote *note = [[DPWashiQuitNote alloc] initWithFrame:NSMakeRect(0, 0, 250, 44)];
    note.wantsLayer = YES;
    NSRect b = root.bounds;
    [note setFrameOrigin:NSMakePoint(NSMidX(b) - 125, root.isFlipped ? NSMaxY(b) - 44 - 28 : 28)];
    note.autoresizingMask = NSViewMinXMargin | NSViewMaxXMargin | (root.isFlipped ? NSViewMinYMargin : NSViewMaxYMargin);
    [root addSubview:note];
    if (!DPWashiCalm()) {   // slaps down, like Washi's notes
        CABasicAnimation *in = [CABasicAnimation animationWithKeyPath:@"opacity"];
        in.fromValue = @0; in.toValue = @1; in.duration = .2;
        CABasicAnimation *drop = [CABasicAnimation animationWithKeyPath:@"transform.translation.y"];
        drop.fromValue = @(root.isFlipped ? -8 : 8); drop.toValue = @0; drop.additive = YES; drop.duration = .3;
        drop.timingFunction = [CAMediaTimingFunction functionWithControlPoints:.3 :1.18 :.5 :1];
        [note.layer addAnimation:in forKey:@"washiIn"]; [note.layer addAnimation:drop forKey:@"washiDrop"];
    }
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(2 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        [NSAnimationContext runAnimationGroup:^(NSAnimationContext *ctx) { ctx.duration = DPWashiCalm() ? 0 : .2; note.animator.alphaValue = 0; }
                            completionHandler:^{ [note removeFromSuperview]; }];
    });
}

static BOOL DPQuitByKeys(void) {
    NSEvent *e = NSApp.currentEvent;
    return e.type == NSEventTypeKeyDown && (e.modifierFlags & NSEventModifierFlagCommand) && [e.charactersIgnoringModifiers.lowercaseString isEqual:@"q"];
}

static void DPQuit_terminate(id self, SEL _cmd, id sender) {
    if (DPWashiLive(&DPWashiQuit) && DPQuitByKeys() && !NSApp.currentEvent.isARepeat) {
        CFTimeInterval now = CACurrentMediaTime();
        if (now - DPQuitAsked > 2) { DPQuitAsked = now; DPShowQuitNote(); return; }
    }
    DPCallOriginal(DPQuit_terminate, self, sender);
}

#pragma mark Toasts

static void DPToastPaper(NSWindow *panel) {
    NSView *view = panel.contentView, *card = DPGet(panel, &DPToastCardKey);
    if (!DPWashiLive(&DPWashiToasts) || !view) { [card removeFromSuperview]; DPSet(panel, &DPToastCardKey, nil); return; }
    NSWindow *parent = panel.parentWindow ?: NSApp.mainWindow;
    NSAppearanceName name = [(parent ?: panel).effectiveAppearance bestMatchFromAppearancesWithNames:@[ NSAppearanceNameAqua, NSAppearanceNameDarkAqua ]];
    panel.appearance = [NSAppearance appearanceNamed:name ?: NSAppearanceNameAqua];
    if (!card) { card = DPWashiCardSheet(view.bounds, 0); card.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable; card.layer.borderWidth = 0; DPSet(panel, &DPToastCardKey, card); }
    NSView *glass = nil;
    for (NSView *sub in view.subviews) if (sub != card && [sub isKindOfClass:NSVisualEffectView.class]) glass = sub;
    if (glass) { if (card.superview != glass.superview) [glass.superview addSubview:card positioned:NSWindowAbove relativeTo:glass]; card.frame = glass.frame; card.layer.cornerRadius = glass.layer.cornerRadius; }
    else if (view.subviews.firstObject != card) { [view addSubview:card positioned:NSWindowBelow relativeTo:nil]; card.frame = view.bounds; }
    CGFloat top = view.isFlipped ? 5 : NSHeight(view.bounds) - 5;
    DPWashiStick(view, &DPToastStickKey, DPWashiScrap(), CGSizeMake(44, 12), NSMakePoint(NSMidX(view.bounds), top), 3);
}

static void DPToast_order(NSWindow *self, SEL _cmd, NSWindowOrderingMode place, NSInteger other) {
    DPCallOriginal(DPToast_order, self, place, other);
    if (place != NSWindowOut) DPToastPaper(self);
}

static void DPInstallWashiQuit(void) {
    dispatch_async(dispatch_get_main_queue(), ^{ DPHookClass(object_getClass(NSApp), @selector(terminate:), (IMP)DPQuit_terminate); });
}
static void DPInstallWashiToasts(void) {
    DPHook(DPDiaToasts, @selector(orderWindow:relativeTo:), (IMP)DPToast_order);
}

DP_PATCH(DPWashiQuit) {
    .key = @"washiQuit",
    .order = 15,
    .title = @"Press ⌘Q Twice",
    .detail = @"Like Washi: ⌘Q once shows a note, and a second ⌘Q quits, so a slip of the finger never closes everything.",
    .symbol = @"hand.raised.fill hand.raised",
    .tint = @"systemRedColor",
    .section = @"Window",
    .requires = @"washiPaper",
    .install = DPInstallWashiQuit,
};

DP_PATCH(DPWashiToasts) {
    .key = @"washiToasts",
    .order = 15,
    .title = @"Paper Toasts",
    .detail = @"Dia’s little notices, like Copied Current URL, on Washi’s card paper, and taped down in Scrapbook.",
    .symbol = @"text.bubble.fill text.bubble",
    .tint = @"systemTealColor",
    .section = @"Window",
    .requires = @"washiPaper",
    .classes = DPClasses(DPDiaToasts),
    .install = DPInstallWashiToasts,
};
