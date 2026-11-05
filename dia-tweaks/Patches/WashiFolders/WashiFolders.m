#import "StdPatch/StdPatch.h"
#import "Patches/WashiShared/WashiShared.h"
NSArray<NSView *> *DPWashiArtFolders(void);   // WashiLook.m

// Folder Icons: a Dia folder you haven't given an icon gets one from its name, or else from the tabs in it, like
// Washi's ("MDM", "Okta" → tools; "Budget" → money; a folder of GitHub tabs → code), drawn in your space's tape. The
// folder itself becomes a card of Washi's paper. An icon you pick in Dia always stays yours.

extern DPPatch DPWashiFolders, DPWashiScrapbook;
NSView *DPWashiCardSheet(NSRect frame, CGFloat radius);   // WashiBars.m
NSView *DPWashiCutShadow(CGFloat lift, CGFloat radius);   // WashiCards.m
uint32_t DPWashiTapeRGBFor(NSWindow *window);            // WashiTape.m
#define DPTabGroup "_TtC5TabUI16TabGroupCellView"
#define DPTabTitleLabel "_TtC5ARCUI24FeatheredTruncatingLabel"
static char DPFolderIconKey, DPFolderDiaAlphaKey, DPFolderManilaKey, DPFolderLineKey, DPFolderBoxAlphaKey, DPFolderChevronKey;

// Washi's words, in Washi's order: the name says most, and its first word most of all. Each with its SF Symbol.
static NSArray<NSArray *> *DPFolderWords(void) {
    static NSArray *words;
    if (words) return words;
    NSArray *raw = @[
        @[ @"wrench.and.screwdriver", @"admin|console|mdm|tools?|it|okta|jamf|kandji|iru|hexnode|intune|maas360|addigy|mosyle|devices?|help ?desk|support|tickets?|servicenow|zendesk|freshservice" ],
        @[ @"chevron.left.forwardslash.chevron.right", @"code|dev|developer|github|gitlab|git|bitbucket|repos?|engineering|api|stack ?overflow|vercel|netlify|aws|cloudflare" ],
        @[ @"book", @"docs?|drive|notes?|wiki|confluence|notion|reading|read|books?|learn|learning|school|study|courses?|articles?|research" ],
        @[ @"chart.bar", @"data|dashboards?|analytics|reports?|metrics|numbers|sheets?|stats|kpis?|datadog|grafana|looker|tableau" ],
        @[ @"banknote", @"money|bank|banking|finance|budget|expenses?|bills?|tax|taxes|invoices?|payroll|rippling|gusto|shopping|shop|amazon|crypto" ],
        @[ @"calendar", @"calendar|plans?|planning|meetings?|schedule|events?|agenda|todo|to-do|tasks?|projects?|jira|asana|linear|trello" ],
        @[ @"airplane", @"travel|trips?|flights?|hotels?|vacation|holiday|airbnb|booking|maps?" ],
        @[ @"music.note", @"music|songs?|spotify|playlists?|podcasts?|soundcloud|bandcamp|vinyl|records?" ],
        @[ @"camera", @"photos?|pictures?|video|videos|youtube|vimeo|netflix|watch|movies?|tv|camera" ],
        @[ @"gamecontroller", @"games?|gaming|steam|twitch|play|xbox|playstation|nintendo" ],
        @[ @"paintpalette", @"design|art|figma|dribbble|behance|inspo|inspiration|ideas board|canva|fonts?" ],
        @[ @"newspaper", @"news|feeds?|rss|headlines|reddit|blogs?|newsletters?|press" ],
        @[ @"house", @"home|house|family|kids|personal|life|chores|recipes?|cooking" ],
        @[ @"briefcase", @"work|job|jobs|office|company|team|clients?|hr|careers?|hudl|slack|zoom|teams" ],
        @[ @"lightbulb", @"ideas?|brainstorm|someday|inbox|later|misc" ],
        @[ @"heart", @"favou?rites?|faves?|loved?|health|fitness|gym|wellness" ],
        @[ @"cloud", @"cloud|storage|backups?|dropbox|icloud|onedrive|box" ],
        @[ @"leaf", @"garden|plants?|growing|grow|habits?" ],
        @[ @"magnifyingglass", @"search|find|lookups?|references?" ],
    ];
    NSMutableArray *built = [NSMutableArray new];
    for (NSArray *w in raw)
        [built addObject:@[ w[0], [NSRegularExpression regularExpressionWithPattern:[NSString stringWithFormat:@"\\b(%@)\\b", w[1]] options:NSRegularExpressionCaseInsensitive error:nil] ]];
    return words = built;
}

