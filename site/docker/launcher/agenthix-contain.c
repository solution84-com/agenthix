/*
 * agenthix-contain: runs one agent command in a Landlock sandbox of its own,
 * so the command cannot reach the harness that started it (spec, "Keeping the
 * gate whole", item 3). The harness (OpenCode's server, the `claude` CLI) runs
 * as the same user as the commands, so ownership cannot separate them; this
 * does, without privilege and without changing the container's options.
 *
 * Usage
 *   agenthix-contain <program> [args...]
 *       Runs <program> contained. Its exit status is the program's own.
 *   agenthix-contain --abi
 *       Prints the kernel's Landlock ABI version, 0 when Landlock is missing
 *       or disabled, and exits 0. The site's startup check reads it.
 *
 * Before the program starts, the launcher:
 *   - removes the harness's secrets from the environment (secret-env.list);
 *   - sets HOME to the commands' own home, /home/agent;
 *   - restricts itself and everything it will start, irreversibly:
 *       files      every access beneath each entry of / except /home and
 *                  /run, beneath each /home/<x> except the harness home
 *                  /home/appuser, and beneath each /run/<x> except the run
 *                  staging /run/staging, so the harness home and what the site
 *                  staged for every conversation are out of reach; plus
 *                  read-only access beneath each folder named in
 *                  SITE_COMMAND_READABLE (colon-separated, each inside the run
 *                  staging: the command's own conversation's staged skills);
 *       processes  signals and abstract Unix sockets only within the sandbox
 *                  (ABI 6). Landlock itself refuses ptrace of any process
 *                  outside the sandbox, and with it /proc/<pid>/environ,
 *                  mem, root and cwd.
 *
 * A program it starts may start it again: the image's `rg` runs the real one
 * through it, and an agent's command may run `rg`. Inside its own sandbox the
 * launcher cannot list /, which it needs to build the rules, and needs no
 * rules: the sandbox it is in holds, irreversibly, for everything it starts.
 * So when / cannot be listed and the harness home cannot be opened, it only
 * prepares the environment and runs the program.
 *
 * It never runs a command uncontained: when the kernel's Landlock ABI is below
 * 6 (Linux 6.12), or any step fails, it prints why and exits 126. It exits 127
 * when the program is not found.
 *
 * Wired in as OpenCode's `shell` (/usr/local/lib/agenthix/shell/bash) and
 * Claude Code's CLAUDE_CODE_SHELL_PREFIX
 * (/usr/local/lib/agenthix/bin/claude-shell-prefix).
 */
#define _GNU_SOURCE
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <unistd.h>

/* Landlock's interface, declared here so the build does not depend on the
 * kernel headers being new enough to know ABI 6. */
#ifndef __NR_landlock_create_ruleset
#define __NR_landlock_create_ruleset 444
#endif
#ifndef __NR_landlock_add_rule
#define __NR_landlock_add_rule 445
#endif
#ifndef __NR_landlock_restrict_self
#define __NR_landlock_restrict_self 446
#endif
#define LL_CREATE_RULESET_VERSION (1U << 0)
#define LL_RULE_PATH_BENEATH 1

#define LL_FS_EXECUTE (1ULL << 0)
#define LL_FS_WRITE_FILE (1ULL << 1)
#define LL_FS_READ_FILE (1ULL << 2)
#define LL_FS_READ_DIR (1ULL << 3)
#define LL_FS_TRUNCATE (1ULL << 14)
#define LL_FS_IOCTL_DEV (1ULL << 15)
/* Every filesystem right up to ABI 5: bits 0-15. */
#define LL_FS_ALL ((1ULL << 16) - 1)
#define LL_FS_FILE_ONLY (LL_FS_EXECUTE | LL_FS_WRITE_FILE | LL_FS_READ_FILE | LL_FS_TRUNCATE | LL_FS_IOCTL_DEV)
#define LL_FS_READ_ONLY (LL_FS_EXECUTE | LL_FS_READ_FILE | LL_FS_READ_DIR)

