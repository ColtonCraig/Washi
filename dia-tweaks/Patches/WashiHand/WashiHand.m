#import "StdPatch/StdPatch.h"
#import <CoreText/CoreText.h>
#import "Caveat.h"

// Washi Hand: the space's name in Washi's handwriting (Caveat) at the top of its tabs, between the favorites and the
// first tab, as Washi writes it at the top of the sidebar. Dia's tab list moves down to make the room, so nothing
// overlaps. The name is Dia's own (the part of the window title before ": "), and it fades over when it changes.

extern DPPatch DPWashiHand, DPWashiNote;
NSColor *DPWashiPaperColor(BOOL dark);   // WashiPaper.m
#define DPTabListScroll "_TtC7TabListP33_9A67AB465A78F9E1122D59704CA866E621SpacePagingScrollView"
static const CGFloat DPHandRoom = 30;   // the strip the name takes
static char DPHandKey, DPHandWatchKey, DPHandMovedKey, DPHandDiaKey, DPNoteKey;

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

// The tab list gives up a strip at its top for the name (Washi Handwriting) and one at its bottom for the note
// (Space Notes). Both are worked out here together, from where Dia put the list, so the two never fight over it.
@class DPWashiNoteView;
static DPWashiNoteView *DPNoteIn(NSView *list, NSRect room);   // below
static CGFloat DPNoteRoom(NSView *list);
static void DPNoteGone(NSView *list);

static void DPHandIn(NSView *list) {
    DPWashiHandLabel *label = DPGet(list, &DPHandKey);
    NSView *scroll = DPHandScroll(list);
    NSString *name = DPWashiHand.on ? DPSpaceName(list.window) : nil;
    // The frame this tweak last gave the tab list, and Dia's from before it. When the list still has ours, Dia hasn't
    // placed it since, so it isn't moved again; off, Dia's goes back.
    NSValue *moved = scroll ? DPGet(scroll, &DPHandMovedKey) : nil, *dia = scroll ? DPGet(scroll, &DPHandDiaKey) : nil;
    BOOL ours = moved && NSEqualRects(moved.rectValue, scroll.frame);
    NSRect frame = scroll ? (ours ? dia.rectValue : scroll.frame) : NSZeroRect;   // where Dia put it
    CGFloat top = name.length ? DPHandRoom : 0, bottom = scroll ? DPNoteRoom(list) : 0;
    if (scroll && NSHeight(frame) - top - bottom < 110) {   // a sidebar too short keeps its tabs: the note goes first, then the name
        bottom = 0;
        if (NSHeight(frame) - top < 110) top = 0;
    }
    if (!scroll || (!top && !bottom)) {
        if (label) { [label removeFromSuperview]; DPSet(list, &DPHandKey, nil); }
        DPNoteGone(list);
        if (ours && dia) scroll.frame = dia.rectValue;
        if (scroll) { DPSet(scroll, &DPHandMovedKey, nil); DPSet(scroll, &DPHandDiaKey, nil); }
        return;
    }
    NSRect mine = frame;
    mine.size.height -= top + bottom;
    if (list.isFlipped) mine.origin.y += top; else mine.origin.y += bottom;
    if (!NSEqualRects(mine, scroll.frame) && DPMayAdjust(scroll)) {
        DPSet(scroll, &DPHandDiaKey, [NSValue valueWithRect:frame]);
        DPSet(scroll, &DPHandMovedKey, [NSValue valueWithRect:mine]);
        scroll.frame = mine;
    }
    DPHandWatch(list.window);
    // The note, at the bottom.
    if (bottom) DPNoteIn(list, NSMakeRect(NSMinX(frame), list.isFlipped ? NSMaxY(frame) - bottom : NSMinY(frame), NSWidth(frame), bottom));
    else DPNoteGone(list);
    // The name, at the top.
    if (!top) { if (label) { [label removeFromSuperview]; DPSet(list, &DPHandKey, nil); } return; }
    NSRect room = NSMakeRect(NSMinX(frame), list.isFlipped ? NSMinY(frame) : NSMaxY(frame) - DPHandRoom, NSWidth(frame), DPHandRoom);
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
}

#pragma mark Space Notes

