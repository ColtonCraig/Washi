#import "StdPatch/StdPatch.h"
#import "Patches/WashiShared/WashiShared.h"
#import <CoreText/CoreText.h>
#import "Figtree.h"
NSArray<NSView *> *DPWashiArtType(void);   // WashiLook.m

// Washi Lettering: Washi's own letters, Figtree, for what you read in Dia's sidebar, toolbar and bookmarks bar: tab
// and folder names, the page's name in the toolbar, bookmarks. Same sizes as Dia's, at Washi's weights (Figtree's
// Medium for plain text, SemiBold and Bold for the rest). Washi's other pieces in Dia use it too. Off, Dia's
// letters come back.

extern DPPatch DPWashiType;
#define DPTabLabel "_TtC5ARCUI24FeatheredTruncatingLabel"
#define DPBarLabel "_TtC5ARCUI18NoHitTestTextField"
#define DPBookmark "_TtC11BookmarkBar23BookmarkItemContentView"
static char DPDiaFontKey;

static CGFontRef DPFigtreeCG(NSFontWeight weight) {
    static CGFontRef fonts[3];
    int i = weight >= NSFontWeightBold ? 2 : weight >= NSFontWeightSemibold - .05 ? 1 : 0;
    if (!fonts[i]) {
        const unsigned char *bytes = i == 2 ? DPFigtreeBold : i == 1 ? DPFigtreeSemiBold : DPFigtreeMedium;
        size_t length = i == 2 ? sizeof DPFigtreeBold : i == 1 ? sizeof DPFigtreeSemiBold : sizeof DPFigtreeMedium;
        CFDataRef data = CFDataCreateWithBytesNoCopy(NULL, bytes, length, kCFAllocatorNull);
        CGDataProviderRef provider = CGDataProviderCreateWithCFData(data);
        fonts[i] = CGFontCreateWithDataProvider(provider);
        CGDataProviderRelease(provider); CFRelease(data);
    }
    return fonts[i];
}

// Figtree at this size and weight, always (Washi's Settings page uses it whether or not the switch is on).
NSFont *DPWashiFigtree(CGFloat size, NSFontWeight weight) {
    CGFontRef cg = DPFigtreeCG(weight);
    if (!cg) return [NSFont systemFontOfSize:size weight:weight];
    return (__bridge_transfer NSFont *)CTFontCreateWithGraphicsFont(cg, size, NULL, NULL);
}

// What Washi's pieces in Dia write in: Figtree while Washi Lettering is on, Dia's system letters otherwise.
NSFont *DPWashiUIFont(CGFloat size, NSFontWeight weight) {
    return DPWashiLive(&DPWashiType) ? DPWashiFigtree(size, weight) : [NSFont systemFontOfSize:size weight:weight];
}

static BOOL DPIsFigtree(NSFont *font) { return [font.familyName hasPrefix:@"Figtree"] || [font.fontName hasPrefix:@"Figtree"]; }

static NSFontWeight DPWeightOf(NSFont *font) {
    NSDictionary *traits = [font.fontDescriptor objectForKey:NSFontTraitsAttribute];
    return [traits[NSFontWeightTrait] doubleValue];
}

// Dia's font for a label, swapped for Figtree's at the same size and weight (Dia's own is kept to go back to).
static NSFont *DPLettering(NSView *label, NSFont *dia) {
    if (!dia) return dia;
    if (!DPIsFigtree(dia)) DPSet(label, &DPDiaFontKey, dia);
    if (!DPWashiLive(&DPWashiType)) return DPGet(label, &DPDiaFontKey) ?: dia;
    NSFont *base = DPGet(label, &DPDiaFontKey) ?: dia;
    BOOL system = [base.fontName hasPrefix:@"."] || [base.familyName isEqual:[NSFont systemFontOfSize:12].familyName];
    if (!system) return dia;   // a font Dia chose on purpose (a monospace address…) stays
    return DPWashiFigtree(base.pointSize, DPWeightOf(base));
}

static void DPType_setFont(NSTextField *self, SEL _cmd, NSFont *font) {
    DPCallOriginal(DPType_setFont, self, DPLettering(self, font));
}

static void DPRetype(NSTextField *label) {
    NSFont *dia = DPGet(label, &DPDiaFontKey) ?: label.font;
    if (dia) label.font = dia;   // through the hook: Figtree or Dia's, as the switch says
}

static void DPBookmark_layout(NSView *self, SEL _cmd) {
    DPCallOriginal(DPBookmark_layout, self);
    DPFindView(self, ^BOOL(NSView *v) {
        if ([v isKindOfClass:NSTextField.class]) {
            NSTextField *t = (NSTextField *)v;
            NSFont *want = DPLettering(t, DPGet(t, &DPDiaFontKey) ?: t.font);
            if (![t.font isEqual:want]) t.font = want;
        }
        return NO;
    });
}

static void DPInstallWashiType(void) {
    DPHook(DPTabLabel, @selector(setFont:), (IMP)DPType_setFont);
    DPHook(DPBarLabel, @selector(setFont:), (IMP)DPType_setFont);
    DPHook(DPBookmark, @selector(layout), (IMP)DPBookmark_layout);
}

static void DPApplyWashiType(DPPatch *patch) {
    for (NSView *v in [DPFindViews(DPTabLabel) arrayByAddingObjectsFromArray:DPFindViews(DPBarLabel)])
        if ([v isKindOfClass:NSTextField.class]) DPRetype((NSTextField *)v);
    for (NSView *b in DPFindViews(DPBookmark)) b.needsLayout = YES;
    extern void DPWashiRefreshAll(DPPatch *from);
    DPWashiRefreshAll(patch);   // Washi's own pieces (folder names, the ticket, New Tab…) take the letters too
}

static NSString *DPVerifyWashiType(DPPatch *patch) {
    for (NSView *v in DPFindViews(DPTabLabel)) {
        if (![v isKindOfClass:NSTextField.class] || v.hiddenOrHasHiddenAncestor) continue;
        BOOL fig = DPIsFigtree(((NSTextField *)v).font);
        if (fig != DPWashiLive(patch)) return DPWashiLive(patch) ? @"a tab name isn't in Figtree" : @"Figtree left on a tab name";
    }
    return nil;
}

DP_PATCH(DPWashiType) {
    .key = @"washiType",
    .defaultOn = YES,
    .order = 4,
    .title = @"Washi Lettering",
    .detail = @"Washi’s own letters, Figtree, for tab and folder names, the toolbar and bookmarks, at Dia’s sizes.",
    .symbol = @"textformat",
    .tint = @"systemBrownColor",
    .section = @"Window",
    .requires = @"washiPaper",
    .rows = DPWashiArtType,
    .classes = DPClasses(DPTabLabel),
    .install = DPInstallWashiType,
    .apply = DPApplyWashiType,
    .verify = DPVerifyWashiType,
};
