/**
 * What the agent image (`site/docker/agent.Dockerfile`) holds that the site
 * relies on: the harness versions it pins, where Agenthix's own files sit in
 * it, and the command launcher's interface (spec, "Keeping the gate whole",
 * item 3; "Deployment and version pinning").
 *
 * Paths are inside the container. Unit tests hold the versions and the secret
 * list to the Dockerfile and the launcher's own list, so the two cannot drift.
 */
import { COMMAND_LAUNCHER_PATH, HARNESS_SERVER_KEY_ENV } from '@agenthix/core'

// The launcher's interface is core's, since the host service asks the kernel the same way before it installs.
export { COMMAND_LAUNCHER_PATH, LANDLOCK_ABI_COMMAND, LANDLOCK_REQUIRED_ABI, landlockAbiSufficient, parseLandlockAbi } from '@agenthix/core'

/** The agent image's name when nothing names another: a local build. */
export const LOCAL_AGENT_IMAGE = 'agenthix-agent'

/**
 * The agent image this site runs, checks and reports. Where a host service runs the site it is `AGENT_IMAGE`, the
 * reference the host service pinned and checked (host-management spec §11); a container never starts from another
 * image that happens to carry the local name. An empty value counts as unset, as compose writes one.
 */
export function agentImageName(): string {
  return process.env.AGENT_IMAGE?.trim() || LOCAL_AGENT_IMAGE
}

/** The executor image's name when nothing names another: a local build (`site/docker/executor.Dockerfile`). */
export const LOCAL_EXECUTOR_IMAGE = 'agenthix-executor'

/**
 * The image a workflow step runs in. Where a host service runs the site it is `EXECUTOR_IMAGE`, pinned by digest like
 * `AGENT_IMAGE`; an empty value counts as unset.
 */
export function executorImageName(): string {
  return process.env.EXECUTOR_IMAGE?.trim() || LOCAL_EXECUTOR_IMAGE
}

/** The OpenCode release the image installs (`opencode-ai`). */
export const OPENCODE_VERSION = '1.18.32'

const AGENT_LIB_DIR = '/usr/local/lib/agenthix'

/*
 * `COMMAND_LAUNCHER_PATH` is the launcher every agent command runs through. `<launcher> <program> [args…]` runs the
 * program in a Landlock sandbox that cannot reach the harness: no access to the harness home, signals and tracing
 * only within the sandbox, and the harness's secrets (`HARNESS_SECRET_ENV`) removed. It exits 126 without running
 * anything when the kernel's Landlock ABI is below `LANDLOCK_REQUIRED_ABI`.
 */

/** OpenCode's `shell` configuration value: a `bash` that runs through the launcher. */
export const OPENCODE_COMMAND_SHELL = `${AGENT_LIB_DIR}/shell/bash`

/**
 * Claude Code's `CLAUDE_CODE_SHELL_PREFIX`, set on the `claude` process's own
 * `docker exec`. Claude runs `<prefix> '<command string>'`; the prefix runs the
 * string with bash through the launcher.
 */
export const CLAUDE_COMMAND_SHELL_PREFIX = `${AGENT_LIB_DIR}/bin/claude-shell-prefix`

/** The real ripgrep, installed from the image's packages. */
export const SYSTEM_RIPGREP_PATH = '/usr/bin/rg'

/**
 * The `rg` a harness finds on the image's `PATH`, ahead of the real one: it
 * runs `SYSTEM_RIPGREP_PATH` through the launcher, so the searches a harness
 * runs with its own permissions — OpenCode's grep and glob, Claude Code's Grep
 * and Glob with `USE_BUILTIN_RIPGREP=0` — cannot reach the harness home, other
 * processes' `/proc` entries or the harness's secrets (spec, "Tools Agenthix
 * owns on OpenCode").
 */
export const CONTAINED_RIPGREP_PATH = '/usr/local/bin/rg'

/** The real git, installed from the image's packages. */
export const SYSTEM_GIT_PATH = '/usr/bin/git'

/**
 * The `git` a harness finds on the image's `PATH`, ahead of the real one. Both
 * harnesses start `git` from the `PATH` in a project folder an agent can
 * write — Claude Code for the repository status it adds to its context,
 * OpenCode for the project's identity, branch, status and diffs — and a
 * repository's settings can name programs git runs (hooks, `core.fsmonitor`,
 * filter and diff drivers). This runs `SYSTEM_GIT_PATH` through the launcher,
 * so whatever a repository names runs with an agent command's reach and never
 * the harness's; started from outside any sandbox, which is to say by a
 * harness, it also runs with `HARNESS_GIT_CONFIG`.
 */
export const CONTAINED_GIT_PATH = '/usr/local/bin/git'

/**
 * Settings given on the command line to every git a harness runs, where they
 * outrank every configuration file: no hook, wherever the repository puts its
 * hooks, and no file-system monitor. An agent's own git, already in its
 * sandbox, keeps the repository's hooks.
 */
export const HARNESS_GIT_CONFIG: readonly string[] = ['core.hooksPath=/dev/null', 'core.fsmonitor=false']

/** The home the launcher gives every command (`HOME`), since commands cannot reach the harness home. */
export const COMMAND_HOME = '/home/agent'

/**
 * Folders of the run staging a command may read, colon-separated, set in the
 * harness's environment: the command's own conversation's staged skills. The
 * launcher keeps the rest of the run staging, every other conversation's, out
 * of a command's reach; it reads this and removes it from the command's
 * environment, and an entry outside the run staging makes it refuse to run
 * the command.
 */
export const COMMAND_READABLE_ENV = 'SITE_COMMAND_READABLE'

/**
 * The variable a harness finds its platform token in. The `claude` process's
 * platform-tool connection names it (`PLATFORM_AUTHORIZATION`) rather than
 * holding the token, because the SDK puts that connection on the CLI's command
 * line, which every process in the container can read; the CLI expands it from
 * its own environment, which commands cannot read and do not inherit.
 */
export const PLATFORM_TOKEN_ENV = 'SITE_MCP_KEY'

/** The platform connection's `Authorization` header, as the CLI's `--mcp-config` carries it. */
export const PLATFORM_AUTHORIZATION = `Bearer \${${PLATFORM_TOKEN_ENV}}`

/**
 * Every variable the launcher removes from a command's environment, whatever
 * the harness passed down. The launcher's own copy is
 * `site/docker/launcher/secret-env.list`; lane code that blanks secrets
 * elsewhere (the OpenCode plugin's `secretEnv`) can use this list.
 */
export const HARNESS_SECRET_ENV: readonly string[] = [
  'OPENCODE_SERVER_PASSWORD',
  'OPENCODE_CONFIG_CONTENT',
  'OPENCODE_AUTH_CONTENT',
  HARNESS_SERVER_KEY_ENV,
  PLATFORM_TOKEN_ENV,
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'GEMINI_API_KEY',
  'EXA_API_KEY',
]

/** OpenCode's model catalogue in the image, for `OPENCODE_MODELS_PATH`: read-only, the pinned binary's own. */
export const OPENCODE_MODELS_FILE = `${AGENT_LIB_DIR}/opencode/models.json`

/** Agenthix's OpenCode plugin, as the configuration's `plugin` entry names it. */
export const OPENCODE_PLUGIN_URL = `file://${AGENT_LIB_DIR}/opencode/plugin/agenthix.js`
