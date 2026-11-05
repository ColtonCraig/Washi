#import "StdPatch/StdPatch.h"
#import "Patches/WashiShared/WashiShared.h"
NSArray<NSView *> *DPWashiArtHand(void);   // WashiLook.m
#import <CoreText/CoreText.h>
#import "Caveat.h"

// Washi Hand: the space's name in Washi's handwriting (Caveat) at the top of its tabs, between the favorites and the
// first tab, as Washi writes it at the top of the sidebar. Dia's tab list moves down to make the room, so nothing
// overlaps. The name is Dia's own (the part of the window title before ": "), and it fades over when it changes.

extern DPPatch DPWashiHand;
#define DPTabListScroll "_TtC7TabListP33_9A67AB465A78F9E1122D59704CA866E621SpacePagingScrollView"
static const CGFloat DPHandRoom = 30;   // the strip the name takes
static char DPHandKey, DPHandWatchKey, DPHandMovedKey, DPHandDiaKey;

NSFont *DPCaveat(CGFloat size) {   // also for the other Washi tweaks
    static CGFontRef font;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        CFDataRef data = CFDataCreateWithBytesNoCopy(NULL, DPCaveatData, sizeof DPCaveatData, kCFAllocatorNull);
        CGDataProviderRef provider = CGDataProviderCreateWithCFData(data);
        font = CGFontCreateWithDataProvider(provider);
        CGDataProviderRelease(provider); CFRelease(data);
    });
    if (!font) return [NSFont systemFontOfSize:size weight:NSFontWeightSemibold];
    return (__bridge_transfer NSFont *)CTFontCreateWithGraphicsFont(font, size, NULL, NULL);
}

// "Personal: New Tab" → "Personal". A window with no space in its title gets no name.
static NSString *DPSpaceName(NSWindow *window) {
    NSString *title = window.title;
    NSRange at = [title rangeOfString:@": "];
    if (at.location == NSNotFound || at.location == 0) return nil;
    return [title substringToIndex:at.location];
}

@interface DPWashiHandLabel : NSTextField
@end
@implementation DPWashiHandLabel
- (NSView *)hitTest:(NSPoint)point { return nil; }
@end

@interface DPWashiHandWatcher : NSObject
@property (nonatomic, weak) NSWindow *window;
@end
@implementation DPWashiHandWatcher
- (void)observeValueForKeyPath:(NSString *)keyPath ofObject:(id)object change:(NSDictionary *)change context:(void *)context {
    dispatch_async(dispatch_get_main_queue(), ^{
        for (NSView *list in DPFindViews(DPDiaTabList)) if (list.window == self.window) list.needsLayout = YES;
    });
}
- (void)dealloc { [_window removeObserver:self forKeyPath:@"title"]; }
@end

static void DPHandWatch(NSWindow *window) {
    if (!window || DPGet(window, &DPHandWatchKey)) return;
    DPWashiHandWatcher *watcher = [DPWashiHandWatcher new];
    watcher.window = window;
    [window addObserver:watcher forKeyPath:@"title" options:0 context:NULL];
    DPSet(window, &DPHandWatchKey, watcher);
}

static NSView *DPHandScroll(NSView *list) {
    for (NSView *sub in list.subviews) if (DPIsKind(sub, DPTabListScroll)) return sub;
    return nil;
}

