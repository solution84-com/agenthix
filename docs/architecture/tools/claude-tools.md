# Claude SDK Built-in Tools

This document covers the full inventory of built-in tools provided by the Claude Agent SDK,
how the three SDK tool-filtering options work, what our platform exposes vs. blocks, and how
Claude's tools are kept from reaching the harness itself. OpenCode's tools are in
[opencode-tools.md](./opencode-tools.md); the gate both runtimes share is in
[tool-control.md](./tool-control.md).

---

## Why this exists

When we launch an agent via `ClaudeSDKRuntime`, Claude comes with its own set of built-in
tools (filesystem, bash, web, task management, etc.). Without explicit filtering, Claude's
full default tool set is visible — including tools that block on user input, tools with no
runtime implementation in our environment, and Claude Code CLI-specific tools that don't
belong in an autonomous agent session.

This document defines the complete inventory and our policy for each tool.

---

## The three SDK filtering options

The Claude SDK exposes three orthogonal options for controlling tools. They operate at
different layers and must not be confused.

### `tools` — visibility / existence

The **whitelist**. Only tools listed here are visible to Claude. If a tool is absent from
this list, Claude cannot see, describe, or invoke it.

```typescript
tools: ['Read', 'Write', 'Bash']   // Claude only knows these three exist
```

This is the primary control layer. Use it to limit what Claude can do per agent.

### `allowedTools` — auto-approval

Controls which tools skip the interactive permission prompt. Assumes the tools already
exist (via `tools`). A tool in `allowedTools` executes immediately without pausing for
user confirmation; one absent from it would normally pause and ask the user first.

**This option is irrelevant in our platform.** We run with
`permissionMode: 'bypassPermissions'`, which disables Claude's entire native permission
gate. Every call is decided by Agenthix's gate through the `PreToolUse` hook
([tool-control.md](./tool-control.md)). With
`bypassPermissions` active, `allowedTools` has no effect — everything auto-executes
regardless.

> **Implication:** passing `allowedTools` instead of `tools` would leave Claude seeing its full
> default tool set with no restriction, which is why Agenthix passes `tools`.

### `disallowedTools` — explicit blacklist

Removes tools from Claude's context entirely, even if they would otherwise be present.
Belt-and-suspenders: use this for tools that must never appear, as a secondary guard
alongside `tools`.

---

## SDK built-ins vs MCP tools — visibility model

The `tools` whitelist only controls **SDK built-in tools** (Read, Write, Bash, etc.).
Platform MCP tools behave differently.

When the SDK connects to an MCP server, it calls `tools/list` and includes every tool the
server returns in Claude's context automatically. There is no `tools`-equivalent whitelist
for MCP tools — you cannot selectively surface a subset via the SDK options alone.

### Current behaviour

The site's MCP server omits the tools in the run's capability `neverTools` (for a bypassed run, those a workspace's
allowed list leaves out), and lists the rest in two parts: the must-have tools in full, with `find_tools` and
`use_tool`, and every other tool by name in the server's instructions, found and called through those two
([tool-search.md](./tool-search.md)). `ask`-state tools stay offered by design: Claude can plan around them, and
calling one, directly or through `use_tool`, goes to approval; in a run nobody can approve, an `ask` tool is neither
shown nor found. Enforcement happens at the call level — the gate refuses or defers any call to a tool the agent hasn't
been granted, deciding a `use_tool` call on the tool it names. The same tools are also passed in `disallowedTools` as
`mcp__platform__<tool>`, in case the server's filter ever misses one. OpenCode's connection is filtered by the same server.

---

## Complete tool inventory

### Core capability tools

Full runtime implementation. Work correctly in a raw SDK `query()` session.

| SDK name | Our canonical name | What it does |
|---|---|---|
| `Read` | `read_file` | Read files — text, images, PDFs, notebooks |
| `Write` | `write_file` | Create or overwrite a file |
| `Edit` | `edit_file` | Targeted `old_string → new_string` replacement |
| `Bash` | `bash` | Execute shell commands |
| `Glob` | `glob_files` | Find files by glob pattern |
| `Grep` | `grep_files` | Search file contents with ripgrep |
| `WebFetch` | `web_fetch` | Fetch a URL |
| `WebSearch` | `web_search` | Run a web search |
| `NotebookEdit` | — | Edit Jupyter notebook cells (not used in our platform) |