static NSString *DPFolderGuess(NSString *name, NSArray<NSString *> *tabs);
static NSString *DPFolderIconFor(NSString *name, NSArray<NSString *> *tabs) {   // remembered: folders lay out often
    static NSCache *guesses;
    if (!guesses) guesses = [NSCache new];
    NSString *key = [[@[ name ?: @"" ] arrayByAddingObjectsFromArray:tabs] componentsJoinedByString:@"\n"];
    id hit = [guesses objectForKey:key];
    if (hit) return hit == NSNull.null ? nil : hit;
    NSString *guess = DPFolderGuess(name, tabs);
    [guesses setObject:guess ?: (id)NSNull.null forKey:key];
    return guess;
}
static NSString *DPFolderGuess(NSString *name, NSArray<NSString *> *tabs) {
    NSString *pick = nil; NSUInteger at = NSNotFound;
    for (NSArray *w in DPFolderWords()) {
        NSRange r = [w[1] rangeOfFirstMatchInString:name ?: @"" options:0 range:NSMakeRange(0, name.length)];
        if (r.location != NSNotFound && r.location < at) { pick = w[0]; at = r.location; }
    }
    if (pick) return pick;
    // Else what most of its tabs are about, if that's at least a third of them.
    NSMutableDictionary<NSString *, NSNumber *> *votes = [NSMutableDictionary new];
    for (NSString *tab in tabs)
        for (NSArray *w in DPFolderWords())
            if ([w[1] firstMatchInString:tab options:0 range:NSMakeRange(0, tab.length)]) { votes[w[0]] = @(votes[w[0]].integerValue + 1); break; }
    NSString *best = nil; NSInteger most = 0;
    for (NSString *k in votes) if (votes[k].integerValue > most) { most = votes[k].integerValue; best = k; }
    return best && most >= MAX(1, (NSInteger)ceil(tabs.count / 3.0)) ? best : nil;
}

static NSView *DPFirstOf(NSView *root, const char *kind) { return DPFindView(root, ^BOOL(NSView *v) { return v != root && DPIsKind(v, kind); }); }

// The folder's tabs: the tab cells that sit inside its frame in the list.
static NSArray<NSString *> *DPFolderTabs(NSView *group) {
    NSView *cell = group.superview, *collection = cell.superview;
    NSMutableArray *titles = [NSMutableArray new];
    for (NSView *other in collection.subviews) {
        if (other == cell || NSMinY(other.frame) < NSMinY(cell.frame) + 30 || NSMaxY(other.frame) > NSMaxY(cell.frame) + 1) continue;
        NSView *tab = DPFirstOf(other, DPDiaTabView);
        NSTextField *title = (NSTextField *)DPFirstOf(tab, DPTabTitleLabel);
        if ([title isKindOfClass:NSTextField.class] && title.stringValue.length) [titles addObject:title.stringValue];
    }
    return titles;
}

// Washi's folders are manila file folders: a header in folder paper (Dia's folder color mixed into light paper, or
// plain manila), a little tab on its top-left edge, dark ink on it even in dark mode, and the tabs inside hanging off
// a thin line. Dia's own box round the folder goes see-through while it shows.
static NSColor *DPManilaInk(void) { return [NSColor colorWithSRGBRed:43 / 255.0 green:33 / 255.0 blue:24 / 255.0 alpha:1]; }
static NSColor *DPHex(uint32_t rgb) { return [NSColor colorWithSRGBRed:((rgb >> 16) & 255) / 255.0 green:((rgb >> 8) & 255) / 255.0 blue:(rgb & 255) / 255.0 alpha:1]; }