// Space Notes: each space keeps a sticky note at the bottom of its tabs, like Washi's. Closed, it's a strip with
// "Note" in handwriting and its first line; click it and it opens into a ruled note you type in, saved as you go
// (per space, in Dia's own settings). Esc or the chevron closes it again.

static NSString *const DPNotesDefaultsKey = @"WashiSpaceNotes";
static const CGFloat DPNoteClosed = 36, DPNoteOpen = 168, DPNoteGap = 6;

static NSString *DPNoteText(NSString *space) {
    NSDictionary *all = [NSUserDefaults.standardUserDefaults dictionaryForKey:DPNotesDefaultsKey];
    id text = all[space ?: @""];
    return [text isKindOfClass:NSString.class] ? text : @"";
}

static void DPNoteSave(NSString *space, NSString *text) {
    NSMutableDictionary *all = [[NSUserDefaults.standardUserDefaults dictionaryForKey:DPNotesDefaultsKey] mutableCopy] ?: [NSMutableDictionary new];
    all[space ?: @""] = text.length > 20000 ? [text substringToIndex:20000] : text;
    [NSUserDefaults.standardUserDefaults setObject:all forKey:DPNotesDefaultsKey];
}

static BOOL DPNoteDark(NSView *view) {
    return [[view.effectiveAppearance bestMatchFromAppearancesWithNames:@[ NSAppearanceNameAqua, NSAppearanceNameDarkAqua ]] isEqual:NSAppearanceNameDarkAqua];
}

// Washi's note: its paper with a little of the sticky yellow in it (24% light, 9% dark), ruled every 20pt.
@interface DPWashiNoteText : NSTextView
@property (nonatomic, copy) void (^closeNote)(void);
@end
@implementation DPWashiNoteText
- (void)drawViewBackgroundInRect:(NSRect)rect {
    [super drawViewBackgroundInRect:rect];
    [[NSColor.labelColor colorWithAlphaComponent:.12] setFill];
    CGFloat inset = self.textContainerInset.height;
    for (CGFloat y = inset + 20; y < NSMaxY(rect) + 20; y += 20) {
        if (y < NSMinY(rect) - 1) continue;
        NSRectFill(NSMakeRect(NSMinX(self.bounds), y - 1, NSWidth(self.bounds), 1));
    }
}
- (void)cancelOperation:(id)sender { if (self.closeNote) self.closeNote(); }
@end

