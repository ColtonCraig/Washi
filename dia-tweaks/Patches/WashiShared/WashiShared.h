// Shared by the Washi tweaks: each one is an option of Washi (the Washi Paper patch, shown as "Washi"), and only
// does anything while Washi itself is on, so one switch turns the whole look on or off.
#import "StdPatch/StdPatch.h"
extern DPPatch DPWashiPaper;
static inline BOOL DPWashiLive(DPPatch *patch) { return patch->on && DPWashiPaper.on; }

// The Feel settings on Washi's page (like Washi's Look › Feel), saved with the tweaks' settings.
static inline NSUserDefaults *DPWashiDefaults(void) {
    static NSUserDefaults *d;
    if (!d) d = [[NSUserDefaults alloc] initWithSuiteName:@"com.diapatches"];
    return d;
}
static inline BOOL DPWashiFeel(NSString *key) {   // washiTexture, washiMotion: on unless turned off
    id v = [DPWashiDefaults() objectForKey:key];
    return v ? [v boolValue] : YES;
}
// No movement: Animations off on Washi's page, or Reduce Motion on the Mac.
static inline BOOL DPWashiCalm(void) {
    return !DPWashiFeel(@"washiMotion") || NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion;
}
// How much Scrapbook leans things: 1 is Washi's, more is more playful.
static inline CGFloat DPWashiTilt(void) {
    NSString *v = [DPWashiDefaults() stringForKey:@"washiTilt"];
    return [v isEqual:@"playful"] ? 2.2 : [v isEqual:@"wild"] ? 3.6 : 1;
}

// The space a window shows: Dia's window title is "Space: Tab". nil when it doesn't say.
static inline NSString *DPWashiSpaceOf(NSWindow *window) {
    NSString *title = window.title;
    NSRange at = [title rangeOfString:@": "];
    return at.location == NSNotFound || at.location == 0 ? nil : [title substringToIndex:at.location];
}
// A space's own tape (from the Spaces list on Washi's page), or nil for the main one.
static inline NSString *DPWashiSpaceTape(NSString *space) {
    if (!space) return nil;
    id v = [[DPWashiDefaults() dictionaryForKey:@"washiSpaceTapes"] objectForKey:space];
    return [v isKindOfClass:NSString.class] ? v : nil;
}
