// Keychain probe: "create" stores a secret (service washi-kc-probe), "read" reads it without allowing any prompt.
// Prints OK / DENIED <status>. Built twice with a different VERSION to see whether a grant survives a rebuild.
#include <Security/Security.h>
#include <stdio.h>
#include <string.h>
#ifndef VERSION
#define VERSION "1"
#endif
int main(int argc, char **argv) {
  const char *svc = "washi-kc-probe", *acct = "probe"; const char *ver = VERSION;
  SecKeychainSetUserInteractionAllowed(false);
  if (argc > 1 && !strcmp(argv[1], "create")) {
    OSStatus s = SecKeychainAddGenericPassword(NULL, (UInt32)strlen(svc), svc, (UInt32)strlen(acct), acct, 6, "secret", NULL);
    printf("create v%s: %d\n", ver, (int)s); return s != 0;
  }
  UInt32 len = 0; void *data = NULL;
  OSStatus s = SecKeychainFindGenericPassword(NULL, (UInt32)strlen(svc), svc, (UInt32)strlen(acct), acct, &len, &data, NULL);
  if (s == 0) { printf("read v%s: OK\n", ver); SecKeychainItemFreeContent(NULL, data); return 0; }
  printf("read v%s: DENIED %d\n", ver, (int)s); return 1;
}