@interface DPWashiNoteView : NSView <NSTextViewDelegate>
@property (nonatomic) BOOL open;
@property (nonatomic, copy) NSString *space;
@property (nonatomic, weak) NSView *list;
@end
@implementation DPWashiNoteView {
    NSTextField *_title, *_preview;
    NSButton *_chevron;
    NSScrollView *_scroll;
    DPWashiNoteText *_text;
    NSTimer *_saving;
}
- (instancetype)initWithFrame:(NSRect)frame {
    if ((self = [super initWithFrame:frame])) {
        self.wantsLayer = YES;
        self.layer.cornerRadius = 8;
        self.layer.borderWidth = 1;
        self.layer.shadowOpacity = .14; self.layer.shadowRadius = 0; self.layer.shadowOffset = CGSizeMake(1, -1);
        _title = [NSTextField labelWithString:@"Note"];
        _title.font = DPCaveat(20); _title.textColor = NSColor.labelColor;
        _preview = [NSTextField labelWithString:@""];
        _preview.font = [NSFont systemFontOfSize:12 weight:NSFontWeightMedium];
        _preview.lineBreakMode = NSLineBreakByTruncatingTail; _preview.maximumNumberOfLines = 1;
        _chevron = [NSButton buttonWithImage:[NSImage imageWithSystemSymbolName:@"chevron.down" accessibilityDescription:@"Close the note"] target:self action:@selector(close)];
        _chevron.bordered = NO; _chevron.contentTintColor = NSColor.secondaryLabelColor; _chevron.toolTip = @"Close the note (esc)";
        _scroll = [NSScrollView new];
        _scroll.drawsBackground = NO; _scroll.hasVerticalScroller = YES; _scroll.autohidesScrollers = YES; _scroll.borderType = NSNoBorder;
        _text = [DPWashiNoteText new];
        _text.drawsBackground = NO; _text.richText = NO; _text.allowsUndo = YES; _text.delegate = self;
        _text.font = [NSFont systemFontOfSize:13 weight:NSFontWeightMedium]; _text.textColor = NSColor.labelColor;
        _text.textContainerInset = NSMakeSize(0, 0);
        _text.textContainer.lineFragmentPadding = 0;
        _text.verticallyResizable = YES; _text.horizontallyResizable = NO; _text.autoresizingMask = NSViewWidthSizable;
        _text.textContainer.widthTracksTextView = YES;
        NSMutableParagraphStyle *lines = [NSMutableParagraphStyle new];
        lines.minimumLineHeight = lines.maximumLineHeight = 20;
        _text.defaultParagraphStyle = lines;
        _text.typingAttributes = @{ NSFontAttributeName: _text.font, NSForegroundColorAttributeName: NSColor.labelColor, NSParagraphStyleAttributeName: lines, NSBaselineOffsetAttributeName: @3 };
        __weak DPWashiNoteView *weak = self;
        _text.closeNote = ^{ [weak close]; };
        _scroll.documentView = _text;
        for (NSView *v in @[ _title, _preview, _chevron, _scroll ]) [self addSubview:v];
        [self paint];
    }
    return self;
}
- (BOOL)isFlipped { return YES; }
- (void)paint {
    BOOL dark = DPNoteDark(self);
    NSColor *paper = [DPWashiPaperColor(dark) colorUsingColorSpace:NSColorSpace.sRGBColorSpace];
    NSColor *sticky = [NSColor colorWithSRGBRed:1 green:.847 blue:.302 alpha:1];   // Washi's --s2
    [CATransaction begin]; [CATransaction setDisableActions:YES];
    self.layer.backgroundColor = [paper blendedColorWithFraction:dark ? .09 : .24 ofColor:sticky].CGColor;
    self.layer.borderColor = (dark ? [NSColor colorWithWhite:1 alpha:.07] : [NSColor colorWithSRGBRed:43 / 255.0 green:33 / 255.0 blue:24 / 255.0 alpha:.08]).CGColor;
    self.layer.shadowColor = (dark ? NSColor.blackColor : [NSColor colorWithSRGBRed:43 / 255.0 green:33 / 255.0 blue:24 / 255.0 alpha:1]).CGColor;
    self.layer.shadowOpacity = dark ? .4 : .14;
    [CATransaction commit];
}
- (void)viewDidChangeEffectiveAppearance { [super viewDidChangeEffectiveAppearance]; [self paint]; }
- (void)showPreview {
    NSString *first = [[_text.string componentsSeparatedByCharactersInSet:NSCharacterSet.newlineCharacterSet] filteredArrayUsingPredicate:[NSPredicate predicateWithFormat:@"length > 0"]].firstObject;
    _preview.stringValue = first.length ? first : @"Jot something down";
    _preview.textColor = first.length ? NSColor.secondaryLabelColor : NSColor.tertiaryLabelColor;
}
- (void)setSpace:(NSString *)space {
    if ([_space isEqual:space]) return;
    [self saveNow];
    _space = [space copy];
    _text.string = DPNoteText(space);
    [self showPreview];
}
- (void)layout {
    [super layout];
    CGFloat w = NSWidth(self.bounds);
    self.layer.shadowPath = CGPathCreateWithRoundedRect(self.bounds, 8, 8, NULL);
    CFAutorelease(self.layer.shadowPath);
    _title.frame = NSMakeRect(11, 4, 44, 27);
    _preview.hidden = self.open; _chevron.hidden = !self.open; _scroll.hidden = !self.open;
    _preview.frame = NSMakeRect(58, 10, MAX(0, w - 58 - 11), 16);
    _chevron.frame = NSMakeRect(w - 30, 6, 22, 22);
    _scroll.frame = NSMakeRect(11, 34, MAX(0, w - 22), MAX(0, NSHeight(self.bounds) - 34 - 8));
    NSSize content = _scroll.contentSize;
    _text.minSize = NSMakeSize(content.width, content.height);
    _text.maxSize = NSMakeSize(content.width, CGFLOAT_MAX);
    _text.textContainer.containerSize = NSMakeSize(content.width, CGFLOAT_MAX);
    if (NSWidth(_text.frame) != content.width) _text.frame = NSMakeRect(0, 0, content.width, MAX(NSHeight(_text.frame), content.height));
}
- (void)mouseDown:(NSEvent *)event { if (!self.open) [self openNote]; else [super mouseDown:event]; }
- (void)resetCursorRects { if (!self.open) [self addCursorRect:self.bounds cursor:NSCursor.pointingHandCursor]; }
- (void)openNote {
    self.open = YES;
    self.list.needsLayout = YES;
    [self.list layoutSubtreeIfNeeded];
    [self.window makeFirstResponder:_text];
    [_text setSelectedRange:NSMakeRange(_text.string.length, 0)];
    if (!NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion) {
        CABasicAnimation *rise = [CABasicAnimation animationWithKeyPath:@"opacity"];
        rise.fromValue = @0; rise.toValue = @1; rise.duration = .2;
        [_scroll.layer addAnimation:rise forKey:@"washiOpen"];
    }
    [self.window invalidateCursorRectsForView:self];
}
- (void)close {
    [self saveNow];
    if (self.window.firstResponder == _text) [self.window makeFirstResponder:nil];
    self.open = NO;
    [self showPreview];
    self.list.needsLayout = YES;
    [self.window invalidateCursorRectsForView:self];
}
- (void)textDidChange:(NSNotification *)note {
    [_saving invalidate];
    __weak DPWashiNoteView *weak = self;
    _saving = [NSTimer scheduledTimerWithTimeInterval:.4 repeats:NO block:^(NSTimer *t) { [weak saveNow]; }];
}
- (void)saveNow {
    [_saving invalidate]; _saving = nil;
    if (_space) DPNoteSave(_space, _text.string);
}
- (void)viewWillMoveToWindow:(NSWindow *)window { if (!window) [self saveNow]; [super viewWillMoveToWindow:window]; }
@end