### Productivity / meta tools

Claude uses these to organise its own work. No interactive user input required.

| SDK name | What it does | Our policy |
|---|---|---|
| `TodoWrite` | In-session scratch-pad task list. Claude uses this internally to track complex multi-step plans — kept private to the agent, no platform UI renders it. Not a platform task: `create_task` makes one of those. | **Expose to every agent** — always in `tools`, and the gate lets `TodoWrite` and `TodoRead` run whatever the agent's permissions, logging each call |
| `Agent` | Spawn a sub-agent synchronously or in the background. Core primitive for sub-agent delegation. | **Bypassed agents only** — it is in the full set an agent whose approval is bypassed gets, and has no canonical name, so no permission can grant it to anyone else |
| `Skill` | Loads a skill's full instructions by name. | **Exposed to every agent** (see "What each agent sees"). The turn's staged skills are given to the process as a local plugin named `agenthix`, with the SDK's `skills` allowlist naming exactly them, so Claude Code's own bundled skills are neither listed nor loadable. Claude's list labels each skill `agenthix:<name>`; the model calls it by the plain name. The gate lets it run whatever the agent's permissions, logs it as `skill`, and refuses a name that was not staged (`skill-not-staged`). Inline shell in a skill is off (`disableSkillShellExecution`). How skills reach each runtime is in [skills.md](../../concepts/skills/skills.md). |
| `SendMessage` | Send a message to a named running agent. | Leave out — only meaningful in named concurrent agent sessions |
| `EnterWorktree` / `ExitWorktree` | Create and operate inside an isolated git worktree. | Leave out for now — candidate for dev agents in a future phase |
| `StructuredOutput` | Return structured JSON matching `outputFormat`. Used internally when `outputFormat` is set. | Leave out — we don't currently use `outputFormat` |
| `Sleep` | Wait for a specified duration. | Leave out — no current use case |

### User-interactive tools — must be blocked

These hang or fail in a non-interactive raw SDK session. They are incompatible with
autonomous operation.

| SDK name | Why it blocks |
|---|---|
| `AskUserQuestion` | Presents 1–4 multiple-choice options and waits for a human answer. Hangs indefinitely without an `onElicitation` handler. |
| `ExitPlanMode` | Presents a plan and waits for human approval. Requires `permissionMode: "plan"`, which we do not use. |
| `EnterPlanMode` | Switches the session to planning-only mode. Pointless without `ExitPlanMode`. |

### CLI-specific tools — no runtime effect in our environment

These are meaningful only in an interactive Claude Code session. In an agent run — one `claude`
process per conversation, fed each turn through the SDK's streaming input — they are either
no-ops or reference infrastructure that doesn't exist.

| SDK name | Why it doesn't apply |
|---|---|
| `CronCreate` / `CronDelete` / `CronList` | Writes to `.claude/scheduled_tasks.json` but no background scheduler runs in SDK sessions. Effectively a no-op — could leave stale files. |
| `ToolSearch` | Fetches deferred MCP tool schemas from a lazy registry. We register all tools eagerly via our MCP server. Also refused by the gate. |
| `TeamCreate` / `TeamDelete` | SDK-level team management primitives. Not meaningful in single-agent sessions. |
| `TaskOutput` / `TaskStop` / `TaskCreate` / `TaskGet` / `TaskList` / `TaskUpdate` | Tracking for async shell tasks spawned with `Bash(run_in_background: true)`. Not in the `tools` list; `TaskOutput` and `TaskStop` are also refused by the gate should they ever be called. A background process an agent starts is stopped with the platform tool `stop_processes` instead. |
| `LSP` | Queries a language server. Requires LSP configuration we don't provide. |
| `ListMcpResourcesTool` / `ReadMcpResourceTool` | MCP resource access. We expose everything via tools, not resources. |

> **Display-name alias:** In Claude's internal prompts, `Agent` is referred to as `Task`.
> The canonical SDK name to use in `tools`/`disallowedTools` is always `Agent`.

---

## What each agent sees

### What we expose (pass in `tools`)

`buildSdkBuiltinTools` (`site/src/agents/runtime/sdkNames.ts`) builds the list from the agent's
permissions, not its archetype:

