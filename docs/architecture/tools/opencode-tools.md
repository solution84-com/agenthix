# OpenCode Tools

Every tool the OpenCode runtime can offer a model, whose code runs it, and why. The companion to
[claude-tools.md](./claude-tools.md); the gate both runtimes share is [tool-control.md](./tool-control.md),
and how OpenCode itself is started and driven is
[agent-runtimes.md](../sites/agent-runtimes.md).

OpenCode is pinned at 1.18.32 in the agent image (`site/docker/agent.Dockerfile`). Tool names, arguments
and file references below are that version's.

---

## Why some of OpenCode's tools are Agenthix's own

Two controls keep an agent inside its boundary on OpenCode: the gate decides every call on its
arguments before it runs, and every command the agent runs is sandboxed by the Landlock launcher so it
cannot reach the harness's home, environment or process ([tool-control.md](./tool-control.md)).

Neither stops the harness itself being used as the agent's **confused deputy** — a program with more
access than its caller, tricked into using that access for the caller. OpenCode's file tools run inside
the OpenCode server, as its user, and can open anything it can: its home (`/home/appuser`, holding its
database and state) and its own environment (`/proc/self/environ`, holding the server password and the
key that fetches each turn). An agent may make symbolic links — refusing them would break npm, pnpm,
Python environments and repositories that contain them — so:

- **A link already in place** when the gate looks is caught: the gate resolves the path's real path in
  the container and refuses the harness home and `/proc`.
- **A link swapped in after the check** is not: a few milliseconds later the tool opens the same path,
  now a link, and reads or writes the other end with the harness's permissions.
- **OpenCode reads files the gate never sees.** When the model reads a file, OpenCode's `read` attaches
  the nearest `AGENTS.md` and `CONTEXT.md` in each folder between it and the session's folder, by path,
  and no setting turns that off. A planted `AGENTS.md` link would be read into the model's context with
  no race at all.

So Agenthix replaces the tools that open files by path, and keeps the rest of OpenCode as it ships
([adr-0085](../../adr/adr-0085-agenthix-owns-a-harness-file-tools-where-it-can-be-a-confused-deputy.md)).
A second user for commands would not change this: the harness still follows the link.

### How Agenthix's file tools open a file

Every file the plugin's tools touch goes through `core/src/fileTools/verifiedFs.ts` (`@agenthix/core/file-tools`). The same module holds the grep, read, write and edit that the [knowledge tools](../mcp/tools.md#what-the-knowledge-tools-do) run on, with Claude Code's names and exact matching; the plugin keeps OpenCode's shape and its matching copied from OpenCode, and both get the same guards:

1. The gate's allow carries the call's arguments with each checked path replaced by its real path, and
   the plugin puts those arguments in place of the model's (`replaceArgs`, `hooks.ts`).
2. The tool opens the file with `O_NOFOLLOW`, so a link at the end is never followed.
3. It asks the kernel what it actually opened — `readlink /proc/self/fd/<n>` — and uses the descriptor
   only if that is exactly the path the gate checked. A link swapped in anywhere along the path makes
   the two differ, and the call fails with "changed after it was checked".
4. It reads or writes through that one descriptor, and creates a missing folder inside the folder
   descriptor it already checked, so nothing is looked up by path twice.

Whatever the site allowed, these helpers never open anything under `/proc` and never open anything in
the harness home for writing. Reading inside the home is limited by the gate, which lets read-only tools
into two folders only: the skills staged for the conversation, and OpenCode's saved tool output
(`.local/share/opencode/tool-output`), which OpenCode tells the model to read when it cuts a long result.

The instruction files `read` attaches (`files/instructions.ts`) are opened the same way; one that is not
where it claims to be is skipped.

---

## Every tool