@interface DPWashiManila : NSView
@property (nonatomic, strong) NSColor *tint;   // Dia's folder color, or nil for manila
@property (nonatomic, copy) NSString *title;   // the folder's name, written where Dia's was
@property (nonatomic, strong) NSFont *font;
@property (nonatomic) NSRect titleFrame;
@end
@implementation DPWashiManila
- (BOOL)isFlipped { return YES; }
- (NSView *)hitTest:(NSPoint)point { return nil; }
- (NSColor *)paper {
    return self.tint ? [[DPHex(0xfdf8ec) colorUsingColorSpace:NSColorSpace.sRGBColorSpace] blendedColorWithFraction:.3 ofColor:[self.tint colorUsingColorSpace:NSColorSpace.sRGBColorSpace]] : DPHex(0xf2d58f);
}
- (void)drawRect:(NSRect)dirty {
    CGFloat w = NSWidth(self.bounds), h = NSHeight(self.bounds), top = 5;
    NSBezierPath *folder = [NSBezierPath bezierPath];
    // the tab: 38 wide, 7 tall, rounded 5 and 7 at its top
    [folder moveToPoint:NSMakePoint(0, top + 3)];
    [folder lineToPoint:NSMakePoint(0, 5)];
    [folder appendBezierPathWithArcFromPoint:NSMakePoint(0, 0) toPoint:NSMakePoint(5, 0) radius:5];
    [folder lineToPoint:NSMakePoint(31, 0)];
    [folder appendBezierPathWithArcFromPoint:NSMakePoint(38, 0) toPoint:NSMakePoint(38, top) radius:7];
    // the folder: corners 3, 9, 8, 8 like Washi's
    [folder lineToPoint:NSMakePoint(w - 9, top)];
    [folder appendBezierPathWithArcFromPoint:NSMakePoint(w, top) toPoint:NSMakePoint(w, top + 9) radius:9];
    [folder appendBezierPathWithArcFromPoint:NSMakePoint(w, h - 1) toPoint:NSMakePoint(w - 8, h - 1) radius:8];
    [folder appendBezierPathWithArcFromPoint:NSMakePoint(0, h - 1) toPoint:NSMakePoint(0, h - 9) radius:8];
    [folder closePath];
    NSAffineTransform *down = [NSAffineTransform transform]; [down translateXBy:0 yBy:1];
    NSBezierPath *shadow = [folder copy]; [shadow transformUsingAffineTransform:down];
    [(self.tint ? [self.tint colorWithAlphaComponent:.4] : [NSColor colorWithWhite:0 alpha:.08]) setFill]; [shadow fill];
    [self.paper setFill]; [folder fill];
    NSMutableParagraphStyle *tail = [NSMutableParagraphStyle new]; tail.lineBreakMode = NSLineBreakByTruncatingTail;
    [self.title ?: @"" drawInRect:self.titleFrame withAttributes:@{ NSFontAttributeName: self.font ?: [NSFont systemFontOfSize:13 weight:NSFontWeightSemibold], NSForegroundColorAttributeName: DPManilaInk(), NSParagraphStyleAttributeName: tail }];
}
@end

// The line the folder's tabs hang from: 2pt, the ink at .14 (or the folder's color).
@interface DPWashiFolderLine : NSView
@property (nonatomic, strong) NSColor *tint;
@end
@implementation DPWashiFolderLine
- (NSView *)hitTest:(NSPoint)point { return nil; }
- (void)drawRect:(NSRect)dirty {
    [(self.tint ? [self.tint colorWithAlphaComponent:.45] : [NSColor.labelColor colorWithAlphaComponent:.14]) setFill];
    [[NSBezierPath bezierPathWithRoundedRect:self.bounds xRadius:1 yRadius:1] fill];
}
- (void)viewDidChangeEffectiveAppearance { [super viewDidChangeEffectiveAppearance]; self.needsDisplay = YES; }
@end

// Dia's color for the folder: what its name is drawn in, unless that's just the ordinary text color.
// Dia's color for the folder: what it draws the name in, unless that's just the ordinary text color. Read in the
// folder's own light or dark, and never changed: Washi writes the name itself (in dark ink) and Dia's stays hidden.
static NSColor *DPFolderColor(NSTextField *name) {
    NSColor *dia = nil;
    NSAttributedString *text = name.attributedStringValue;
    if (text.length) dia = [text attribute:NSForegroundColorAttributeName atIndex:0 effectiveRange:NULL];
    if (!dia) dia = name.textColor;
    if (!dia || [dia isEqual:NSColor.labelColor] || [dia isEqual:NSColor.controlTextColor] || [dia isEqual:NSColor.textColor] || [dia isEqual:NSColor.secondaryLabelColor]) return nil;
    __block NSColor *rgb = nil;
    [name.effectiveAppearance performAsCurrentDrawingAppearance:^{ rgb = [dia colorUsingColorSpace:NSColorSpace.sRGBColorSpace]; }];
    CGFloat sat = rgb ? MAX(rgb.redComponent, MAX(rgb.greenComponent, rgb.blueComponent)) - MIN(rgb.redComponent, MIN(rgb.greenComponent, rgb.blueComponent)) : 0;
    return sat > .12 ? rgb : nil;   // a grey is no color
}

