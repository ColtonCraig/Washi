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

// Scrapbook's tape on something "stuck down" (it needs Washi Tape too): a torn strip on `host`'s layer, centred at
// `at` in host's coordinates, leaning `degrees` (negative leans left). Gone when Scrapbook or Washi Tape is off.
CALayer *DPWashiTapeStrip(CGSize size, BOOL flipped, NSWindow *window);   // WashiTape.m
void DPWashiTapeRecolor(CALayer *tape, NSWindow *window);
extern DPPatch DPWashiScrapbook, DPWashiTape;
static inline BOOL DPWashiScrap(void) { return DPWashiLive(&DPWashiScrapbook) && DPWashiLive(&DPWashiTape); }
static inline void DPWashiStick(NSView *host, void *key, BOOL want, CGSize size, NSPoint at, CGFloat degrees) {
    CALayer *tape = objc_getAssociatedObject(host, key);
    if (!want || !host.layer) { [tape removeFromSuperlayer]; objc_setAssociatedObject(host, key, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC); return; }
    BOOL flipped = host.isFlipped || host.layer.geometryFlipped;
    if (!tape) { tape = DPWashiTapeStrip(size, flipped, host.window); objc_setAssociatedObject(host, key, tape, OBJC_ASSOCIATION_RETAIN_NONATOMIC); }
    else DPWashiTapeRecolor(tape, host.window);
    [CATransaction begin]; [CATransaction setDisableActions:YES];
    tape.position = at;
    tape.affineTransform = CGAffineTransformMakeRotation((flipped ? degrees : -degrees) * M_PI / 180);
    if (tape.superlayer != host.layer) [host.layer addSublayer:tape];
    host.layer.masksToBounds = NO;
    [CATransaction commit];
}

// Washi's "rise in": up from `dy` points, fading in and leaning `degrees`, on the spring. Nothing with Animations off.
static inline void DPWashiRiseIn(NSView *view, CGFloat dy, CGFloat degrees, CGFloat scale, CFTimeInterval duration, CFTimeInterval delay) {
    if (DPWashiCalm() || !view.layer) return;
    BOOL flipped = view.isFlipped || view.layer.geometryFlipped;
    CABasicAnimation *fade = [CABasicAnimation animationWithKeyPath:@"opacity"]; fade.fromValue = @0; fade.toValue = @1;
    CABasicAnimation *up = [CABasicAnimation animationWithKeyPath:@"transform.translation.y"]; up.fromValue = @(flipped ? dy : -dy); up.toValue = @0; up.additive = YES;
    CABasicAnimation *lean = [CABasicAnimation animationWithKeyPath:@"transform.rotation.z"]; lean.fromValue = @((flipped ? degrees : -degrees) * M_PI / 180); lean.toValue = @0; lean.additive = YES;
    CABasicAnimation *grow = [CABasicAnimation animationWithKeyPath:@"transform.scale"]; grow.fromValue = @(scale - 1); grow.toValue = @0; grow.additive = YES;
    CAAnimationGroup *in = [CAAnimationGroup animation]; in.animations = @[ fade, up, lean, grow ];
    in.duration = duration; in.beginTime = CACurrentMediaTime() + delay; in.fillMode = kCAFillModeBackwards;
    in.timingFunction = [CAMediaTimingFunction functionWithControlPoints:.34 :1.3 :.64 :1];
    [view.layer addAnimation:in forKey:@"washiRise"];
}
