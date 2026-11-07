---
title: Add a skill
description: Bring a skill into the Library from Agenthix's shelf, an upload or a link, and understand what the check tells you.
sidebar:
  order: 2
---

Adding a skill puts it in the [Library](../agents/library.md) at a version. It does not give it to any agent: that is
a second step, in [Give a skill to agents](give-skills-to-agents.md).

Adding is for administrators and Library maintainers. Library maintainers add from Agenthix's shelf; an upload or a link is for
administrators unless an administrator lets maintainers do it too: see
[Library and skills settings](library-settings.md#who-may-install-from-outside). Anyone else is told to ask one of them, and nothing is changed.

## Choose where it comes from

1. Select **Library** in the side bar, then **＋ Add**.
2. Choose one of:
   - **From Agenthix**: the skills that ship with this HQ. The list says what each is for and what it is **Suited to**
     (a hint for finding things, never a limit). **View** reads it first; **Add** adds it. A skill you already have
     shows **Installed** and its version with **Open**; when the shelf has a newer one it says **You have** your
     version and offers **Get** the newer.
   - **Upload a package**: a ZIP, or a skill folder with its `SKILL.md`, and its signature file
     (`package.sigstore.json`) if it has one. Select **Check it**.
   - **From a link**: an `https` address of a ZIP on any web server, such as a GitHub release. HQ fetches the ZIP and
     looks for its signature at the same address with `.sigstore.json` added. Select **Check it**.
3. A dialog says what was found. Read it, then select **Add**.

When a skill is in, a last step asks **Which agents use it?**: **Every agent**, **Chosen agents** (select **＋ Add an agent**),
or **Not yet**. **Not yet** leaves the skill with no agent; its row in the Library says **No agent uses it** and counts it under
**Needs you**. Choosing is for administrators. The page then says what happened. A package that is already installed at
that version, or at a newer one, is left alone and the page says so.

## What the check says

Every package is checked when it comes in: who signed it, and whether it was changed on the way. A **signature**
says who published a package. It never says the package is safe, so read what you install.

| The dialog says | Means | What you can do |
|---|---|---|
| **Signed by** a publisher your organisation trusts | The signature matches and you already trust the signer | **Add** |
| **Signed by** someone new, "You haven't installed anything from them before" | The signature matches, but this organisation has not trusted the signer | Choose **Trust** that publisher and install, so later versions install without asking, or **Install this once**. You can name the publisher |
| "This isn't signed" | No signature came with it. HQ cannot tell who made it or whether it was changed. The item is marked **Unsigned** from then on | Select **Read it**, tick **I've read it**, then **Add** |
| "This was changed after it was signed" | The signature does not match the package | Nothing: it is refused |

Other refusals say what is wrong and end "Nothing was changed.": a package signed with a key your organisation has not
added, a package that says it is published by Agenthix when it is not, a link to a private address, and an unsigned
package when the organisation does not allow them. The organisation decides these in
[Library and skills settings](library-settings.md).

Two further cases:

- **A different signer for a skill you have.** If a skill with the same name is already installed from another signer,
  the dialog says so and offers **Keep** the one you have or **Treat as a new publisher…**. It installs as a separate item, never as an update of
  the one you trust.
- **A newer version of a skill you have**, from the same signer, installs as an **Update available**. It stays at the
  version in use until you update: see [Write and edit a skill](write-and-edit.md#versions-update-and-return-to-one).