static void DPFolderIn(NSView *group) {
    BOOL on = DPWashiLive(&DPWashiFolders);
    // The icon: Dia's default (its "Album") is swapped; any other icon is one you chose.
    NSImageView *dia = (NSImageView *)DPFindView(group, ^BOOL(NSView *v) { return [v isKindOfClass:NSImageView.class] && [v.accessibilityLabel isEqual:@"Album"]; });
    NSImageView *mine = DPGet(group, &DPFolderIconKey);
    NSTextField *name = (NSTextField *)DPFirstOf(group, DPTabTitleLabel);
    NSString *symbol = on && dia && !dia.hidden ? DPFolderIconFor([name isKindOfClass:NSTextField.class] ? name.stringValue : @"", DPFolderTabs(group)) : nil;
    if (!symbol) {
        [mine removeFromSuperview]; DPSet(group, &DPFolderIconKey, nil);
        NSNumber *alpha = DPGet(group, &DPFolderDiaAlphaKey);
        if (alpha && dia) { dia.alphaValue = alpha.doubleValue; DPSet(group, &DPFolderDiaAlphaKey, nil); }
    } else {
        if (!mine) { mine = [NSImageView new]; mine.imageScaling = NSImageScaleProportionallyDown; DPSet(group, &DPFolderIconKey, mine); }
        if (mine.superview != dia.superview) [dia.superview addSubview:mine positioned:NSWindowAbove relativeTo:dia];
        if (!NSEqualRects(mine.frame, dia.frame)) mine.frame = dia.frame;
        if (![mine.identifier isEqual:symbol]) {
            NSImageSymbolConfiguration *config = [NSImageSymbolConfiguration configurationWithPointSize:13 weight:NSFontWeightSemibold];
            mine.image = [[NSImage imageWithSystemSymbolName:symbol accessibilityDescription:nil] imageWithSymbolConfiguration:config];
            mine.identifier = symbol;
        }
        NSColor *fc = DPFolderColor(name);   // Washi's .fi: the folder's color, darkened, or manila's brown
        mine.contentTintColor = fc ? [fc blendedColorWithFraction:.2 ofColor:NSColor.blackColor] : DPHex(0x9a6b12);
        // In Scrapbook it's a sticker: tilted 7° and lifted off the paper, like Washi's folder icons.
        mine.wantsLayer = YES;
        BOOL sticker = DPWashiLive(&DPWashiScrapbook);
        CGFloat cx = NSWidth(mine.bounds) / 2, cy = NSHeight(mine.bounds) / 2;
        CGAffineTransform lean = CGAffineTransformTranslate(CGAffineTransformRotate(CGAffineTransformMakeTranslation(cx, cy), (sticker ? (mine.isFlipped ? -7 : 7) : 0) * M_PI / 180), -cx, -cy);
        [CATransaction begin]; [CATransaction setDisableActions:YES];
        mine.layer.affineTransform = lean;
        mine.layer.shadowOpacity = sticker ? .25 : 0; mine.layer.shadowRadius = 1; mine.layer.shadowOffset = CGSizeMake(0, -1);
        [CATransaction commit];
        if (!DPGet(group, &DPFolderDiaAlphaKey)) DPSet(group, &DPFolderDiaAlphaKey, @(dia.alphaValue));
        dia.alphaValue = 0;
    }
    // The folder: manila, its header in folder paper and its tabs on a line.
    NSView *box = nil, *header = nil;
    for (NSView *sub in group.subviews) {
        if (sub.layer.cornerRadius > 0 && NSHeight(sub.frame) > 30 && !sub.subviews.count) box = sub;
        else if (!header && [name isDescendantOf:sub]) header = sub;
    }
    DPWashiManila *manila = DPGet(group, &DPFolderManilaKey);
    DPWashiFolderLine *line = DPGet(group, &DPFolderLineKey);
    NSImageView *chevron = (NSImageView *)DPFindView(header, ^BOOL(NSView *v) { return [v isKindOfClass:NSImageView.class] && [v.accessibilityLabel isEqual:@"go down"]; });
    if (!on || !header) {
        [manila removeFromSuperview]; [line removeFromSuperview];
        DPSet(group, &DPFolderManilaKey, nil); DPSet(group, &DPFolderLineKey, nil);
        NSNumber *alpha = DPGet(group, &DPFolderBoxAlphaKey);
        if (box && alpha) { box.alphaValue = alpha.doubleValue; DPSet(group, &DPFolderBoxAlphaKey, nil); }
        if (name.alphaValue == 0) name.alphaValue = 1;
        NSColor *chev = DPGet(group, &DPFolderChevronKey);
        if (chevron && chev) { chevron.contentTintColor = chev == (id)NSNull.null ? nil : chev; DPSet(group, &DPFolderChevronKey, nil); }
        return;
    }
    NSColor *fc = [name isKindOfClass:NSTextField.class] ? DPFolderColor(name) : nil;
    if (box) { if (!DPGet(group, &DPFolderBoxAlphaKey)) DPSet(group, &DPFolderBoxAlphaKey, @(box.alphaValue)); box.alphaValue = 0; }
    if (!manila) { manila = [DPWashiManila new]; DPSet(group, &DPFolderManilaKey, manila); }
    if (manila.superview != group) [group addSubview:manila positioned:NSWindowBelow relativeTo:header];
    if (!NSEqualRects(manila.frame, header.frame)) manila.frame = header.frame;
    if (manila.tint != fc && ![manila.tint isEqual:fc]) { manila.tint = fc; manila.needsDisplay = YES; }
    // The name in dark ink on the folder paper, light and dark alike: Washi writes it, over where Dia's sits.
    if ([name isKindOfClass:NSTextField.class]) {
        NSRect tf = [manila convertRect:name.bounds fromView:name];
        tf.size.width += 1;   // Dia's label fits its text exactly; the chevron sits right after it
        if (![manila.title isEqual:name.stringValue] || ![manila.font isEqual:name.font] || !NSEqualRects(manila.titleFrame, tf)) {
            manila.title = name.stringValue; manila.font = name.font; manila.titleFrame = tf; manila.needsDisplay = YES;
        }
        if (name.alphaValue != 0) name.alphaValue = 0;
    }
    if (chevron) {
        if (!DPGet(group, &DPFolderChevronKey)) DPSet(group, &DPFolderChevronKey, chevron.contentTintColor ?: (id)NSNull.null);
        chevron.contentTintColor = [DPManilaInk() colorWithAlphaComponent:.5];
    }
    // The line: 10pt in from the folder's edge, from just under its header to just above its end.
    CGFloat top = group.isFlipped ? NSMaxY(header.frame) + 3 : 6, bottom = group.isFlipped ? NSHeight(group.bounds) - 6 : NSMinY(header.frame) - 3;
    if (!line) { line = [DPWashiFolderLine new]; DPSet(group, &DPFolderLineKey, line); }
    if (line.superview != group) [group addSubview:line positioned:NSWindowBelow relativeTo:header];
    NSRect lf = NSMakeRect(NSMinX(header.frame) + 10, top, 2, MAX(0, bottom - top));
    line.hidden = NSHeight(lf) < 12;   // a closed folder has no tabs showing
    if (!NSEqualRects(line.frame, lf)) line.frame = lf;
    if (line.tint != fc && ![line.tint isEqual:fc]) { line.tint = fc; line.needsDisplay = YES; }
}

