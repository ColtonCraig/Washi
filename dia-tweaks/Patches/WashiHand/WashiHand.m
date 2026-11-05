#import "StdPatch/StdPatch.h"
#import <CoreText/CoreText.h>
#import "Caveat.h"

// Washi Hand: the space's name in Washi's handwriting (Caveat) at the top of its tabs, between the favorites and the
// first tab, as Washi writes it at the top of the sidebar. Dia's tab list moves down to make the room, so nothing
// overlaps. The name is Dia's own (the part of the window title before ": "), and it fades over when it changes.

extern DPPatch DPWashiHand;
#define DPTabListScroll "_TtC7TabListP33_9A67AB465A78F9E1122D59704CA866E621SpacePagingScrollView"
static const CGFloat DPHandRoom = 30;   // the strip the name takes
static char DPHandKey, DPHandWatchKey, DPHandMovedKey, DPHandDiaKey;

static NSFont *DPCaveat(CGFloat size) {
    static CGFontRef font;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        CFDataRef data = CFDataCreateWithBytesNoCopy(NULL, DPCaveat, sizeof DPCaveat, kCFAllocatorNull);
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
    NSString *name = DPWashiHand.on ? DPSpaceName(list.window) : nil;
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
        if (label.stringValue.length && !NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion) {
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

static void DPHandList_layout(NSView *self, SEL _cmd) {
    DPCallOriginal(DPHandList_layout, self);
    DPHandIn(self);
}

static void DPInstallWashiHand(void) {
    DPHook(DPDiaTabList, @selector(layout), (IMP)DPHandList_layout);
}

static void DPApplyWashiHand(DPPatch *patch) {
    for (NSView *list in DPFindViews(DPDiaTabList)) { DPHandIn(list); list.needsLayout = YES; }
}

static NSString *DPVerifyWashiHand(DPPatch *patch) {
    for (NSView *list in DPFindViews(DPDiaTabList)) {
        if (list.hiddenOrHasHiddenAncestor) continue;
        NSTextField *label = DPGet(list, &DPHandKey);
        NSString *name = DPSpaceName(list.window);
        if (!patch->on) { if (label.superview) return @"name left on the sidebar"; continue; }
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
    .detail = @"The space’s name in Washi’s handwriting at the top of its tabs.",
    .symbol = @"pencil.and.scribble pencil",
    .tint = @"systemTealColor",
    .section = @"Washi",
    .classes = DPClasses(DPDiaTabList, DPTabListScroll),
    .install = DPInstallWashiHand,
    .apply = DPApplyWashiHand,
    .verify = DPVerifyWashiHand,
};
