# Skills — the design's state, for the design pass

**What this is.** The skills screens were built from the boards in `boards/` (drawn and agreed before any code), then
changed in two rounds after the owner walked through them. This file maps each board to what is built now, what
changed since the board and why, and what the owner left open for a design pass across every feature before release.

**How to read the three together:**

| Source | Says |
|---|---|
| A board (`boards/ui-*.html`) | The intent when it was drawn: the reasoning behind each element, in its numbered notes and its *Before, after, why* |
| The spec (`spec.md` and `spec/`) | The design as it stands now, corrected in place after each round |
| This file | Where the two differ, the reason for each change, and what the design pass should look at |

**The rule for both rounds:** functionality first. A finding about how a screen looks was recorded and left for the
design pass; a finding that something didn't work, or couldn't be found, was fixed. The fixes reuse the app's existing
patterns (ui's buttons, the People list's whole-row link, ⋯ menus, token colours) rather than introducing new ones.
**Nothing here was designed as a finished look.** The design pass should treat each screen as a first go, and use the
boards' reasons to decide what to keep.

## Screen by screen

### U2 · The Library (`ui-library.html`)

- **Built as drawn:** one searched list, type and state chips, Marketplace behind its flag, Settings.
- **Changed since the board:**
  - The whole row opens the asset. The board drew only the title as a link, and only the title was clickable.
  - Every row action is in the row's ⋯ menu, and the states sit on a line of their own. The board drew the buttons
    in the row, but they competed with opening it.
  - *Add* became *Add skill*, because skills are all it adds today.
  - A copy and the original it replaced are one row, not two. The board drew both, and the set-aside original read
    as a duplicate.
  - The header links to the review queue when proposals wait.
- **Open for the design pass:**
  - The row's layout as a whole. A list with each skill's description, or cards, were weighed and left for this
    pass. The row today still shows no description.
  - The header buttons' order and weight.

### U3 · An asset's page (`ui-asset.html`)

- **Built as drawn:** content, agents with it, versions with roll back, credit and licence, signer and source,
  *Remove*.
- **Changed since the board:**
  - A copy's page shows *The original* it replaced: its version, *View*, and *Use the original again*. The
    original's page links to its copies.
  - Removing a copy that is in use gives its agents the original back. Before, the original was left set aside with
    no way back.
- **Open:** the page's density.

### U3b · Making and editing a skill (`ui-edit.html`)

- **Built as drawn:** the file tree with change markers; *View*, *Edit* and *Changes*; checks as you type; *New
  skill*.
- **Changed since the board:**
  - A draft saves itself a moment after typing stops, replacing *Save draft*. Publish was greyed out with no reason
    while a change was unsaved.
  - *Publish* always says why it can't be used.
  - Publishing writes the version into `SKILL.md`. Before, the file and hq's record of the version disagreed.
  - *Ask an agent* opens a dialog that names the agent that will answer and where, and lets the person pick another.
    The board drew it inline, and it didn't say who would answer.
- **Open:** the editor's chrome and the place of *Ask an agent*.

### U4 · Add (`ui-add.html`)

- As drawn, apart from the *Add skill* name.
- **Open:** whether *Add* returns as one entry once other kinds can be added.

### U5 · Update, roll back, own copy (`ui-update.html`)

- As drawn.
- **Open:** where roll back lives. In the walkthrough it wasn't found without being told. It is under the asset's
  *Versions*.

### P1 · A place's Skills page (`ui-place.html`), and P2 · Your space (`ui-yours.html`)

- **Built as drawn:** groups by where a skill lives, with versions, switches, *All on* and *All off*, *Add to this
  place* and *New skill*.
- **Changed since the board:**
  - A row says why its switch went off: its files changed since a named person switched it on, and when. Before, it
    went off silently.
  - The default is a labelled setting, *Skills found in files*, with the organisation's default beside it. It was a
    line of quiet text with a *Change* link, and was missed.
  - A row's actions sit under its text, so the text keeps its width.
  - Publishing from files asks for a note, and a place's roll back asks for a reason.
  - "N proposals waiting · Review" appears when proposals wait for the place.
- **Open:** the page as a whole, judged "good enough for now".

### A1 · An agent's page (`ui-agent.html`)

- **Changed since the board:**
  - Skills are rows under a heading for where each comes from, in the clash order.
  - Counts are given in words.
  - The agent's own page and the manage page share one body.
  - An agent that isn't assigned to any of the person's projects says so.
- **Open:** still crowded and confusing to read. The owner will look at this one carefully in the design pass.

### C1 · The `/` picker (`ui-pick.html`)

- **Changed since the board:** the picked skill stays in the message as highlighted `/name` text. The board drew a
  chip, which read as a menu choice rather than part of the message. It is still sent as a structured field, never
  parsed from the text.
- **Open:** the highlight's look.

### C2 · A skill used (`ui-used.html`)

- As drawn.

### C3 · Proposing (`ui-propose.html`)

- **Changed since the board:** a draft card whose draft was published says so ("Published as 1.0.0") and offers *Add
  to agents…*. It used to keep its note field.
- **Open:** an agent following the built-in *skill-creator* checks with the person before proposing. That adds a turn
  ("Say go and I'll propose it"). Whether that suits every request is open.

### R1 · Review (`ui-review.html`)

- **Changed since the board:** the Overview item counts proposals at every level the person reviews, and a project's
  Skills page and the Library lead to the queue. Before, only the organisation's proposals could be found.
- **Open:** the queue and the review page's look.

### R2 · Settings (`ui-settings.html`)

- As drawn.
- **Open:** the whole page. The owner judged it the roughest of the screens.

## Across screens

- **File views** (the editor, a place's file dialogs, Files, previews) fill the space they're given and scroll inside,
  so their buttons stay put. A view that must grow with its content uses the shared component's `grow` setting; none
  does today.
- **Whole-row links** are used wherever a row opens something (the Library; already the People list).
- **Header buttons** never wrap. On a narrow window they move under the title.
- **Agents are told what a staged skill's name means** (`platform-`, `org-`, `agent-`, `person-`, `workspace-N-`),
  which adds 58 tokens to every run. The names themselves stay namespaced, which keeps two skills with one name apart.