static void DPHandIn(NSView *list) {
    DPWashiHandLabel *label = DPGet(list, &DPHandKey);
    NSView *scroll = DPHandScroll(list);
    NSString *name = DPWashiLive(&DPWashiHand) ? DPSpaceName(list.window) : nil;
    // The frame this tweak last gave the tab list, and Dia's from before it. When the list still has ours, Dia hasn't
    // placed it since, so it isn't moved again; off, Dia's goes back.
    NSValue *moved = scroll ? DPGet(scroll, &DPHandMovedKey) : nil, *dia = scroll ? DPGet(scroll, &DPHandDiaKey) : nil;
    BOOL ours = moved && NSEqualRects(moved.rectValue, scroll.frame);
    if (!scroll || !name.length) {
        if (label) { [label removeFromSuperview]; DPSet(list, &DPHandKey, nil); }
        if (ours && dia) scroll.frame = dia.rectValue;
        if (scroll) { DPSet(scroll, &DPHandMovedKey, nil); DPSet(scroll, &DPHandDiaKey, nil); }
        return;
    }
    NSRect frame = ours ? dia.rectValue : scroll.frame;   // where Dia put it
    if (NSHeight(frame) <= DPHandRoom * 3) {                // a sidebar too short for it keeps every tab instead
        if (label) label.hidden = YES;
        if (ours) scroll.frame = frame;
        DPSet(scroll, &DPHandMovedKey, nil);
        return;
    }
    NSRect room = NSMakeRect(NSMinX(frame), list.isFlipped ? NSMinY(frame) : NSMaxY(frame) - DPHandRoom, NSWidth(frame), DPHandRoom);
    if (!ours && DPMayAdjust(scroll)) {                     // it moves down by the room, keeping its bottom where it was
        NSRect mine = frame;
        mine.size.height -= DPHandRoom;
        if (list.isFlipped) mine.origin.y += DPHandRoom;
        DPSet(scroll, &DPHandDiaKey, [NSValue valueWithRect:frame]);
        DPSet(scroll, &DPHandMovedKey, [NSValue valueWithRect:mine]);
        scroll.frame = mine;
    }
    if (!label) {
        label = [DPWashiHandLabel labelWithString:@""];
        label.font = DPCaveat(21);
        label.textColor = NSColor.labelColor;
        label.alphaValue = .86;
        label.lineBreakMode = NSLineBreakByTruncatingTail;
        label.maximumNumberOfLines = 1;
        label.wantsLayer = YES;
        DPSet(list, &DPHandKey, label);
    }
    label.hidden = NO;
    if (label.superview != list) [list addSubview:label positioned:NSWindowAbove relativeTo:scroll];
    if (![label.stringValue isEqual:name]) {
        if (label.stringValue.length && !DPWashiCalm()) {
            CATransition *fade = [CATransition animation];
            fade.type = kCATransitionFade; fade.duration = .2;
            fade.timingFunction = [CAMediaTimingFunction functionWithControlPoints:.215 :.61 :.355 :1];
            [label.layer addAnimation:fade forKey:@"washiName"];
        }
        label.stringValue = name;
    }
    // 15pt in, like the tab icons; the line sits low in the strip, so Caveat's tall letters and tails both have room.
    NSRect text = NSMakeRect(NSMinX(room) + 15, NSMinY(room) + 1, NSWidth(room) - 30, DPHandRoom - 2);
    if (!NSEqualRects(label.frame, text)) label.frame = text;
    DPHandWatch(list.window);
}

#pragma mark The pinned-tabs divider

// Dia's line between pinned tabs and the rest becomes a pencil line: a little wobble, the ink at a quarter. It follows
// Dia's own line (which Tidy Tabs shortens for its broom), and Dia's goes see-through while it shows.
static char DPPencilKey, DPPencilDiaKey;

static CALayer *DPDiaDivider(NSView *separator) {
    for (CALayer *layer in separator.layer.sublayers)
        if (NSHeight(layer.frame) <= 1.5 && NSWidth(layer.frame) > 20 && ![layer isKindOfClass:CAShapeLayer.class]) return layer;
    return nil;
}