static void DPFolder_layout(NSView *self, SEL _cmd) {
    DPCallOriginal(DPFolder_layout, self);
    DPFolderIn(self);
}

static void DPInstallWashiFolders(void) {
    DPHook(DPTabGroup, @selector(layout), (IMP)DPFolder_layout);
}

static void DPApplyWashiFolders(DPPatch *patch) {
    for (NSView *group in DPFindViews(DPTabGroup)) DPFolderIn(group);
}

static NSString *DPVerifyWashiFolders(DPPatch *patch) {
    for (NSView *group in DPFindViews(DPTabGroup)) {
        if (group.hiddenOrHasHiddenAncestor) continue;
        BOOL manila = [DPGet(group, &DPFolderManilaKey) superview] != nil;
        if (manila != DPWashiLive(patch)) return DPWashiLive(patch) ? @"a folder isn't manila" : @"manila left on a folder";
    }
    return nil;
}

DP_PATCH(DPWashiFolders) {
    .key = @"washiFolders",
    .defaultOn = YES,
    .order = 9,
    .title = @"Folders",
    .detail = @"Folders as Washi’s manila file folders, in Dia’s folder color, with their tabs on a line. Ones you haven’t given an icon get one from their name or tabs: MDM gets tools, Budget money, GitHub tabs code. Yours always stays.",
    .symbol = @"folder.fill folder",
    .tint = @"systemBlueColor",
    .section = @"Sidebar",
    .requires = @"washiPaper",
    .rows = DPWashiArtFolders,
    .classes = DPClasses(DPTabGroup),
    .install = DPInstallWashiFolders,
    .apply = DPApplyWashiFolders,
    .verify = DPVerifyWashiFolders,
};