#define LL_SCOPE_ABSTRACT_UNIX_SOCKET (1ULL << 0)
#define LL_SCOPE_SIGNAL (1ULL << 1)

struct ll_ruleset_attr {
  uint64_t handled_access_fs;
  uint64_t handled_access_net;
  uint64_t scoped;
};

struct ll_path_beneath_attr {
  uint64_t allowed_access;
  int32_t parent_fd;
} __attribute__((packed));

#define REQUIRED_ABI 6
#define HARNESS_HOME "/home/appuser"
#define HARNESS_HOME_NAME "appuser"
#define COMMAND_HOME "/home/agent"
#define RUN_STAGING "/run/staging"
#define RUN_STAGING_NAME "staging"
#define READABLE_ENV "SITE_COMMAND_READABLE"

#define EXIT_REFUSED 126
#define EXIT_NOT_FOUND 127

static const char *const SECRET_ENV[] = {
#include "secret_env.h"
    NULL,
};

static int ruleset_fd = -1;

static void refuse(const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  fputs("agenthix-contain: ", stderr);
  vfprintf(stderr, fmt, ap);
  fputs("; the command was not run\n", stderr);
  va_end(ap);
  exit(EXIT_REFUSED);
}

static int landlock_abi(void) {
  long abi = syscall(__NR_landlock_create_ruleset, NULL, 0, LL_CREATE_RULESET_VERSION);
  return abi < 0 ? 0 : (int)abi;
}

/* Grants `rights` beneath `path`, narrowed to file rights when it is not a
 * folder. A path that does not exist is skipped: it holds nothing to reach. */
static void allow(const char *path, uint64_t rights) {
  int fd = open(path, O_PATH | O_CLOEXEC);
  if (fd < 0) {
    if (errno == ENOENT) return;
    refuse("cannot open %s: %s", path, strerror(errno));
  }
  struct stat st;
  if (fstat(fd, &st) != 0) refuse("cannot stat %s: %s", path, strerror(errno));
  if (!S_ISDIR(st.st_mode)) rights &= LL_FS_FILE_ONLY;
  struct ll_path_beneath_attr rule = {.allowed_access = rights, .parent_fd = fd};
  if (syscall(__NR_landlock_add_rule, ruleset_fd, LL_RULE_PATH_BENEATH, &rule, 0) != 0)
    refuse("cannot add a rule for %s: %s", path, strerror(errno));
  close(fd);
}

/* Grants every right beneath each entry of `dir` but those named in `except`
 * (NULL-terminated). */
static void allow_entries_except(const char *dir, const char *const *except) {
  DIR *d = opendir(dir);
  if (!d) refuse("cannot list %s: %s", dir, strerror(errno));
  struct dirent *e;
  char path[PATH_MAX];
  while ((e = readdir(d))) {
    if (!strcmp(e->d_name, ".") || !strcmp(e->d_name, "..")) continue;
    int skip = 0;
    for (const char *const *x = except; *x; x++) skip |= !strcmp(e->d_name, *x);
    if (skip) continue;
    if (snprintf(path, sizeof path, "%s/%s", strcmp(dir, "/") ? dir : "", e->d_name) >= (int)sizeof path)
      refuse("path too long beneath %s", dir);
    allow(path, LL_FS_ALL);
  }
  closedir(d);
}

/* Read-only access to the folders of the run staging a command needs: its own
 * conversation's staged skills. Each must resolve to a path strictly inside
 * the run staging: anything else is already reachable, and the run staging
 * itself holds every conversation's. */