static void DPPencilIn(NSView *separator) {
    CALayer *line = DPDiaDivider(separator);
    CAShapeLayer *pencil = DPGet(separator, &DPPencilKey);
    if (!DPWashiLive(&DPWashiHand) || !line) {
        [pencil removeFromSuperlayer]; DPSet(separator, &DPPencilKey, nil);
        NSNumber *dia = DPGet(separator, &DPPencilDiaKey);
        if (line && dia) { line.opacity = dia.floatValue; DPSet(separator, &DPPencilDiaKey, nil); }
        return;
    }
    if (!DPGet(separator, &DPPencilDiaKey)) DPSet(separator, &DPPencilDiaKey, @(line.opacity));
    [CATransaction begin]; [CATransaction setDisableActions:YES];
    line.opacity = 0;
    if (!pencil) {
        pencil = [CAShapeLayer layer];
        pencil.fillColor = nil; pencil.lineWidth = 1.2; pencil.lineCap = kCALineCapRound;
        DPSet(separator, &DPPencilKey, pencil);
    }
    if (pencil.superlayer != separator.layer) [separator.layer addSublayer:pencil];
    BOOL dark = [[separator.effectiveAppearance bestMatchFromAppearancesWithNames:@[ NSAppearanceNameAqua, NSAppearanceNameDarkAqua ]] isEqual:NSAppearanceNameDarkAqua];
    pencil.strokeColor = (dark ? [NSColor colorWithWhite:1 alpha:.26] : [NSColor colorWithSRGBRed:43 / 255.0 green:33 / 255.0 blue:24 / 255.0 alpha:.26]).CGColor;
    CGRect f = line.frame;
    if (!CGRectEqualToRect(pencil.frame, CGRectMake(f.origin.x, CGRectGetMidY(f) - 2, f.size.width, 4))) {
        pencil.frame = CGRectMake(f.origin.x, CGRectGetMidY(f) - 2, f.size.width, 4);
        CGMutablePathRef path = CGPathCreateMutable();
        CGPathMoveToPoint(path, NULL, 1, 2);
        for (CGFloat x = 1; x < f.size.width - 1; x += 6) {   // a gentle, even wobble: the same every time
            CGFloat y = 2 + .7 * sin(x / 9.0) + .35 * sin(x / 3.7);
            CGPathAddLineToPoint(path, NULL, MIN(x + 6, f.size.width - 1), y);
        }
        pencil.path = path;
        CGPathRelease(path);
    }
    [CATransaction commit];
}

static void DPPencil_layout(NSView *self, SEL _cmd) {
    DPCallOriginal(DPPencil_layout, self);
    DPPencilIn(self);
}
static void DPPencil_appearance(NSView *self, SEL _cmd) {
    DPCallOriginal(DPPencil_appearance, self);
    DPPencilIn(self);
}

static void DPHandList_layout(NSView *self, SEL _cmd) {
    DPCallOriginal(DPHandList_layout, self);
    DPHandIn(self);
}

static void DPInstallWashiHand(void) {
    DPHook(DPDiaTabList, @selector(layout), (IMP)DPHandList_layout);
    DPHook(DPDiaTabListSeparator, @selector(layout), (IMP)DPPencil_layout);
    DPHook(DPDiaTabListSeparator, @selector(viewDidChangeEffectiveAppearance), (IMP)DPPencil_appearance);
}

static void DPApplyWashiHand(DPPatch *patch) {
    for (NSView *list in DPFindViews(DPDiaTabList)) { DPHandIn(list); list.needsLayout = YES; }
    for (NSView *separator in DPFindViews(DPDiaTabListSeparator)) DPPencilIn(separator);
}

static NSString *DPVerifyWashiHand(DPPatch *patch) {
    for (NSView *list in DPFindViews(DPDiaTabList)) {
        if (list.hiddenOrHasHiddenAncestor) continue;
        NSTextField *label = DPGet(list, &DPHandKey);
        NSString *name = DPSpaceName(list.window);
        if (!DPWashiLive(patch)) { if (label.superview) return @"name left on the sidebar"; continue; }
        if (!name.length || label.hidden) continue;
        if (!label.superview) return @"no space name on the sidebar";
        if (![label.stringValue isEqual:name]) return @"space name is out of date";
        NSView *scroll = DPHandScroll(list);
        if (scroll && NSIntersectsRect(NSInsetRect(label.frame, 0, 1), scroll.frame)) return @"space name overlaps the tabs";
    }
    return nil;
}

DP_PATCH(DPWashiHand) {
    .key = @"washiHand",
    .order = 8,
    .title = @"Washi Handwriting",
    .detail = @"The space’s name in Washi’s handwriting at the top of its tabs, and the line under your pinned tabs drawn in pencil.",
    .symbol = @"pencil.and.scribble pencil",
    .tint = @"systemTealColor",
    .section = @"Sidebar",
    .requires = @"washiPaper",
    .rows = DPWashiArtHand,
    .classes = DPClasses(DPDiaTabList, DPTabListScroll),
    .install = DPInstallWashiHand,
    .apply = DPApplyWashiHand,
    .verify = DPVerifyWashiHand,
};
