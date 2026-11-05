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
    }
    return 0;
}
