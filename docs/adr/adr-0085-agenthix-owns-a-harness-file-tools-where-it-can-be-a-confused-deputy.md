---
created: 2026-09-30
description: Where a harness's own file tools can be made to read or write, with the harness's permissions, what the agent is refused, Agenthix replaces those tools with its own that open first and check what was opened — and keeps everything else the harness does as its vendor ships it.
---

# ADR-0085: Agenthix Owns a Harness's File Tools Where the Harness Can Be Made Its Agent's Confused Deputy

**Status:** Accepted

## Context

A harness runs in the same container as the commands its agent runs. Agenthix keeps the two apart —
every command runs in a Landlock sandbox that cannot reach the harness's home, environment or
process — and a gate decides every tool call on its arguments before it runs.

Neither stops the harness itself acting for the agent. A harness's file tools read and write with the
harness's own permissions, which include its home and its own environment, where its secrets are. An
agent may make symbolic links: refusing them would break package managers, language environments and
repositories that contain links, and a sandbox can refuse the making of a link but cannot judge where it
points. So a path the gate checked while it was a real folder can be a link a few milliseconds later,
when the harness opens it — and the harness reads or writes the other end for the agent. This is the
confused deputy problem. A second user for commands does not change it: the harness still follows the
link, and may read its own home under any user.

OpenCode also reads files the gate never sees: when a file is read, it attaches the nearest `AGENTS.md`
in each folder above it, by path, and no setting turns this off. A planted link there needs no race at
all.

OpenCode's security policy puts a sandbox and malicious files outside what it protects, so closing this
is Agenthix's to own. adr-0081 says every harness runs the way its vendor intends; this record says where
Agenthix departs from that, and how far.

## Options considered

- **Leave the harness's file tools as they are, and hand them the checked real path.** Narrows the gap to
  a swapped intermediate folder, but leaves it open, leaves the `AGENTS.md` hole, and leaves writes into
  the harness's home. Kept on Claude, where the tools cannot be replaced without running its CLI outside
  its vendor's intended use; rejected on OpenCode, where they can.
- **Refuse symbolic links to the agent's commands.** Closes every race at once on both runtimes, but
  breaks npm, pnpm, Python environments and repositories with links, or changes how each behaves.
  Rejected.
- **A second user for the agent's commands.** Does not reach the problem: the harness follows the link.
  Rejected for this.
- **Keep secrets out of the harness's reach instead.** Removes what is most costly to lose — a model key
  relayed by the site never enters the container — but a harness always holds its own home, its server's
  password and the key that identifies it to the site, and writes into its home stay possible. Taken as
  well, not instead.
- **A harness of Agenthix's own.** Its file tools would need the same open-then-check code, its commands
  the same sandbox and its keys the same care, and Agenthix would also carry the agent loop, the provider
  adapters and their per-model changes, which adr-0073 chose not to. Rejected while the triggers below do
  not hold.

## Decision

**Where a harness's own file tools can be made to act for its agent on what the agent is refused, and
the harness lets them be replaced, Agenthix replaces them with its own.** Each opens the file first,
asks the kernel what it actually opened, refuses the harness's home and `/proc`, and only then reads or
writes through what it holds, so changing the path afterwards changes nothing. The same check covers any
file the tool reads without being asked, such as OpenCode's `AGENTS.md`.

**Everything else runs as its vendor ships it.** A tool that opens files by starting another program is
made safe by running that program through the command sandbox, not by replacing the tool. The agent
loop, providers, prompts, compaction and sessions stay the harness's.

**Each harness upgrade compares Agenthix's tools with the vendor's own** on the same files and reports
every difference, and re-checks what the replacement relies on: that a tool of Agenthix's still replaces
the vendor's, and that no new tool opens files by path. A new tool that does stays off until it is
covered.

**A harness of Agenthix's own is reconsidered when any of these holds:** Agenthix finds itself replacing
the harness's loop, compaction or provider handling rather than tools; upgrades keep breaking what the
replacements rely on, beyond what the comparison and a fix cost; the harness's release line loses its
future; or a gap appears that only a change inside the harness's own code could close.

The tool-by-tool arrangement is in the unit's
[design spec](../work/2026-09-27-model-vendor-independence/spec.md), "Tools Agenthix owns on OpenCode".

## What this binds

- **A harness adopted later** is examined for the same exposure — which of its tools read or write with
  its own permissions, and which it lets be replaced — before any real agent runs on it.
- **No new file-reading or file-writing tool of a harness is enabled** until it is covered by this.
- **Every upgrade of a harness with replaced tools** runs the comparison and the re-checks above before
  it ships.

Undoing it reopens the gap, and the `AGENTS.md` hole with it, on every harness whose tools can be
replaced.

## Consequences

### Positive

- On OpenCode, the harness cannot be used to read its own secrets or write into its home through a file
  tool, whatever links the agent makes.
- The change to the harness stays small: a few file tools, the part of a harness that changes least.

### Negative

- Agenthix keeps its file tools in step with the vendor's at each upgrade: output, truncation, messages,
  and code copied from the vendor.
- Small differences from the vendor's tools can reach the model.
- Claude's file tools stay narrowed but not closed.

### Risks

- **A replaced tool drifts from the vendor's** between upgrades. The comparison at each upgrade is what
  catches it; skipping it is how drift reaches the model.
- **The replacement relies on the harness's implementation**, not its contract: a plugin tool taking a
  built-in's place. Re-checked at every upgrade.

## References

- adr-0073 — OpenCode replaces `NativeRuntime`; Claude keeps its own runtime
- adr-0080 — each runtime's start-up is checked when the harness is upgraded
- adr-0081 — a harness runs the way its vendor intends; this record is where Agenthix departs from it
- adr-0082 — a conversation acts with its current turn's authority
- adr-0084 — an agent's skills are staged by Agenthix per turn

> *(annotated 2026-10-25)* The harness-neutral part of these tools — the safe open and check, text reading, the
> line-numbered read and the write — lives in `@agenthix/core/file-tools`, which the OpenCode plugin and the knowledge
> tools both use (adr-0150). The plugin's OpenCode-shaped wrappers and its copied edit matching stay in the plugin.