| OpenCode tool | Canonical name | Whose | How it is made safe, and why |
|---|---|---|---|
| `bash` | `bash` | OpenCode's | Every command runs through the Landlock launcher, which OpenCode's `shell` setting names (`/usr/local/lib/agenthix/shell/bash`). The plugin's `shell.env` hook tags it with the conversation, blanks the server's secrets and refuses a command with no turn running. Gated on the whole `command` against the agent's bash patterns. |
| `grep`, `glob` | `grep_files`, `glob_files` | OpenCode's | They open no files themselves: both start `rg` from the `PATH`, with the server's environment. The image's `/usr/local/bin/rg`, ahead of the real `/usr/bin/rg`, runs it through the launcher, so the secrets are stripped and the harness home is out of reach — a swapped link leads to a wall. Because `rg` is started by the server and not through `shell.env`, it cannot search the staged skills folders, which `read` and commands can. |
| `read` | `read_file` | **Agenthix's** (`files/readTool.ts`) | Opens first and checks what it opened, as above, and does the same for each `AGENTS.md`/`CONTEXT.md` it attaches. |
| `write`, `edit` | `write_file`, `edit_file` | **Agenthix's** (`files/writeTools.ts`) | The same, before writing. The edit matching is OpenCode's own code, copied unchanged under its MIT licence (`editMatch.ts`, `editReplace.ts`). |
| `apply_patch` | `edit_file`, plus `write_file` when the patch adds, deletes or moves a file | **Agenthix's** (`files/applyPatchTool.ts`) | The same, for every file the patch touches; a removal happens inside the folder already checked. OpenCode offers it to GPT models *instead of* `edit` and `write` (`tool/registry.ts`), so for them it is the only way to edit. The patch parser is OpenCode's, copied (`patchParse.ts`, `patchApply.ts`). The gate reads every file header in the patch text. |
| `skill` | — | **Agenthix's** (`skillTool.ts`) | Design, not security: it loads a skill only from the calling conversation's staged folder, so agents sharing one server never see each other's skills ([adr-0084](../../adr/adr-0084-an-agents-skills-are-staged-by-agenthix-per-turn.md)). Every agent has it; each call is still gated and logged. |
| `todowrite` | — | OpenCode's | Touches no files. The agent's private checklist for the conversation — not a platform task. Every agent has it; each call is gated and logged. |
| `webfetch` | `web_fetch` | OpenCode's | Touches no files. Fetches from the container's own network. |
| `invalid` | — | OpenCode's | What OpenCode runs in place of a call it could not parse; it only answers an error. Every agent has it. |
| `websearch` | — | **Off** | `OPENCODE_ENABLE_EXA` is never set. Web search on OpenCode is the platform tool `web_search` instead (below). |
| `task`, `question` | — | **Off** | Denied with pattern `*` in the configuration and every session's rules, which removes them from the tool list the model receives. `task` would start subagents, which Agenthix does not offer on OpenCode; `question` waits for a person at a terminal. |
| `lsp`, `plan`, code mode (`execute`) | — | **Off** | Each needs an experimental setting the site never passes (`FORBIDDEN_SERVER_ENV`, `openCodeConfig.ts`). Code mode must never be enabled: it runs platform tools from a script, outside the per-call gate. |
| Platform tools | the tool's own name | Agenthix's (site and hq) | Reached on the conversation's own platform-tool connection, named `agx<12 hex>` (see [agent-runtimes.md](../sites/agent-runtimes.md)); OpenCode names each `<connection>_<tool>`, and the gate removes the prefix by the known connection name. |

A tool OpenCode offers that is not in this table is refused by the gate, never guessed at
(`openCodeGateCall`, `site/src/agents/runtime/opencode/openCodeNames.ts`).

### Platform tools the site serves itself

Two platform tools are served by the site rather than forwarded to hq, because what they touch is on the
site's machine (`site/src/server/mcp/siteTools.ts`):

- **`stop_processes`**, on both runtimes and always given. Each command is its own sandbox and cannot
  signal a process an earlier command started — a dev server from the last turn, say — so the site stops
  them for it: the calling conversation's own processes, matched by its tag, never the harness.
