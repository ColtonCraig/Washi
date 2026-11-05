// Draws every Washi Settings drawing (each option's close-up, light and dark) to PNGs, so they can be looked at
// without Dia: built and run by .github/workflows/dia-tweaks.yml, the images uploaded with the run.
#import <AppKit/AppKit.h>
#import <dlfcn.h>

int main(int argc, char **argv) {
    @autoreleasepool {
        [NSApplication sharedApplication];
        void *lib = dlopen(argv[1], RTLD_NOW);
        if (!lib) { fprintf(stderr, "%s\n", dlerror()); return 1; }
        void (*draw)(NSRect, BOOL, NSColor *, NSColor *, NSString *) = dlsym(lib, "DPWashiDrawArt");
        if (!draw) { fprintf(stderr, "no DPWashiDrawArt\n"); return 1; }
        NSArray *spots = @[ @"tape", @"cards", @"hand", @"scrapbook", @"lift", @"bars", @"sheet", @"popups", @"newtab", @"commandbar",
                            @"ticket", @"folders", @"polaroid", @"quit", @"toasts", @"newtabtop", @"type" ];
        NSColor *tape = [NSColor colorWithSRGBRed:1 green:.416 blue:.239 alpha:1];
        for (NSNumber *dark in @[ @NO, @YES ]) {
            NSColor *paper = dark.boolValue ? [NSColor colorWithSRGBRed:.169 green:.145 blue:.125 alpha:1] : [NSColor colorWithSRGBRed:.984 green:.965 blue:.918 alpha:1];
            for (NSString *spot in spots) {
                NSImage *image = [NSImage imageWithSize:NSMakeSize(260, 160) flipped:YES drawingHandler:^BOOL(NSRect r) {
                    [(dark.boolValue ? NSColor.blackColor : NSColor.whiteColor) setFill]; NSRectFill(r);
                    draw(NSMakeRect(10, 7, 240, 146), dark.boolValue, paper, tape, spot);
                    return YES;
                }];
                NSBitmapImageRep *rep = [[NSBitmapImageRep alloc] initWithCGImage:[image CGImageForProposedRect:NULL context:nil hints:@{ NSImageHintCTM: [NSAffineTransform transform] }]];
                NSString *path = [NSString stringWithFormat:@"%s/%@-%@.png", argv[2], spot, dark.boolValue ? @"dark" : @"light"];
                [[rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}] writeToFile:path atomically:YES];
            }
        }
        printf("drew %lu\n", (unsigned long)spots.count * 2);

        // The quick-start guide and Washi's settings page (with some spaces), light and dark, as views.
        void (*fake)(NSArray *) = dlsym(lib, "DPWashiFakeSpaces");
        NSView *(*guideMake)(void) = dlsym(lib, "DPWashiGuideMake");
        void (*guideLight)(NSView *, NSString *) = dlsym(lib, "DPWashiGuideLight");
        NSArray *(*lookRows)(void) = dlsym(lib, "DPWashiLookRows");
        uint32_t (*paperRGB)(BOOL) = dlsym(lib, "DPWashiMainPaperRGB");
        if (fake) fake(@[ @"Work", @"Personal", @"MDM Projects" ]);
        NSUserDefaults *d = [[NSUserDefaults alloc] initWithSuiteName:@"com.diapatches"];
        [d setObject:@{ @"Work": @{ @"preset": @"tangerine", @"s2": @(0xff7aa8) }, @"Personal": @{ @"preset": @"lagoon" } } forKey:@"washiSpaceLooks"];
        void (^shoot)(NSView *, NSColor *, NSString *) = ^(NSView *view, NSColor *back, NSString *name) {
            NSBitmapImageRep *cache = [view bitmapImageRepForCachingDisplayInRect:view.bounds];
            [view cacheDisplayInRect:view.bounds toBitmapImageRep:cache];
            NSImage *image = [NSImage imageWithSize:view.bounds.size flipped:NO drawingHandler:^BOOL(NSRect r) {
                [back setFill]; NSRectFill(r);
                [cache drawInRect:r fromRect:NSZeroRect operation:NSCompositingOperationSourceOver fraction:1 respectFlipped:YES hints:nil];
                return YES;
            }];
            NSBitmapImageRep *rep = [[NSBitmapImageRep alloc] initWithCGImage:[image CGImageForProposedRect:NULL context:nil hints:nil]];
            [[rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}] writeToFile:[NSString stringWithFormat:@"%s/%@.png", argv[2], name] atomically:YES];
        };
        for (NSNumber *dark in @[ @NO, @YES ]) {
            NSAppearance *look = [NSAppearance appearanceNamed:dark.boolValue ? NSAppearanceNameDarkAqua : NSAppearanceNameAqua];
            NSString *mode = dark.boolValue ? @"dark" : @"light";
            if (guideMake) {
                for (NSString *lit in @[ @"", @"tab" ]) {
                    NSView *guide = guideMake();
                    guide.appearance = look;
                    if (lit.length && guideLight) guideLight(guide, lit);
                    uint32_t rgb = paperRGB ? paperRGB(dark.boolValue) : 0xfbf6ea;
                    NSColor *paper = [NSColor colorWithSRGBRed:((rgb >> 16) & 255) / 255.0 green:((rgb >> 8) & 255) / 255.0 blue:(rgb & 255) / 255.0 alpha:1];
                    [look performAsCurrentDrawingAppearance:^{ shoot(guide, paper, [NSString stringWithFormat:@"guide%@%@-%@", lit.length ? @"-" : @"", lit, mode]); }];
                }
            }
            if (lookRows) {
                for (NSNumber *width in @[ @540, @380 ]) {
                    NSView *page = lookRows().firstObject;
                    page.appearance = look;
                    NSWindow *w = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, width.doubleValue, 1400) styleMask:NSWindowStyleMaskBorderless backing:NSBackingStoreBuffered defer:NO];
                    w.appearance = look;
                    page.translatesAutoresizingMaskIntoConstraints = YES;
                    for (NSLayoutConstraint *c in page.constraints) c.active = NO;
                    [w.contentView addSubview:page];
                    page.frame = NSMakeRect(0, 0, width.doubleValue, 1400);
                    [page layoutSubtreeIfNeeded];
                    page.frame = NSMakeRect(0, 0, width.doubleValue, page.intrinsicContentSize.height);
                    [page layoutSubtreeIfNeeded];
                    [look performAsCurrentDrawingAppearance:^{ shoot(page, dark.boolValue ? [NSColor colorWithWhite:.16 alpha:1] : [NSColor colorWithWhite:.97 alpha:1], [NSString stringWithFormat:@"settings-%@-%@", width, mode]); }];
                }
            }
        }
        printf("drew the guide and Settings\n");
    }
    return 0;
}