| Agent | Built-ins in `tools` |
|---|---|
| Restricted | Each of `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash`, `WebFetch`, `WebSearch` whose canonical tool is `always` or `ask`, and `TodoWrite` and `Skill`. In a run with no approved manifest (none today: every chat and task run has one) `ask` built-ins are left out too, and `Bash` is kept only while it is `always` or an `always` bash pattern exists ([tool-control.md](./tool-control.md)) |
| Bypassed | `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `WebFetch`, `WebSearch`, `TodoWrite`, `Agent`, `Skill` |

### What we blacklist (pass in `disallowedTools`)

Applied to every agent run regardless of archetype (`BLACKLISTED_SDK_TOOLS`):

```
AskUserQuestion
EnterPlanMode
ExitPlanMode
CronCreate
CronDelete
CronList
TeamCreate
TeamDelete
```

and the run's `never`-state platform tools, as `mcp__platform__<tool>` — in an unattended run, its
`ask`-state platform tools as well (`buildSdkDisallowedTools`). Everything else is left out of
`tools` — absent tools are invisible to Claude without needing to be explicitly blacklisted.

---

## How Claude's tools are kept from the harness

The `claude` process runs in the agent container as the same user as the commands the agent runs, and
its own tools run inside it with its reach. What keeps them from the harness's home and secrets
([tool-control.md](./tool-control.md)):

- **`Bash`** runs every command through the Landlock launcher: `CLAUDE_CODE_SHELL_PREFIX` names
  `/usr/local/lib/agenthix/bin/claude-shell-prefix`, which runs Claude's whole command string contained.
- **`Grep` and `Glob`** would use a copy of ripgrep built into the CLI, running with the CLI's own reach.
  `USE_BUILTIN_RIPGREP=0` on the process's `docker exec` makes them run the `rg` on the image's `PATH`,
  which runs the real one through the launcher.
- **`Read`, `Write` and `Edit`** run inside the CLI and cannot be replaced without running it outside its
  vendor's intended use. The gate refuses them the harness home and `/proc`, judged on real paths, and
  hands them the checked real path through `updatedInput`. A folder swapped for a link after the check is
  still followed: narrowed, not closed — an open risk.
- **No provider key in the process's environment.** With an API key, the process's model requests go to
  the site's model relay (`ANTHROPIC_BASE_URL`), and what Claude Code sends as its key is a relay token its
  `apiKeyHelper` fetches once, at start ([model-relay.md](../sites/model-relay.md)). A subscription is not
  relayed.
- **Nothing a signed-in account brings along**: `ENABLE_CLAUDEAI_MCP_SERVERS=false` turns off the claude.ai
  connectors of a subscription's account
  ([adr-0080](../../adr/adr-0080-a-run-never-carries-a-persons-own-connected-accounts.md)), and
  `settingSources: []` reads no settings files. A skill's header is rebuilt at staging without its hooks
  or `allowed-tools`, and its inline shell is off (`disableSkillShellExecution`). The gate also refuses any MCP server's tools other than the
  platform's.

The launcher, the `rg` wrapper and the relay are the agent container's. A site running without container
isolation starts `claude` as its own child, with the gate, the connectors turned off and no settings files,
but with the API key in its environment and its commands uncontained.

---

## Implementation

The options are built for each turn in `buildClaudeStart`
(`site/src/agents/runtime/claude/claudeStart.ts`) and fixed for the process's life; a turn whose options
differ replaces the process ([agent-runtimes.md](../sites/agent-runtimes.md)):

```typescript
// tools  →  the only built-ins Claude can see
tools: buildSdkBuiltinTools(context),

disallowedTools: buildSdkDisallowedTools(context),   // meta tools, never-state (and unattended ask-state) platform tools

permissionMode: 'bypassPermissions',   // every call goes to the PreToolUse hook instead
settingSources: [],                    // no settings files
plugins: [{ type: 'local', path: <staged plugin> }],   // when skills are staged
skills: <staged names>,                // [] when none: no skill, bundled ones included, is listed
settings: { disableSkillShellExecution: true, ... },
// allowedTools  →  NOT used; irrelevant with permissionMode: 'bypassPermissions'
```

`toSdkToolNames()` in `sdkNames.ts` translates our canonical names to Claude SDK names. See
[tool-control.md](./tool-control.md) for the mapping on both runtimes.
