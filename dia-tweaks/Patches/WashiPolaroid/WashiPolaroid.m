#import "StdPatch/StdPatch.h"
#import "Patches/WashiShared/WashiShared.h"
NSArray<NSView *> *DPWashiArtPolaroid(void);   // WashiLook.m

// Polaroid Peek: DiaTweaks' Peek (shift-click a link) shows its preview as a Washi polaroid: a frame of card paper
// round the page, deeper at the bottom with the site written on it in Washi's handwriting, and in Scrapbook a strip of
// tape holding it at the top. The frame takes no clicks: the page under it still scrolls and clicks as before.

extern DPPatch DPWashiPolaroid;
NSColor *DPWashiPaperColor(BOOL dark);   // WashiPaper.m
NSFont *DPCaveat(CGFloat size);          // WashiHand.m
static char DPPolaroidKey, DPPolaroidStickKey;
static const CGFloat DPPolaroidSide = 10, DPPolaroidBottom = 38;

@interface DPWashiPolaroidFrame : NSView
@property (nonatomic, copy) NSString *caption;
@end
@implementation DPWashiPolaroidFrame
- (BOOL)isFlipped { return YES; }
- (NSView *)hitTest:(NSPoint)point { return nil; }
- (void)viewDidChangeEffectiveAppearance { [super viewDidChangeEffectiveAppearance]; self.needsDisplay = YES; }
- (void)drawRect:(NSRect)dirty {
    BOOL dark = [[self.effectiveAppearance bestMatchFromAppearancesWithNames:@[ NSAppearanceNameAqua, NSAppearanceNameDarkAqua ]] isEqual:NSAppearanceNameDarkAqua];
    NSColor *paper = [DPWashiPaperColor(dark) colorUsingColorSpace:NSColorSpace.sRGBColorSpace];
    NSColor *card = [paper blendedColorWithFraction:dark ? .1 : .8 ofColor:NSColor.whiteColor];
    NSColor *ink = dark ? [NSColor colorWithSRGBRed:.95 green:.93 blue:.89 alpha:1] : [NSColor colorWithSRGBRed:43 / 255.0 green:33 / 255.0 blue:24 / 255.0 alpha:1];
    NSRect b = self.bounds, photo = NSMakeRect(DPPolaroidSide, DPPolaroidSide, NSWidth(b) - DPPolaroidSide * 2, NSHeight(b) - DPPolaroidSide - DPPolaroidBottom);
    NSBezierPath *frame = [NSBezierPath bezierPathWithRect:b];
    [frame appendBezierPathWithRoundedRect:photo xRadius:2 yRadius:2];
    frame.windingRule = NSWindingRuleEvenOdd;
    [card setFill]; [frame fill];
    // the photo's edge, pressed into the card
    [[ink colorWithAlphaComponent:.14] setStroke];
    NSBezierPath *edge = [NSBezierPath bezierPathWithRoundedRect:NSInsetRect(photo, -.5, -.5) xRadius:2 yRadius:2]; edge.lineWidth = 1; [edge stroke];
    NSMutableParagraphStyle *mid = [NSMutableParagraphStyle new]; mid.alignment = NSTextAlignmentCenter; mid.lineBreakMode = NSLineBreakByTruncatingTail;
    [self.caption ?: @"" drawInRect:NSMakeRect(24, NSMaxY(photo) + 4, NSWidth(b) - 48, DPPolaroidBottom - 6)
                     withAttributes:@{ NSFontAttributeName: DPCaveat(24), NSForegroundColorAttributeName: [ink colorWithAlphaComponent:.85], NSParagraphStyleAttributeName: mid }];
}
@end

// The site: the address Peek opened, without its www.
static NSString *DPPolaroidCaption(NSView *peek) {
    id page = nil;
    @try { page = [peek valueForKey:@"page"]; } @catch (NSException *e) { return @""; }
    id url = nil;
    @try { url = [page valueForKey:@"url"]; } @catch (NSException *e) {}
    NSString *host = [url isKindOfClass:NSURL.class] ? [(NSURL *)url host] : nil;
    if ([host hasPrefix:@"www."]) host = [host substringFromIndex:4];
    return host ?: @"";
}

static void DPPolaroidIn(NSView *peek) {
    NSView *clip = nil;
    @try { clip = [peek valueForKey:@"clip"]; } @catch (NSException *e) { return; }
    if (![clip isKindOfClass:NSView.class]) return;
    DPWashiPolaroidFrame *frame = DPGet(clip, &DPPolaroidKey);
    if (!DPWashiLive(&DPWashiPolaroid)) {
        [frame removeFromSuperview]; DPSet(clip, &DPPolaroidKey, nil);
        DPWashiStick(clip.superview, &DPPolaroidStickKey, NO, CGSizeZero, NSZeroPoint, 0);
        return;
    }
    if (!frame) { frame = [[DPWashiPolaroidFrame alloc] initWithFrame:clip.bounds]; frame.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable; DPSet(clip, &DPPolaroidKey, frame); }
    if (clip.subviews.lastObject != frame) [clip addSubview:frame positioned:NSWindowAbove relativeTo:nil];
    if (!NSEqualRects(frame.frame, clip.bounds)) frame.frame = clip.bounds;
    NSString *caption = DPPolaroidCaption(peek);
    if (![frame.caption isEqual:caption]) { frame.caption = caption; frame.needsDisplay = YES; }
    // Scrapbook: taped on across the top.
    NSView *card = clip.superview;
    NSRect at = clip.frame;
    CGFloat top = card.isFlipped ? NSMinY(at) + .5 : NSMaxY(at) - .5;
    DPWashiStick(card, &DPPolaroidStickKey, DPWashiScrap(), CGSizeMake(64, 18), NSMakePoint(NSMidX(at), top), -3);
}

static void DPPolaroid_layout(NSView *self, SEL _cmd) {
    DPCallOriginal(DPPolaroid_layout, self);
    DPPolaroidIn(self);
}

static void DPInstallWashiPolaroid(void) {
    DPHook("DPPeekCard", @selector(layout), (IMP)DPPolaroid_layout);
}

static void DPApplyWashiPolaroid(DPPatch *patch) {
    for (NSView *peek in DPFindViews("DPPeekCard")) DPPolaroidIn(peek);
}

DP_PATCH(DPWashiPolaroid) {
    .key = @"washiPolaroid",
    .order = 14,
    .title = @"Polaroid Peek",
    .detail = @"Peek’s preview (shift-click a link, with Peek on Shift-Click on) as a Washi polaroid: a card frame with the site written along the bottom.",
    .symbol = @"photo.fill photo",
    .tint = @"systemOrangeColor",
    .section = @"Window",
    .requires = @"washiPaper",
    .rows = DPWashiArtPolaroid,
    .install = DPInstallWashiPolaroid,
    .apply = DPApplyWashiPolaroid,
};
