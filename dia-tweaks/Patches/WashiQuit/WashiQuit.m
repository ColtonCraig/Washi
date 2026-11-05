#import "StdPatch/StdPatch.h"
#import "Patches/WashiShared/WashiShared.h"
NSArray<NSView *> *DPWashiArtToasts(void);   // WashiLook.m
NSArray<NSView *> *DPWashiArtQuit(void);   // WashiLook.m

// Press ⌘Q Twice: like Washi, ⌘Q once shows a little paper note at the bottom of the window, "Press ⌘Q again to quit",
// and only a second ⌘Q within two seconds quits. Quitting from the menu with the mouse quits at once, as asked.
// Paper Toasts: Dia's little notices (Copied Current URL and the like) on Washi's card paper, in the window's light
// or dark, taped down in Scrapbook.

extern DPPatch DPWashiQuit, DPWashiToasts;
NSColor *DPWashiPaperColor(BOOL dark);                    // WashiPaper.m
NSView *DPWashiCardSheet(NSRect frame, CGFloat radius);   // WashiBars.m
NSFont *DPCaveat(CGFloat size);                           // WashiHand.m
NSFont *DPWashiUIFont(CGFloat size, NSFontWeight weight);   // WashiType.m
static CFTimeInterval DPQuitAsked;
static char DPToastCardKey, DPToastStickKey;

#pragma mark The note

// Washi's toast: a slip of card paper at the bottom of the window (44pt, Figtree, a mark in the tape color), rising
// in on Washi's spring and dropping away after a moment. Taped down and a little crooked in Scrapbook. One at a time.
@interface DPWashiNote : NSView
@property (nonatomic, copy) NSString *text, *symbol;
@property (nonatomic) BOOL hand;   // the ⌘Q note is handwritten
@end
@implementation DPWashiNote
- (BOOL)isFlipped { return YES; }
- (NSView *)hitTest:(NSPoint)point { return nil; }
- (BOOL)dark { return [[self.effectiveAppearance bestMatchFromAppearancesWithNames:@[ NSAppearanceNameAqua, NSAppearanceNameDarkAqua ]] isEqual:NSAppearanceNameDarkAqua]; }
- (NSColor *)ink { return self.dark ? [NSColor colorWithSRGBRed:.95 green:.93 blue:.89 alpha:1] : [NSColor colorWithSRGBRed:43 / 255.0 green:33 / 255.0 blue:24 / 255.0 alpha:1]; }
- (NSAttributedString *)line {
    NSColor *ink = self.ink;
    if (!self.hand) return [[NSAttributedString alloc] initWithString:self.text ?: @"" attributes:@{ NSFontAttributeName: DPWashiUIFont(13.5, NSFontWeightSemibold), NSForegroundColorAttributeName: ink }];
    NSMutableAttributedString *text = [NSMutableAttributedString new];
    NSArray *bits = [self.text componentsSeparatedByString:@"⌘Q"];
    for (NSUInteger i = 0; i < bits.count; i++) {
        if (i) [text appendAttributedString:[[NSAttributedString alloc] initWithString:@"⌘Q" attributes:@{ NSFontAttributeName: [NSFont systemFontOfSize:14 weight:NSFontWeightBold], NSForegroundColorAttributeName: ink, NSBaselineOffsetAttributeName: @2 }]];
        [text appendAttributedString:[[NSAttributedString alloc] initWithString:bits[i] attributes:@{ NSFontAttributeName: DPCaveat(21), NSForegroundColorAttributeName: ink }]];
    }
    return text;
}
- (CGFloat)mark { return self.symbol ? 22 : 0; }
- (CGFloat)fitWidth { return ceil(self.line.size.width) + 32 + self.mark + 3; }
- (void)drawRect:(NSRect)dirty {
    BOOL dark = self.dark;
    NSColor *paper = [DPWashiPaperColor(dark) colorUsingColorSpace:NSColorSpace.sRGBColorSpace];
    NSColor *card = [paper blendedColorWithFraction:dark ? .1 : .75 ofColor:NSColor.whiteColor], *ink = self.ink;
    NSRect note = NSMakeRect(1.5, 0, NSWidth(self.bounds) - 3, NSHeight(self.bounds) - 6);
    NSShadow *lift = [NSShadow new];   // Washi's: 0 10px 30px at a fifth, here a little tighter for a smaller window
    lift.shadowColor = [NSColor colorWithWhite:0 alpha:dark ? .5 : .2]; lift.shadowOffset = NSMakeSize(0, -4); lift.shadowBlurRadius = 6;
    [NSGraphicsContext saveGraphicsState]; [lift set];
    [card setFill]; [[NSBezierPath bezierPathWithRoundedRect:note xRadius:12 yRadius:12] fill];
    [NSGraphicsContext restoreGraphicsState];
    [[ink colorWithAlphaComponent:.08] setStroke]; [[NSBezierPath bezierPathWithRoundedRect:NSInsetRect(note, .5, .5) xRadius:11.5 yRadius:11.5] stroke];
    CGFloat x = NSMinX(note) + 16;
    if (self.symbol) {
        extern uint32_t DPWashiTapeRGBFor(NSWindow *window);
        NSImage *mark = [[NSImage imageWithSystemSymbolName:self.symbol accessibilityDescription:nil] imageWithSymbolConfiguration:[NSImageSymbolConfiguration configurationWithPointSize:13 weight:NSFontWeightBold]];
        NSColor *tape = DPWashiRGB(DPWashiTapeRGBFor(self.window));
        NSImage *tinted = [NSImage imageWithSize:mark.size flipped:NO drawingHandler:^BOOL(NSRect r) { [mark drawInRect:r]; [tape set]; NSRectFillUsingOperation(r, NSCompositingOperationSourceAtop); return YES; }];
        [tinted drawInRect:NSMakeRect(x, NSMidY(note) - mark.size.height / 2, mark.size.width, mark.size.height) fromRect:NSZeroRect operation:NSCompositingOperationSourceOver fraction:1 respectFlipped:YES hints:nil];
        x += self.mark;
    }
    NSAttributedString *line = self.line;
    NSMutableAttributedString *fit = [line mutableCopy];
    NSMutableParagraphStyle *tail = [NSMutableParagraphStyle new]; tail.lineBreakMode = NSLineBreakByTruncatingTail;
    [fit addAttribute:NSParagraphStyleAttributeName value:tail range:NSMakeRange(0, fit.length)];
    CGFloat h = ceil(line.size.height);
    [fit drawInRect:NSMakeRect(x, NSMidY(note) - h / 2, NSMaxX(note) - 16 - x, h)];
}
@end