static void allow_readable(void) {
  const char *list = getenv(READABLE_ENV);
  if (!list || !*list) return;
  char *copy = strdup(list);
  if (!copy) refuse("out of memory");
  for (char *save = NULL, *entry = strtok_r(copy, ":", &save); entry; entry = strtok_r(NULL, ":", &save)) {
    if (entry[0] != '/') refuse("%s entry %s is not an absolute path", READABLE_ENV, entry);
    char real[PATH_MAX];
    if (!realpath(entry, real)) {
      if (errno == ENOENT) continue;
      refuse("cannot resolve %s: %s", entry, strerror(errno));
    }
    if (strncmp(real, RUN_STAGING "/", sizeof RUN_STAGING) != 0 || real[sizeof RUN_STAGING] == '\0')
      refuse("%s entry %s is not inside %s", READABLE_ENV, entry, RUN_STAGING);
    allow(real, LL_FS_READ_ONLY);
  }
  free(copy);
}

static void restrict_self(void) {
  struct ll_ruleset_attr attr = {
      .handled_access_fs = LL_FS_ALL,
      .handled_access_net = 0,
      .scoped = LL_SCOPE_ABSTRACT_UNIX_SOCKET | LL_SCOPE_SIGNAL,
  };
  ruleset_fd = (int)syscall(__NR_landlock_create_ruleset, &attr, sizeof attr, 0);
  if (ruleset_fd < 0) refuse("cannot create the Landlock ruleset: %s", strerror(errno));

  allow_entries_except("/", (const char *const[]){"home", "run", NULL});
  allow_entries_except("/home", (const char *const[]){HARNESS_HOME_NAME, NULL});
  allow_entries_except("/run", (const char *const[]){RUN_STAGING_NAME, NULL});
  allow_readable();

  if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0) refuse("cannot set no_new_privs: %s", strerror(errno));
  if (syscall(__NR_landlock_restrict_self, ruleset_fd, 0) != 0)
    refuse("cannot enforce the Landlock ruleset: %s", strerror(errno));
  close(ruleset_fd);
}

/* Whether this process is already inside a launcher's sandbox. Outside one,
 * the harness user can always list /; inside one, Landlock refuses it, and
 * refuses the harness home too. Anything else is a refusal, never a guess. */
static int already_contained(void) {
  DIR *d = opendir("/");
  if (d) {
    closedir(d);
    return 0;
  }
  if (errno != EACCES) refuse("cannot list /: %s", strerror(errno));
  int fd = open(HARNESS_HOME, O_RDONLY | O_DIRECTORY | O_CLOEXEC);
  if (fd >= 0) {
    close(fd);
    refuse("/ cannot be listed, yet %s can be opened", HARNESS_HOME);
  }
  if (errno != EACCES && errno != ENOENT) refuse("cannot tell whether %s is reachable: %s", HARNESS_HOME, strerror(errno));
  return 1;
}

static void prepare_environment(void) {
  for (const char *const *name = SECRET_ENV; *name; name++) {
    if (unsetenv(*name) != 0) refuse("cannot remove %s: %s", *name, strerror(errno));
  }
  if (unsetenv(READABLE_ENV) != 0 || setenv("HOME", COMMAND_HOME, 1) != 0)
    refuse("cannot prepare the environment: %s", strerror(errno));
}

int main(int argc, char **argv) {
  if (argc == 2 && !strcmp(argv[1], "--abi")) {
    printf("%d\n", landlock_abi());
    return 0;
  }
  if (argc < 2) refuse("usage: agenthix-contain <program> [args...] | --abi");

  int abi = landlock_abi();
  if (abi < REQUIRED_ABI)
    refuse("this kernel's Landlock ABI is %d, and commands need %d or later (Linux 6.12)", abi, REQUIRED_ABI);

  if (!already_contained()) restrict_self();
  prepare_environment();

  execvp(argv[1], argv + 1);
  int err = errno;
  fprintf(stderr, "agenthix-contain: cannot run %s: %s\n", argv[1], strerror(err));
  return err == ENOENT ? EXIT_NOT_FOUND : EXIT_REFUSED;
}