static CGFloat DPNoteRoom(NSView *list) {
    if (!DPWashiNote.on) return 0;
    DPWashiNoteView *note = DPGet(list, &DPNoteKey);
    return (note.open ? DPNoteOpen : DPNoteClosed) + DPNoteGap + 8;
}

static void DPNoteGone(NSView *list) {
    DPWashiNoteView *note = DPGet(list, &DPNoteKey);
    if (!note) return;
    [note saveNow];
    [note removeFromSuperview];
    DPSet(list, &DPNoteKey, nil);
}

static DPWashiNoteView *DPNoteIn(NSView *list, NSRect room) {
    DPWashiNoteView *note = DPGet(list, &DPNoteKey);
    if (!note) { note = [[DPWashiNoteView alloc] initWithFrame:NSZeroRect]; note.list = list; DPSet(list, &DPNoteKey, note); }
    if (note.superview != list) [list addSubview:note];
    note.space = DPSpaceName(list.window) ?: @"";
    // 8pt in from each side, the gap above it, 8pt below.
    CGFloat height = NSHeight(room) - DPNoteGap - 8;
    NSRect frame = NSMakeRect(NSMinX(room) + 8, list.isFlipped ? NSMinY(room) + DPNoteGap : NSMinY(room) + 8, NSWidth(room) - 16, height);
    if (!NSEqualRects(note.frame, frame)) note.frame = frame;
    return note;
}

static NSString *DPVerifyWashiNote(DPPatch *patch) {
    for (NSView *list in DPFindViews(DPDiaTabList)) {
        if (list.hiddenOrHasHiddenAncestor) continue;
        NSView *note = DPGet(list, &DPNoteKey);
        if (!patch->on) { if (note.superview) return @"note left on the sidebar"; continue; }
        if (!note.superview) continue;   // a sidebar too short for it
        NSView *scroll = DPHandScroll(list);
        if (scroll && NSIntersectsRect(note.frame, scroll.frame)) return @"note overlaps the tabs";
    }
    return nil;
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

DP_PATCH(DPWashiNote) {
    .key = @"washiNote",
    .order = 8,
    .title = @"Space Notes",
    .detail = @"A sticky note at the bottom of each space’s tabs, saved as you type, like Washi’s.",
    .symbol = @"note.text",
    .tint = @"systemYellowColor",
    .section = @"Washi",
    .classes = DPClasses(DPDiaTabList, DPTabListScroll),
    .install = DPInstallWashiHand,
    .apply = DPApplyWashiHand,
    .verify = DPVerifyWashiNote,
};
