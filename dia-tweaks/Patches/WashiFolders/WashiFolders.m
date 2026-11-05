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
static char DPFolderIconKey, DPFolderDiaAlphaKey, DPFolderCardKey, DPFolderShadowKey;

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
        uint32_t rgb = DPWashiTapeRGBFor(group.window);
        mine.contentTintColor = [NSColor colorWithSRGBRed:((rgb >> 16) & 255) / 255.0 green:((rgb >> 8) & 255) / 255.0 blue:(rgb & 255) / 255.0 alpha:1];
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
    // The folder: card paper, with the small cut-paper shadow under it.
    NSView *box = nil;
    for (NSView *sub in group.subviews) if (sub.layer.cornerRadius > 0 && NSHeight(sub.frame) > 30) box = sub;
    NSView *card = DPGet(group, &DPFolderCardKey), *shadow = DPGet(group, &DPFolderShadowKey);
    if (!on || !box) {
        [card removeFromSuperview]; [shadow removeFromSuperview];
        DPSet(group, &DPFolderCardKey, nil); DPSet(group, &DPFolderShadowKey, nil);
        return;
    }
    CGFloat radius = box.layer.cornerRadius;
    if (!card) { card = DPWashiCardSheet(box.bounds, radius); card.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable; DPSet(group, &DPFolderCardKey, card); }
    if (card.superview != box) [box addSubview:card];
    if (!NSEqualRects(card.frame, box.bounds)) card.frame = box.bounds;
    if (!shadow) { shadow = DPWashiCutShadow(1, radius); DPSet(group, &DPFolderShadowKey, shadow); }
    if (shadow.superview != group) [group addSubview:shadow positioned:NSWindowBelow relativeTo:box];
    if (!NSEqualRects(shadow.frame, box.frame)) shadow.frame = box.frame;
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
        BOOL carded = [DPGet(group, &DPFolderCardKey) superview] != nil;
        if (carded != DPWashiLive(patch)) return DPWashiLive(patch) ? @"a folder isn't on paper" : @"paper left on a folder";
    }
    return nil;
}

DP_PATCH(DPWashiFolders) {
    .key = @"washiFolders",
    .defaultOn = YES,
    .order = 9,
    .title = @"Folders",
    .detail = @"Folders on Washi’s card paper, and ones you haven’t given an icon get one from their name or tabs: MDM gets tools, Budget gets money, GitHub tabs get code. Yours always stays.",
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