- **`web_search`**, on OpenCode only; Claude keeps its own `WebSearch`. The site calls Exa's search API
  with the org's Exa key, which hq sends with each turn and which never enters the container. It is
  offered only on a connection that says it is OpenCode's: the connection the OpenCode runtime adds sends
  the header `x-agenthix-harness: opencode` beside its token. The header is not a credential; the token
  decides everything else. A turn of an organisation with no key is not shown it
  ([below](#what-an-agents-permissions-hide)).

### What an agent's permissions hide

On OpenCode the configuration allows every tool (`"*": "allow"`) and denies with pattern `*` only `task`,
`question` and OpenCode's own skill listing. Each session's rules then deny every other conversation's
connection and, for a restricted agent, each built-in set to `never` (`openCodeHiddenBuiltins`,
`openCodeNames.ts`): a deny with pattern `*` removes the tool from the list the model receives. In a
run with no approved manifest (none today: every chat and task run has one) the rules also deny the
agent's `ask` built-ins (`bash` only when it is not `always` and no `always` bash pattern exists) and each `ask` platform tool by
its id, `<connection>_<tool>` (`openCodeHiddenPlatformTools`), since nobody is there to approve them
([tool-control.md](./tool-control.md)). OpenCode hides tools by permission key, and `edit`, `write` and
`apply_patch` share the one key `edit`, so the three are hidden only when both `edit_file` and
`write_file` are withheld; with one of them allowed, all three stay listed and the gate refuses the other
when called. Denying `read` also hides OpenCode's MCP-resource
tools, which the gate refuses anyway. A bypassed agent is shown every built-in, as on Claude.

Permissions are read at every turn, so the rules are too: a new session is created with the turn's rules,
and a resumed one is brought up to them before the message is sent (`syncOpenCodeSessionRules`,
`openCodeSessions.ts`: `GET /session/:id`, then `PATCH /session/:id` when the session's rules do not
already end with the turn's set). If either call fails, the turn fails before any message is sent.

A platform tool set to `never` is removed from the list by the site's MCP server, as on Claude.

On a turn of an organisation with no search key, the rules also deny `<connection>_web_search`, for every
agent, bypassed ones included (`openCodeHiddenPlatformTools`): the turn's context carries no `webSearchKey`, so
the tool would have nothing to search with. The site's MCP server still lists `web_search` on every OpenCode
connection, and OpenCode keeps a connection's list for the conversation's later turns, so it is the turn's
rules, re-synced at every turn, that show the tool at the next turn once a key is added and hide it at the
next turn once the key is removed. A call that still arrives without a key — the key removed while a turn
runs — is refused by the tool itself (`siteTools.ts`). The same turn's instructions say web search isn't set
up, why, and where an organisation admin adds the key (core's `NO_WEB_SEARCH_INSTRUCTIONS`, added by
`OpenCodeRuntime.ts`); a turn with the key is told nothing. Claude Code runs are unchanged: Claude searches
on Anthropic's own service, and hq never sends their runs the key.

---

## At every OpenCode upgrade

Agenthix's tools rely on how OpenCode is built, not only on what it documents. Each upgrade, alongside
the start-up check [adr-0080](../../adr/adr-0080-a-run-never-carries-a-persons-own-connected-accounts.md)
requires and the vendor-guidance check
[adr-0081](../../adr/adr-0081-a-harness-runs-the-way-its-vendor-intends.md) requires:

1. **Run the comparison check**, `site/opencode-plugin/src/__tests__/toolComparison.container.test.ts`. It
   runs Agenthix's `read`, `write`, `edit`, `apply_patch` and `skill` beside OpenCode's own on the same
   fixture projects, in a real OpenCode server in the agent image with a stand-in model, and reports every
   difference in status, output, error text, attachments and the files left behind. Each difference is
   either made to match, with a unit test, or declared at the top of the file with its reason; a declared
   difference that no longer shows also fails. How to run it against a new image is at its top.
2. **Compare the copied code** — the edit matching and the patch parser — with the new version, and copy
   it again if it changed.
3. **Re-check what the controls rely on**:
   - a plugin tool still replaces OpenCode's own tool of the same name;
   - `tool.execute.before` still runs before every call, built-in, plugin and platform alike, with the
     call's arguments, and a throw there still ends only that call;
   - `grep` and `glob` still start `rg` from the `PATH`;
   - the `shell` setting still routes every command through the launcher;
   - the arguments `openCodeNames.ts` reads (`filePath`, `path`, `pattern`, `patchText`, `command`)
     are unchanged;
   - no new tool opens files by path. A new tool that does stays off until it is covered.
4. **Regenerate the model list** in `core` from the new version's catalogue
   (`core/scripts/generate-model-list.mjs`, which writes `core/src/models/openCodeModels.generated.ts`).

---

## Key files

| File | Role |
|---|---|
| `site/opencode-plugin/src/index.ts`, `plugin.ts` | The plugin OpenCode loads, and the hooks and tools it registers |
| `site/opencode-plugin/src/hooks.ts` | `tool.execute.before` (the gate), `shell.env` (tag, secrets), `chat.headers` (the relay token) |
| `site/opencode-plugin/src/files/` | `read`, `write`, `edit`, `apply_patch`, on `@agenthix/core/file-tools` (`core/src/fileTools/verifiedFs.ts`), which opens first and checks |
| `site/opencode-plugin/src/skillTool.ts` | The per-conversation `skill` tool |
| `site/src/agents/runtime/opencode/openCodeNames.ts` | OpenCode's tool names and arguments to the gate's canonical ones |
| `site/src/agents/runtime/opencode/openCodeConfig.ts` | The server's configuration and environment: what is on, off and denied |
| `site/docker/launcher/` | The Landlock launcher, OpenCode's `shell`, and the `rg` wrapper |
