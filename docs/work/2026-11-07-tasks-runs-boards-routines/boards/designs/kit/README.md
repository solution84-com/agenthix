# The shared shell kit (every design uses this, nothing else)

- `shell-kit.css`: icons, rail, project menu, screen bar, chat bar, phone, **the agent avatar and its run ring (D18)**, and
  the phone top bar (see below). Pasted once into the page's `<style>`.
- `shell-sprite.html`: the icon sprite (union of every icon the designs use). Pasted once after `<body>`.
- `shell-kit.js`: draws the shell from markup:
  - `<aside class="rail" data-on="projects|boards|yourtasks|workspaces|routines|workroom|..." [data-runs] [data-quiet]></aside>`
    (`data-on="-"` inside a project: nothing highlighted; `data-quiet`: no Runs badge)
  - `<nav class="pmenu" data-on="tasks|boards|sprints|workroom|runs|routines|settings|..." [data-quiet]></nav>`
    (`data-quiet`: no "3 running")
  - `<div class="sbar" data-crumbs="Website relaunch|Tasks"></div>` (Home is added; "/" between; the last is current)
  - `<div class="dock"></div>`; phone: `<div class="mtop" data-title="Tasks" data-under="" [data-back] [data-quiet]></div>`
  Run the script once at the end of the page.
- Surfaces: frame, rail, menu, chat bar = `surface-0`; the screen (`.main`, `.sbar`, `.page`, `.phone`, cards, fields,
  menus, dialogs) = `surface-1`. Desktop content's left and right edge = the screen bar's 24 px; phone 12 px.
- The agent avatar is `<span class="av [sm|lg]" data-run="waiting|running|needs|failed" style="--h:HUE" title="…">X</span>`,
  drawn only by the kit's CSS; no file draws its own ring.
- Menu counts, the same on every page: Tasks 33, Boards 6, Sprints 4, Workroom "3 running", Routines 5, Members 5.

## The phone (decided 7 Nov, replaces the actions row)
- Top bar: `<div class="mtop" data-title="Tasks" [data-under=""] [data-back] [data-form data-create="Create"] [data-quiet]></div>`
  draws: menu (or Back on a sub-page; the menu shows a dot when something needs the person), the title, **chat**, and one
  **⋯** holding the screen's actions (the main one first, highlighted; on a project screen the last item is
  "Website relaunch menu ›"). Two icons at the right, never more.
- Notifications and Runs are **not** in the top bar: they are rows in the menu (☰) drawer's foot, with their counts.
- A **form** (New task, New routine, New task type…) is a focused page: `data-form data-create="Create"` draws ✕ (Cancel), the
  title and one filled button; nothing else.
- No second row of actions under the top bar. A screen's view controls (Columns, Filter, Sort, tabs) stay in the content.
- A ⋯ menu is the kit's `.mpop` (rows `.mpi`, the main row `.mpi.first`, `.mpi.danger`, a divider `.mpsep`, a hint `.mph`); mark the top bar `data-more-open` while it is open. It is a popover under the ⋯: 250 px wide, `surface-1`, border, `shadow-pop`, 12 px radius, 6 px padding, rows 44 px
  tall; the main action first with the selected tint; a divider before the project-menu entry.
- The menu (☰) drawer: 300 px from the left over a scrim; the org mark and name with ✕; the eleven places in three groups
  with dividers (the open place highlighted); a foot with Notifications ("3 need you"), Runs ("2 need you · 3 running") and
  the person. The drawer is drawn in `rail-projects.html`; copy its structure.
