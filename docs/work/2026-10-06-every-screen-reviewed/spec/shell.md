# Shell, navigation, screen bar and layouts

Part of the unit's design spec: see [the index](README.md).

## The shell

The shell is the frame every screen shares.

### Navigation (left)

From top to bottom:

1. **The logo**, with two buttons beside it: **Notifications** (a bell, with a count of unread items) and **Runs**
   (with a count of runs in progress). Each opens its panel ([Notifications and Runs](notifications-runs.md)). They sit together because they behave alike.
2. **The places you work:** Home · Chat · Projects · Agents · Tasks. Tasks keeps its "N need you" count.
3. **Pinned:** one list the person orders by dragging, with a pin icon on its heading and an Edit control. A pin
   is a project, a board or an agent, each shown by its avatar. Agents have avatars today. Projects get a default
   avatar (the project's initial on its colour) and boards a default one (a board mark on a colour). Room is left
   for real project and board avatars later. Pins replace today's "recent projects" and "recent boards" lists.
4. **At the foot:** Organisation · Settings · the person.

Inside a project, **Projects is not highlighted**. If the project is pinned, its pin is highlighted.

**Leaving the navigation:** the global Boards and Workspaces lists, which become views of the Projects screen
([The Projects screen](projects-screen.md)), and "My tasks" (now the Tasks tool in Chat). **Moving into Organisation:** Products, Programs and Library. The Projects screen gains a
filter by product and programme.

**Collapsed**, the navigation becomes a strip of icons: the logo, then Notifications and Runs with their counts,
then the places, then the pins as avatars, then Organisation, Settings, expand and the person at the foot. Notifications and Runs keep
their place and count in both states.

**On mobile**, the navigation is a drawer opened from ☰. There is no bottom bar. Notifications and Runs sit at
the top right of the header.

### The screen bar

Each screen has a slim bar across the top of its content. It holds the **breadcrumb** on the left (for example
*Projects / Agenthix / Project UX redesign*) and, on a screen that has a tools panel, the **layout control** on
the right ([Layouts](#layouts)). The bar spans both the conversation and the tools panel, so it is present in every layout.
Breadcrumb links navigate inside the app; they do not reload the page, as today's do.

**There is no global top bar and no global right panel.** Today's top bar (breadcrumbs, and the Notifications,
Chat and Activity icons) and its right panel are removed. Chat becomes a place in the navigation. Conversations
open as screens, never in a side panel. Voice moves into the conversation's message box.

### Look

- **Light by default**, with dark available. Today the light theme is an empty placeholder in
  `ui/src/theme/tokens.css`, so the light tokens are defined as part of this work. Colours come from tokens only.
- **Type:** Inter for the interface; JetBrains Mono (or a system monospace font) for code, logs, identifiers and
  commands only. The scale:

  | Role | Size / line height | Weight | Use |
  |---|---|---|---|
  | Display | 28 / 36 | 600 | Home's greeting |
  | H1 | 24 / 32 | 600 | Page title |
  | H2 | 18 / 26 | 600 | Section, screen header |
  | H3 | 15 / 22 | 600 | Panel and subsection title |
  | Body | 14 / 21 | 400 | Interface |
  | Reading | 15 / 24 | 400 | Conversation text |
  | Small | 13 / 18 | 400–500 | Metadata |
  | Micro | 12 / 16 | 500 | Labels, counts |

  A conversation is a reading surface: Reading size, about 720px wide, centred. A long agent reply reads like a
  clean document rather than a messaging bubble.

## Layouts

On a screen with a tools panel — a place's conversations list, or a conversation — one **layout control** in the
screen bar offers four layouts:

| Layout | Conversation (or list) | Tools panel |
|---|---|---|
| **Conversation** | Full width | Hidden |
| **Side by side** (default) | Wide | Narrow |
| **Tool focus** | Narrow, still readable | Wide |
| **Tool only** | Hidden | Full width |

These are the only combinations of each pane being closed, narrow or wide, with at most one wide. One control with
four choices replaces two linked switches and replaces dragging the panel's edge. The chosen layout is remembered
for the person. In Tool only with no tool open, the panel shows the place's facts and tools list. Mobile has no
layouts ([Project — Conversations](conversations.md#project--conversations)).

## New behaviour this design needs

| Feature | What it does |
|---|---|
| **Pins** | Stored in hq per person (item kind, item, position), so they follow the person across devices. Pin, unpin, reorder |
| **The person's layout** | The chosen layout ([Layouts](#layouts)) is remembered for the person |
| **Default avatars** | Projects and boards get generated default avatars |