static char DPNoteKey, DPNoteStickKey;
void DPWashiShowNote(NSWindow *window, NSString *text, NSString *symbol, BOOL hand, NSTimeInterval hold) {
    NSView *root = window.contentView;
    if (!root || !text.length) return;
    DPWashiNote *old = DPGet(window, &DPNoteKey);
    [old removeFromSuperview];
    DPWashiNote *note = [DPWashiNote new];
    note.text = text; note.symbol = symbol; note.hand = hand;
    note.wantsLayer = YES;
    DPSet(window, &DPNoteKey, note);
    NSRect b = root.bounds;
    CGFloat w = MIN(note.fitWidth, NSWidth(b) - 20), h = 50;   // 44 of paper, and room for its shadow
    [note setFrame:NSMakeRect(round(NSMidX(b) - w / 2), root.isFlipped ? NSMaxY(b) - h - 12 : 12, w, h)];
    note.autoresizingMask = NSViewMinXMargin | NSViewMaxXMargin | (root.isFlipped ? NSViewMinYMargin : NSViewMaxYMargin);
    [root addSubview:note positioned:NSWindowAbove relativeTo:nil];
    BOOL scrap = DPWashiScrap();
    if (scrap) {
        DPWashiStick(note, &DPNoteStickKey, YES, CGSizeMake(44, 14), NSMakePoint(w / 2, 1), 3);   // across its top edge
        note.frameCenterRotation = -.9 * MIN(DPWashiTilt(), 2.2);
    }
    // In: up 16pt on Washi's toast spring (.26s), faded in over .18s. Out: back down and gone.
    DPWashiRiseIn(note, 16, scrap ? 3 * DPWashiTilt() : 0, 1, .26, 0);
    __weak DPWashiNote *weak = note;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(hold * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        DPWashiNote *me = weak;
        if (!me || DPGet(window, &DPNoteKey) != me) return;   // another note took its place
        [NSAnimationContext runAnimationGroup:^(NSAnimationContext *ctx) {
            ctx.duration = DPWashiCalm() ? 0 : .18;
            me.animator.alphaValue = 0;
            if (!DPWashiCalm()) { NSPoint o = me.frame.origin; o.y += root.isFlipped ? 10 : -10; [me.animator setFrameOrigin:o]; }
        } completionHandler:^{ [me removeFromSuperview]; if (DPGet(window, &DPNoteKey) == me) DPSet(window, &DPNoteKey, nil); }];
    });
}

