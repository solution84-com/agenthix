---
created: 2026-11-02
description: In a live preview and in a branch's copy, packages install with their scripts off; a fixed rule on public registry facts lets well-established packages' scripts run, and any other runs only after a person's yes in HQ, which names the package.
---

# ADR-0170: Install Scripts Are Blocked by Default

**Date:** 2026-11-02
**Status:** Accepted

## Context

A package's install script is code that runs the moment the package is installed, and the most common way a malicious
package acts. Every branch's copy installs its dependencies again, and a live preview runs them on an organisation's
site, with the network. Most packages have no script; a typical app has a handful, nearly always well known. People
can't judge most packages, and a prompt on every dependency trains them to approve unread.

## Options considered

- **Run every install script, relying on the container.** Rejected: the container bounds the damage, but the
  branch's code and the app's secrets are inside it.
- **Ask a person about each package's script.** Rejected: frequent prompts are approved unread.
- **Let a model judge each package.** Rejected: its judgement can't be audited or repeated.
- **Turn install scripts off entirely.** Rejected: many widely used packages need theirs.
- **Scripts off, then a fixed rule decides which run, and a person's yes for the rest (chosen).**

## Decision

1. **Packages install with scripts off;** the scripts of packages that pass the rule then run, through the sandbox
   launcher.
2. **The rule:** the version has been published at least 30 days; the package has more than 1,000 downloads a week;
   no known advisory in the OSV database; and its latest version came from the same publisher as the one before. A
   short built-in list of well-known packages skips the lookups; an organisation's admins may trust their own package
   scope.
3. **A package that fails is blocked.** The agent looks for an alternative first; only then is a person asked in HQ,
   with the package named and its risk in plain words.
4. **No registry access means scripts stay off.**

## What this binds

- Every install in a branch's copy or a live preview goes through this rule.
- The thresholds are one list in code, changed by a new decision, not per install.

Undoing it means install scripts run unchecked on the organisation's sites, or people approve packages they can't judge.

## Consequences

### Positive

- The common case passes silently; the rare risky package is caught before its code runs.

### Negative

- A new or little-used package that needs its script waits for a person's yes.
- Ecosystems that can't turn scripts off the same way rely on the container alone.

### Risks

- **A package's ordinary code** still runs in the app and the browser. Accepted: the rule lowers the odds; it is not a
  guarantee.
- **A trusted package taken over** within the rule's window. Accepted: the publisher check and advisories narrow it.

## References

adr-0167 (only the organisation's machines), adr-0168 (code work on branches).
