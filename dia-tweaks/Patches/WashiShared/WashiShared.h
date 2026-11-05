// Shared by the Washi tweaks: each one is an option of Washi (the Washi Paper patch, shown as "Washi"), and only
// does anything while Washi itself is on, so one switch turns the whole look on or off.
#import "StdPatch/StdPatch.h"
extern DPPatch DPWashiPaper;
static inline BOOL DPWashiLive(DPPatch *patch) { return patch->on && DPWashiPaper.on; }