static void DPShowQuitNote(void) {
    NSWindow *window = NSApp.keyWindow ?: NSApp.mainWindow;
    DPWashiShowNote(window, @"Press ⌘Q again to quit", nil, YES, 2);
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

// Dia says "Copied current URL" in its address field, and DiaTweaks shows its own pill when the toolbar is hidden.
// With Paper Toasts each copy gets Washi's toast instead: the Copy items of Dia's menus, and Copy Link, Copy Image…
// in a page's right-click menu. Edit › Copy itself (⌘C) stays quiet, as in Washi.
static NSString *DPCopiedSays(NSMenuItem *item) {
    NSString *title = item.title;
    if (![title hasPrefix:@"Copy "] || title.length < 6) return nil;
    if ([title isEqual:@"Copy URL"]) return @"Copied current URL";
    NSString *what = [title substringFromIndex:5];
    if ([what hasSuffix:@"…"] || [what hasSuffix:@"..."]) return nil;   // opens something to choose from first
    BOOL acronym = what.length > 1 && [NSCharacterSet.uppercaseLetterCharacterSet characterIsMember:[what characterAtIndex:1]];
    if (!acronym) what = [[what substringToIndex:1].lowercaseString stringByAppendingString:[what substringFromIndex:1]];
    return [@"Copied " stringByAppendingString:what];
}

static void DPCopiedNote(NSNotification *notification) {
    if (!DPWashiLive(&DPWashiToasts)) return;
    NSString *says = DPCopiedSays(notification.userInfo[@"MenuItem"]);
    NSWindow *window = NSApp.keyWindow;
    if (!says || !window || !DPIsKind(window.contentView.superview, DPDiaWindowFrame)) return;   // browser windows only
    DPWashiShowNote(window, says, @"checkmark", NO, 1.6);
}

// DiaTweaks' own pill (Show Toast When Copying URL) says nothing while ours does: one toast, not two.
static void DPCopyPill_show(NSView *self, SEL _cmd, NSString *message, NSView *pane) {
    if (DPWashiLive(&DPWashiToasts)) return;
    DPCallOriginal(DPCopyPill_show, self, message, pane);
}

// Dia's toast window (some notices come in one): Washi's card paper over its glass, wherever the glass is in it.
static NSVisualEffectView *DPToastGlass(NSView *view) {
    __block NSVisualEffectView *glass = nil;
    DPFindView(view, ^BOOL(NSView *v) { if ([v isKindOfClass:NSVisualEffectView.class] && NSWidth(v.frame) > 40) { glass = (NSVisualEffectView *)v; return YES; } return NO; });
    return glass;
}

// What a toast window is made of, written once to ~/Library/Logs/DiaTweaks-Washi-toast.txt, so a toast that still
// looks like Dia's can be fixed from it.
static void DPToastDescribe(NSWindow *panel) {
    static BOOL done;
    if (done) return;
    done = YES;
    NSMutableString *out = [NSMutableString stringWithFormat:@"%@ %@\n", NSStringFromClass(panel.class), NSStringFromRect(panel.frame)];
    __block void (^walk)(NSView *, NSUInteger);
    __block __weak void (^weakWalk)(NSView *, NSUInteger);
    weakWalk = walk = ^(NSView *v, NSUInteger depth) {
        [out appendFormat:@"%@%@ %@ layer=%@\n", [@"" stringByPaddingToLength:depth * 2 withString:@" " startingAtIndex:0], NSStringFromClass(v.class), NSStringFromRect(v.frame), v.layer ? NSStringFromClass(v.layer.class) : @"-"];
        if (depth < 12) for (NSView *sub in v.subviews) weakWalk(sub, depth + 1);
    };
    if (panel.contentView) walk(panel.contentView, 0);
    NSString *path = [NSHomeDirectory() stringByAppendingPathComponent:@"Library/Logs/DiaTweaks-Washi-toast.txt"];
    [out writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:NULL];
}

static void DPToastPaper(NSWindow *panel) {
    NSView *view = panel.contentView, *card = DPGet(panel, &DPToastCardKey);
    if (!DPWashiLive(&DPWashiToasts) || !view) { [card removeFromSuperview]; DPSet(panel, &DPToastCardKey, nil); DPWashiStick(view, &DPToastStickKey, NO, CGSizeZero, NSZeroPoint, 0); return; }
    DPToastDescribe(panel);
    NSWindow *parent = panel.parentWindow ?: NSApp.mainWindow;
    NSAppearanceName name = [(parent ?: panel).effectiveAppearance bestMatchFromAppearancesWithNames:@[ NSAppearanceNameAqua, NSAppearanceNameDarkAqua ]];
    panel.appearance = [NSAppearance appearanceNamed:name ?: NSAppearanceNameAqua];
    if (!card) { card = DPWashiCardSheet(view.bounds, 0); card.layer.borderWidth = 0; DPSet(panel, &DPToastCardKey, card); }
    NSVisualEffectView *glass = DPToastGlass(view);
    if (glass) {   // inside the glass, under what it holds: the card covers the blur and the words stay on top
        card.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
        if (card.superview != glass) [glass addSubview:card positioned:NSWindowBelow relativeTo:nil];
        card.frame = glass.bounds;
        card.layer.cornerRadius = MAX(glass.layer.cornerRadius, MIN(12, NSHeight(glass.bounds) / 2));
    } else {
        card.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
        if (view.subviews.firstObject != card) [view addSubview:card positioned:NSWindowBelow relativeTo:nil];
        card.frame = view.bounds;
        card.layer.cornerRadius = MIN(12, NSHeight(view.bounds) / 2);
    }
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
// Dia's toast window has had more than one name: any small panel with "Toast" in its class's name.
static void DPAnyPanel_order(NSWindow *self, SEL _cmd, NSWindowOrderingMode place, NSInteger other) {
    DPCallOriginal(DPAnyPanel_order, self, place, other);
    if (place == NSWindowOut || !DPWashiLive(&DPWashiToasts)) return;
    NSString *name = NSStringFromClass(self.class);
    if ([name containsString:@"Toast"] && NSHeight(self.frame) < 120) DPToastPaper(self);
}
static void DPInstallWashiToasts(void) {
    DPHook(DPDiaToasts, @selector(orderWindow:relativeTo:), (IMP)DPToast_order);
    DPHookClass(NSPanel.class, @selector(orderWindow:relativeTo:), (IMP)DPAnyPanel_order);
    if (objc_getClass("DPCopyToastView")) DPHook("DPCopyToastView", @selector(showMessage:in:), (IMP)DPCopyPill_show);
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        [NSNotificationCenter.defaultCenter addObserverForName:NSMenuDidSendActionNotification object:nil queue:nil usingBlock:^(NSNotification *n) { DPCopiedNote(n); }];
    });
}
static void DPApplyWashiToasts(DPPatch *patch) {
    for (NSWindow *panel in NSApp.windows)
        if ([NSStringFromClass(panel.class) containsString:@"Toast"] && panel.isVisible) DPToastPaper(panel);
}

DP_PATCH(DPWashiQuit) {
    .key = @"washiQuit",
    .defaultOn = YES,
    .order = 15,
    .title = @"Press ⌘Q Twice",
    .detail = @"Like Washi: ⌘Q once shows a note, and a second ⌘Q quits, so a slip of the finger never closes everything.",
    .symbol = @"hand.raised.fill hand.raised",
    .tint = @"systemRedColor",
    .section = @"Window",
    .requires = @"washiPaper",
    .rows = DPWashiArtQuit,
    .install = DPInstallWashiQuit,
};

DP_PATCH(DPWashiToasts) {
    .key = @"washiToasts",
    .defaultOn = YES,
    .order = 15,
    .title = @"Paper Toasts",
    .detail = @"Washi’s paper toast at the bottom of the window when you copy something (⇧⌘C, Copy Link, Copy Image…), and Dia’s own notices on Washi’s card paper. Taped down in Scrapbook.",
    .symbol = @"text.bubble.fill text.bubble",
    .tint = @"systemTealColor",
    .section = @"Window",
    .requires = @"washiPaper",
    .rows = DPWashiArtToasts,
    .install = DPInstallWashiToasts,
    .apply = DPApplyWashiToasts,
};
