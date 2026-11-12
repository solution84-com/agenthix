# Agenthix Design System

> **Read this when working on UI in any Agenthix module.**
> It's the canonical reference for visual consistency, theme tokens, component conventions, and the lift workflow that keeps shared components in `@agenthix/ui` rather than in the app.

---

## Two Layers of Consistency

### Layer 1 — Design tokens (universal)

**Every Agenthix screen uses the same brand colors, typography, spacing, radii, etc.**

Single source of truth: [`ui/src/theme/tokens.css`](src/theme/tokens.css). It defines:

- Surfaces — `--color-surface-0`..`--color-surface-3` (neutral charcoal in dark, near-white in light, one tone step
  apart), `--color-surface-hover` (hover: one step), `--color-surface-pressed` (pressed: one more)
- Text — `--color-text-primary` / `secondary` / `muted`
- Borders — `--color-border`, `--color-border-subtle` (hairlines), `--color-border-strong` (a field's or a card's edge
  on hover)
- Accent — `--color-accent` (fills only: the main button, things switched on, the focus ring), `--color-accent-hover`,
  `--color-accent-press`; `--color-link` (the accent as text, for a real link, at 4.5:1); `--color-accent-subtle` is
  retired for choices
- Fields — `--color-field`, `--color-field-border`, `--color-field-focus`, and `shadow-field-focus` (the faint halo of
  a focused field)
- Menus and dialogs — `--color-popover` with `shadow-pop`
- Segmented controls — `--color-segment` (the strip), `--color-segment-edge` (its inset hairline, dark only),
  `--color-segment-chosen` (the raised piece) with `shadow-lift`, `--color-segment-hover` (the faint fill under a piece
  not chosen, on hover)
- Cards — `--color-card`, `--color-card-hover` with `shadow-card-hover` (a clickable card on hover), `--color-card-quiet`
  (a card that sits back: `surface-2` in dark, the card in light; `bg-card-quiet`); `shadow-composer` (the message box's
  soft lift in light)
- States — `--color-success`, `--color-warning`, `--color-danger`, `--color-danger-hover`
- Typography — `--font-sans` (Inter), `--font-mono` (JetBrains Mono)
- Chips and choices — `--color-chip` (a neutral pill: a plain fact such as *Self-hosted*), `--color-selected` (a
  chosen menu item), `--color-border-strong` (the outline of a chosen option), `--color-card` (a card on the page)
- The frame — `--color-frame-sidebar`, and `--color-frame-wash` / `--color-frame-glow` behind a page's title
- The primary button and marks — `--color-primary-from` / `-to` / `-shadow` (`shadow-primary`), `--color-mark-from` /
  `-to`, `--color-avatar-from` / `-to`
- Shadows — `shadow-pop`, `shadow-lift`, `shadow-card-hover`, `shadow-composer`, `shadow-field-focus`. Tailwind writes a
  shadow token's value into its utility, so each names a plain custom property (`--elevation-pop`, …) that a theme or
  a portal sets; set the `--elevation-*` value, never `--shadow-*`, to change one
- Radii — `rounded-md` 8 px (small marks), `rounded-lg` 10 px (controls), `rounded-xl` 14 px (cards, menus, dialogs),
  `rounded-2xl` 18 px (bubbles); `rounded-3xl` and `rounded-full` for the message box and pills; `--radius-button` 10 px
- Type — the scale below, with a heading's tracking in its token (`text-display`, `text-h1` -0.015em, `text-h2`
  -0.01em)
- Buttons — `--color-button-secondary` (the page's own tone: white in light, `surface-1` in dark, so hover is a step),
  `--color-button-danger` / `-hover` / `-press` / `-text` / `-ring`,
  `--color-button-primary-ring`, `--radius-button`, `--font-weight-button`, and `--button-primary-image` (a plain
  custom property, not a Tailwind token). hq's values reproduce its buttons exactly (no ring, no image); the Fleet
  Console's give its slate gradient primary and quiet outline secondary and danger. The rings are inset, so they take
  no room
- Shared by every portal — the state colours; Cloud's badge (`--color-cloud`, `--color-cloud-subtle`) and sunrise
  (`--color-sunrise-from` / `-via` / `-to`, `--color-on-sunrise`); a terminal (`--color-terminal`,
  `--color-terminal-text`)

### Surfaces: what sits on which

The tokens say what a surface is; this says where each one goes. It is how `ShellFrame`, `AppSidebar`, the project
menu, `DockBar` and `ScreenBar` are built, and a screen or a design draws the same.

| Layer | Surface | Light | Dark |
|---|---|---|---|
| The frame behind everything | `surface-0` | grey | darkest |
| The rail, the project menu and the chat bar (each with a `border-subtle` edge) | `surface-0` | grey | darkest |
| **The screen**: its bar and its page | `surface-1` | white | one step lighter than the frame |
| A card on the screen | `card`, with a hairline (`border`) | white | as the screen |
| **A field, a search box, a select or a picker** | `field`, with `field-border` (`FIELD`) | white, as the page | one step up, filled |
| A menu or a dialog | `popover`, with a hairline and `shadow-pop` | white | one step up |
| A row, a menu item or a button on hover; pressed; a chosen row | `surface-hover`; `surface-pressed`; `selected` | one grey step; two | one step lighter; two |

**A raised layer re-steps its own states.** In dark a menu or a dialog (`bg-popover`) is one step above the page, so
the page's hover, pressed, chosen, field, chip and secondary-button fills would equal it. Inside an element with
`bg-popover` tokens.css sets them one step above the layer (hover `#333`, pressed `#3b3b3b`, chosen `#444`, a field
`#333` with its own hairline, a chip `#333`, the secondary button the popover's own tone) and lifts the muted text so
it keeps 4.5:1 on the deepest of them. A component draws the same classes on the page and in a menu; it never sets a
fill of its own to make up for the layer. Light needs none (its popover is the page's white), nor does the Fleet
Console (its popover is its page's tone). A new raised layer takes `bg-popover`.

So a screen is **never** grey: the frame around it is. A screen that paints `surface-0` reads as the frame and loses its
edge against the rail and the menu. A grey fill is for hover, pressed, a chosen row and a chip, never for a card (see
the rule on cards below) and **never for a field**: a field is never `surface-2`, and never grey on a white page.

**Depth.** Layers differ by one tone step. A border is a hairline (`border`, `border-subtle` or `field-border`), drawn
only where two layers share a tone; two layers that differ in tone need no border.

**The accent, in three places only:** the main action (one per screen, `Button` `primary`), links (`text-link`, for
text that opens something), and things switched on (a ticked box, a chosen radio, a `Switch` that is on). It is also
the keyboard focus ring. Selection, an open state and navigation are neutral: `selected`, a segmented control's raised
piece, an ink edge. Unread and working are ink too: the "Not seen" dot, a count and the working pulse are
`text-primary`, never the accent.

**Identity marks are the exception, by name.** An agent's or a person's avatar (`AgentAvatar`'s colour from the
name, or `INITIALS_MARK`, the `avatar-from` / `avatar-to` gradient with white letters, for an initials mark), a project's initial (`PlaceAvatar`'s colour),
the sign-in brand panel and the organisation's cover banner keep their colour. They are identity, not controls, so
the three-places rule does not reach them; nothing else borrows their colour. A breadcrumb or a selected navigation item is in text tones, never `text-accent`; a file named in
a message is a link only if it opens something, and otherwise a `chip` with ink text. Radios and checkboxes take
`accent-accent`.

How they are consumed:

| Module | Mechanism |
|--------|-----------|
| `hq/` (Wasp web) | `@import "@agenthix/ui/theme/tokens.css"` in `hq/src/Main.css`, which also maps Wasp's sign-in form variables onto the tokens |
| `console-web/` (the Fleet Console's screens) | The same import in `console-web/src/index.css`, with `data-portal="fleet-console"` on `<html>` (`console-web/index.html`), which selects the Fleet Console's values |

`site/` serves no web page. Clients built on these tokens outside this
repository keep their own copy, so a change to `tokens.css` is not finished until those copies are updated too — each
in its own repository and commit.

**Rule**: If you need a new color or font weight, add it to `ui/src/theme/tokens.css` first — never inline a hex in a consumer.

**No hardcoding — ever.** This means:

| Context | Correct | Wrong |
|---------|---------|-------|
| Web Tailwind class | `bg-accent`, `text-accent`, `border-accent` | `bg-[#6366f1]`, `text-[#7c5cfc]` |
| Web inline style | `style={{ color: 'var(--color-accent)' }}` | `style={{ color: '#6366f1' }}` |
| Web CSS file | `color: var(--color-accent)` | `color: #6366f1` |

If you catch a hardcoded hex anywhere outside `tokens.css`, treat it as a bug and fix it immediately.

**One design language, a set of values per portal (U1 of the host-management boards).** Every portal uses the same
token names; hq's values are the defaults, and another portal's set is selected by an attribute on `<html>` beside
`data-theme`: `data-portal="fleet-console"` selects the Fleet Console's graphite (slate) values, light and dark. hq
carries no `data-portal`. The state colours, Cloud's badge and sunrise, the terminal and the scrim are shared, so
*Healthy*, *near capacity* and *Not reachable* look the same everywhere. A new token gets a value for hq (in
`@theme {}` and the light block) even when only another portal draws it, so the utility exists in every build. The
Fleet Console bundles its fonts (`@fontsource-variable/*`, whose families end in "Variable"), and its set names them in
`--font-sans` / `--font-mono`.

**Light / dark theming:** tokens.css holds the dark values in `@theme {}` and the light values in `:root[data-theme="light"], :root:not([data-theme]) {}`, so light is the default and `data-theme="dark"` on `<html>` switches to dark. hq remembers the choice in the browser (Settings › Profile) and applies it before first paint. Never bake dark-only assumptions into component files: no `text-white/…`, `bg-white/…`, `border-white/…`, `bg-black…` or hex colours; use the token utilities (`text-on-accent` for text on the accent colour, `bg-scrim` for a modal backdrop) so the override propagates automatically.

### Layer 2 — Shared components

**A concept hq draws in more than one place is drawn by one component in `@agenthix/ui`.** A task, a status, a
project header or a conversation looks and behaves the same wherever it appears; the way to keep it so is one
component, composed by every screen that shows it.

---

## Rules When Working on Web UI

1. **Components live in `@agenthix/ui`, not in the app.** hq composes its pages from the shared primitives (Button, InlineEdit, NativeSelect, …) and the shared domain components (KeyBadge, StatusBadge, ProjectTabBar, ProjectProgressBar, TaskMetaSidebar, …). Inventing a parallel component in hq is the path to drift — don't do it.

2. **When you change a shared component, you change it in `ui/`.** Don't tweak Tailwind classes inline in hq to "fix" a color — the next screen that uses the component will not get the fix. The single source of truth is `ui/src/`.

3. **What depends on the app goes in through prop slots.** `ui` has no Wasp or router imports, so routing, data fetching and app-specific rendering are passed in. Examples already in the codebase:
   - `InlineEdit` accepts optional `renderText` / `renderEditor` props; hq's wrapper (`hq/src/shared/components/ui/InlineEdit.tsx`) plugs in markdown rendering.
   - `CommentsSection` accepts `renderContent` and `filterComment`; hq's `TaskPanel` uses them for manifest-approval comments.
   - `ProjectTabBar` accepts a `TabWrapper` prop so the app supplies its link component.

   Pattern: keep the visual shell shared, let the app inject the differing bits.

4. **Tailwind v4 must scan `ui/src/`.** hq's root CSS (`hq/src/Main.css`) has `@source "../../ui/src"` so classes used only inside the ui package are emitted. Without it, classes like `justify-end` silently disappear from the build.

5. **A card lifts; a row fills.** A card that opens something — a bordered tile that stands on its own, such as a
   project, team, site or product card — takes `CARD_CLICKABLE`: on hover its edge firms up (`border-strong`) and a
   soft shadow shows (`shadow-card-hover`; in dark the fill goes one shade lighter, `card-hover`), pressed the shadow
   drops and the fill goes one step, and keyboard focus is the ring. It never moves and never changes colour. A card
   that only holds information has no hover at all, so the hover itself says what can be clicked. A chosen card (a
   plan or an option picked as a card) takes `CARD_CHOSEN`: a firm ink edge, no fill. A row in a list, a menu item or
   a button highlights with the grey fill (see *Selection and interaction states*). **A card for a failure** is
   neutral (`surface-2` in dark, `card` in light, with a hairline); the danger colour goes on its icon only.

6. **Inter font must be loaded.** The Fleet Console bundles it (it makes no request off its machine); hq loads it with an `@import url(…fonts.googleapis.com…)` at the top of `hq/src/Main.css` (`main.wasp.ts`'s `head` only preconnects to the font hosts). The `--font-sans` token expects Inter; without it, system fonts ruin the look.

---

## Sizes, spacing and selection

| Rule | What it says |
|------|--------------|
| Icon buttons | 36 px square on a wide screen; at least 44 px to tap on a phone. |
| Spacing | 8 px between items in a group; 16 px, with a thin divider, between groups. |
| The app's two edges | The rail on the left and the chat's bar on the right are both 56 px wide. |
| Icon-only buttons | Their name shows as a tooltip on hover and keyboard focus, and is their accessible name. |
| Open | The button whose pop-up, panel or page is open shows the selected fill, in ink (`OPENS_MENU`). An outline is never used to mark a button's state. |
| Long text in a row | Each line ends with … inside its container; nothing runs past the edge. |
| Radii | Controls `rounded-lg` (10), cards, menus and dialogs `rounded-xl` (14), bubbles `rounded-2xl` (18), the message box and pills `rounded-3xl` or `rounded-full`; `rounded` and `rounded-md` for small marks only. |
| Type | Body and small text at a line height of about 1.55 (`text-body` 14/22, `text-small` 13/20). Message text is `text-reading` alone, a whole 15 px: no `em` size inside it. Headings (`text-display`, `text-h1`, `text-h2`, `text-h3`) at 500 (`font-medium`), never 600; their tracking is in the token. Only regular and medium weights exist: `font-semibold` and `font-bold` are retired everywhere in hq and `ui`, except for Markdown rendered as the author wrote it (the guard test's allow-list). |
| Pickers in a menu or a toolbar | Plain text: a label and a chevron, no box; hover one step, pressed one more, the selected fill while its menu is open (`PLAIN_TRIGGER` for a button, `PlainSelect` and `FilterSelect` for a select). Sort, ＋ Filter, Fields, a filter not set, a board's Columns and a list's filters are all this one look. A filter in use is a neutral chip with its ✕ (`FILTER_PILL`). A boxed select is for a form field only (`NativeSelect`). |
| Cancel in a dialog | The secondary button (`Button variant="secondary"`), beside the main or the danger button. |

---

## Selection and interaction states

Selected never looks inactive, and every state is drawn one way. Decide what the thing is, then take its row; each
state has a primitive or a shared class (`controlStyles.ts`, exported from `@agenthix/ui/primitives`), and a component
that draws one of these states uses it rather than a look-alike of its own.

**Chosen, not chosen, disabled**

| What it is | Chosen | Not chosen | Disabled | Use |
|---|---|---|---|---|
| One of a small set (Task or Epic, Write or Preview, Fit or 100 %, a list's state filters) | A segmented control: the chosen piece raised (`segment-chosen`, `shadow-lift`), ink text, medium weight | Plain secondary text, no box | 40 %, no hover, no lift, no colour | `SegmentedControl` (`kind="radio"` for a value in a form, `"tabs"` for views of one thing); for a set with its own semantics, `SEGMENT_STRIP` with `SEGMENT_PIECE` and `SEGMENT_CHOSEN` or `SEGMENT_PLAIN` (as `FilterTabs`) |
| A row in a menu or a list (the sidebar, a folder tree, a picker's options) | `selected` fill, ink text and icon, medium weight | Secondary text, muted icon | 40 %, never the `selected` fill | `ROW_CHOSEN` or `ROW_ITEM`; in a menu, `MENU_ITEM_CHOSEN` or `MENU_ITEM` |
| On or off | The accent | A hairline outline | 40 % | `Switch`; a checkbox or radio with `accent-accent` |
| A card you pick | A firm ink edge (a 1 px `text-primary` border and a 1 px inset ring), no fill | A hairline | 40 % | `CARD_CHOSEN` beside the card's own classes |

A chosen and a not-chosen class set the same properties, so a component takes one or the other, never both.

**Hover, pressed, focus**

| | Controls | Clickable cards |
|---|---|---|
| Hover | One tone step (`surface-hover`), text to full ink, no change of weight or colour. A field's edge goes to `border-strong`, the main button to `accent-hover`, a link underlines | Edge to `border-strong`, `shadow-card-hover`, in dark the fill `card-hover`. No movement, no colour |
| Pressed | One more step (`surface-pressed`); the main button `accent-press` | The shadow drops, the fill `surface-hover` |
| Keyboard focus | A 2 px accent outline, 2 px outside, on `:focus-visible` only (`FOCUS_RING`; `FOCUS_RING_INSET` for a row in a menu or a scrolling list). A field shows its darker `field-focus` edge and a faint halo instead, never the accent | The ring (`FOCUS_RING`, in `CARD_CLICKABLE`) |
| Disabled | 40 % opacity, no hover, no shadow (`DISABLED`; hover classes are written `not-disabled:hover:…`; a box that holds a field shows no hover while the field is disabled). A refused control (`aria-disabled`, *Messages*) looks the same: `DISABLED` covers it, and `withoutHover` drops its hover | The same |
| Information only | — | No hover at all |

**Fields.** A text box, a select, a date, a time or a search box is `FIELD`: the field fill and its hairline, the edge
to `border-strong` on hover, `field-focus` and the halo on focus. A box that holds a field (the Markdown box, the
message box) is `FIELD_BOX`, which takes the focus of what is inside it. `hq/src/Main.css` gives every text, password
and email input the same look, since Wasp's own forms force theirs.

---

## Messages

**A dialog stops the person. Interrupt only when stopping them is the point:** a press that failed, a question before
something that cannot be undone, or typed work about to be lost. Everything else is said without stopping them. A
builder's shortcut: **if the person did not just press something, it is never a dialog**; the one exception is typed
work about to be lost. A message never sits in the content's layout as a banner or a toned box, and never pushes a
control.

### The sixteen handlers

These are all the ways a message may be said, loudest first. Take the first row whose *Used when* fits.

| # | Handler | Used when | Goes away | Piece |
|---|---|---|---|---|
| 1 | Attention dialog | A press that failed (with Try again where there is a way; never for the public demo's refusal, which is final until the reset); typed work about to be lost | Close, Try again, or its own action | `useAttention().show(…)`; for a failure handed in, `useAttentionWhen(text, { kind: 'alert' })` or `<ShowAttention kind="alert">` |
| 2 | Confirm dialog | Before a press whose effects cannot be taken back: a deletion, work stopping or starting at once, wider reach or authority, a merge others build on, a safety check removed. A question, not an error | Cancel or the action | `ConfirmDialog` |
| 3 | Toast | A press that worked whose result the screen does not show ("Copied", "Invitation sent") | By itself | `useToast()` → `toast(words)`; `ToastHost`, drawn once by the frame |
| 4 | Frame line | HQ as a whole: not answering; read-only during a move; in the public demo, at the lowest of its states, the countdown to the next reset with a link to the guide. hq's only: the Fleet Console has none | By itself when it clears | `FrameLine` (its one link: `link`), in hq's `ShellFrame`; the words come from `ShellNotices` |
| 5 | Notification | One thing a person should know or act on, raised by HQ for the right people | Handled, put away, or clears itself | The bell |
| 6 | Call bar | During a call: what the agent is doing, reconnecting, the call ending | With the call | hq's call bar |
| 7 | Nudge in place of the content | A first read that failed through its retries; a final answer (not found, not allowed); the site holding the content not answering | By itself on the next good read; Try again | `ReadFailure`, `Nudge place="content"`, `useBackgroundRead` |
| 8 | Nudge in a meta line or row | Part of what the screen shows is missing or old: a site did not answer, "Not up to date · read 10:42" | By itself when the cause clears | `Nudge place="meta"` or `"row"`, `useAttentionWhen(text, { kind: 'nudge' })`, `useBackgroundRead` |
| 9 | Line in a thread | A conversation's own failure (Stop, Retry, a card's button); voice stopping | On reload, or when the action next works | `Nudge place="thread"` |
| 10 | Message box "Not sent" | A message that could not be sent; the words stay in the box | When it is sent | The message box |
| 11 | Refused control | Known before the press | When the reason clears | `Button`'s `refusal`, `useRefusal`, `Refused` |
| 12 | Field error | A form field's value refused, under the field (it may push the fields below it); any other failure of the same Save is handler 1 | When the field is fixed | `FormField`'s `error` |
| 13 | Drawn in the thing | The failure is part of the record: a failed reply, a held task, a run's failed step | Kept | — |
| 14 | Spoken | In a call, where the person may not be looking | — | The voice |
| 15 | Quiet retry | A read the screen makes on its own failed | The next good read | The query client's default; `retryRead` |
| 16 | No message | The screen already shows the result | — | — |

`kind` is required on `useAttentionWhen`, `ShowAttention` and the Fleet Console's `Notice`: `'alert'` is handler 1,
`'nudge'` handler 8 (or 7 with `place: 'content'`), so every message says how it is said.

### The quiet retry

One policy for every read a screen makes on its own (opening, polling, refetching, catching up after a reconnect,
more on scroll): up to three retries after the first failure, at about 1, 2 and 4 seconds, each ±20 %; none on a final
answer (400, 401, 403, 404, 409, 422); a hidden tab waits and retries when it is shown. It is hq's query default
(`backgroundRetry`, `backgroundRetryDelay`); a query with a retry rule of its own keeps it; a hand-written read or a
poll uses `retryRead`. **Nothing is shown during the retries.** After them, `useBackgroundRead(query, { what })`
decides: nothing on screen yet → the nudge in place of the content (`failedWithoutData`), a final answer in its own
words without Try again; data on screen → keep it, and say nothing until it is over a minute old (or two poll
intervals, whichever is longer), then "Not up to date · read HH:MM · Try again" in the meta line. A good read clears it.
While the frame line says HQ is not answering, each screen's own "could not be read" nudge is held back
(`ReadNudgesHeld`). A read HQ answers from an Execution Site is not retried by the page when the site did not answer,
since HQ already waited for it (`siteReadRetry`, hq's query default); that failure is said at once, in the site's own
words (`useSiteRead`). The signed-in person is the one read hq never makes again on its own (`readsOnItsOwn`): Wasp's page
wrapper replaces the whole app with an error box when it fails, so a refetch while HQ is away would stop the person.

### How a nudge looks

One line of small secondary text: a small outline icon, the words, and at most one plain-text action ("Try again",
"Which", "Dismiss"). No box, no fill, no state colour; `role="status"`, so a screen reader hears it without being
interrupted. The icon and the action flow inline with the words, so it wraps as one sentence and the action never
breaks across lines. It sits in a slot the screen has anyway: in place of the content (a title line, the reason and a
Try again button, replacing the empty state, never beside it), a page's or section's meta line (a line of its own under
the count, which `reserve` keeps at the same height when empty), a row's detail, or a row after a thread's last
message. Shown once per cause, its words changed in place when the cause changes. A nudge never becomes a dialog by
itself or on a timer.

### How a toast looks

A few words, no buttons, at the bottom centre above anything at the bottom of the screen (while a conversation is docked, hq
centres it over that conversation's column, above its message box, through `--toast-left`, `--toast-right` and
`--toast-offset`; the Fleet Console lifts it with `ToastHost`'s `offset`); never over a control. It goes by itself after about four seconds and waits while
hovered or focused; one at a time, a new one replacing the last; `role="status"`.

### Not allowed

A toast for an error or for anything to act on, a snackbar with buttons, a banner in the page flow, a toned notice box,
an inline alert line (`role="alert"` outside the dialog), a dialog for a read the screen made on its own or for a site
that did not answer, and the browser's `alert`, `confirm` and `prompt`. A refused control is `aria-disabled`, never
`disabled`: a `disabled` control shows no tooltip and catches no press.

---

## Component Lift Workflow

When extracting an existing hq component into `@agenthix/ui`:

1. **Add the component to `ui/src/<area>/<Component>.tsx`** with a data + callbacks API. No Wasp imports, no react-router imports — let consumers pass `Wrapper` / `TabWrapper` / `Link` props for routing.
2. **Export it from `ui/src/<area>/index.ts`** and (if it's a primitive) from the relevant subpath in `ui/package.json`'s `exports` map.
3. **Refactor the originating screen** in the same logical commit:
   - Either replace inline JSX with the lifted component, or
   - Convert the local file into a thin re-export shim from `@agenthix/ui` (preferred when the local path was widely imported).
4. **Then switch any other screen** that drew the same concept its own way to the lifted component.
5. **Commit it as one change** with the lifted component, its consumers and their tests together.

---

## The guard test

`ui/src/__tests__/designGuard.test.ts` reads every `.ts` and `.tsx` source file under `ui/src`, `hq/src` and
`console-web/src` (tests and `__modelchecks__` excluded) and fails, naming file and line, on a retired pattern that can
be matched as text: `bg-accent-subtle` and `bg-accent/<n>`, `border-accent`, `focus:` and `focus-within:` accent edges
and rings, `disabled:opacity-` other than 40, `shadow-2xl`, `font-semibold` and `font-bold`, an `em` font size, a hex
colour, a palette colour class (`bg-red-500`, `text-white`), a raw `<select>` (the select is `NativeSelect` or
`PlainSelect`), an arbitrary text size (`text-[11px]`: the type scale), `hover:` on a line that also carries `DISABLED`
or `disabled:` (the hover is written `not-disabled:hover:`), and `bg-accent` with `text-on-accent` (a hand-copied main
button: `BUTTON_PRIMARY`), `role="alert"` outside the attention dialog (an inline alert: the few that stay, a field's
error among them, are listed in the test by why), the retired message helpers (`RefusedAction`, `ErrorDialog`,
`FormError`, `ErrorLine`, `readFailure`, the old confirm dialogs) by name or by file, the browser's `alert`, `confirm`
and `prompt` (a function of the file's own named `confirm` is not one), a `useAttentionWhen`, `ShowAttention` or
(in the Fleet Console) `Notice` without a `kind`, and a site's silence (`UnansweredSitesNotice`, `SilentSitesLine`)
drawn as a dialog. `console-web` keeps its own palette, so only the hex and palette rules apply there. A match
that stays on purpose is on the `ALLOW` list in the test, with the reason (a data mark, a ticked box, Markdown the
author wrote); keep that list short. An entry nothing needs any more fails the test.

---

## When You Find Drift

Treat it as a bug. Either:

- **Layer 1 drift** (a hardcoded color/font somewhere): find the canonical token in `ui/src/theme/tokens.css` and switch the offending code to use it.
- **Layer 2 drift** (two screens drawing the same concept differently): lift the offending JSX into `@agenthix/ui` and refactor both screens to use it.
- **Intentional difference**: document why in the relevant component's file header. Without an explanation it'll get "fixed" on the next pass.

---

## Component Inventory

Current contents of `@agenthix/ui` (canonical; hq consumes them):

**`ui/src/primitives/`** — generic atoms:
- `Button` (`primary` the one main action, `secondary`, `ghost`, `danger`; each with its hover and pressed step, 40 %
  when disabled, `FOCUS_RING` from the keyboard; `refusal` in place of `disabled` when the reason is known: *Messages*), `Input`, `Textarea`, `Select` (deprecated: draws `NativeSelect`), `NativeSelect` (the one select: no
  operating-system look, a field, the app's chevron, 36 px / 44 px on a phone), `DateField` (a day or a day and time drawn as every field, written the app's
  way by `dayLabel`: "10 Apr", the year only when it is not this year), `TimeField` (a time of day the same way, 24-hour,
  "09:00", with no operating-system clock icon)
- `SegmentedControl` (with `SegmentOption`): one of a small set, as a radio group or as tabs; one Tab stop, the
  arrow keys, Home and End; disabled as a whole or piece by piece, and a piece refused for a reason (its option's
  `refusal`: greyed, reached by the arrows without being chosen, a press opens the dialog). `PrioritySelector` and the
  file views' `ViewTabs` are drawn by it
- `Switch`: on or off, the accent while on and a hairline outline while off; on a phone its hit area grows to 44 px tall;
  `refusal` in place of `disabled` when the reason is known (`AutomationSwitch` in `ui/src/projects/` is the same component under its old name)
- `PlainSelect`: the plain-text picker for a menu or a toolbar, a label and a chevron with a hover fill and no box (the
  chat box's model picker, the model list's filters; `toolbar` gives it the row's 36 px). A form field is a `NativeSelect`
- `BUTTON_PRIMARY`, `BUTTON_SECONDARY`, `BUTTON_GHOST` and `BUTTON_DANGER` (`buttonStyles.ts`): the button looks as
  class strings, for a link or a bare element that cannot be a `Button` (an icon button takes `BUTTON_GHOST`). `Button` draws its variants from the same strings
  (`BUTTON_VARIANT`), so they cannot drift; the caller adds radius, size and weight. Never copy a variant's classes into a
  component of your own
- The shared state classes (`controlStyles.ts`), one per state in *Selection and interaction states*:
  `CONTROL_HEIGHT` (`h-9`, `max-sm:h-11`); `FOCUS_RING` (the keyboard ring outside the edge) and `FOCUS_RING_INSET`
  (inside it, for a row in a menu or a scrolling list); `DISABLED` (and its `aria-disabled:` twins) and `withoutHover`; `FIELD` and `FIELD_BOX`; `PLAIN_CONTROL` (a picker
  in plain text: its colours and steps, the caller's height); `ROW_ITEM` and
  `ROW_CHOSEN`; `CARD_CLICKABLE`, `CARD_CLICKABLE_IN_GROUP` (a card inside the link that opens it, which takes
  `FOCUS_RING`) and `CARD_CHOSEN`; `SEGMENT_STRIP`, `SEGMENT_PIECE`, `SEGMENT_CHOSEN` and `SEGMENT_PLAIN`; and
  `SCROLL_EDGE_FADE`, the fade at the right edge of a row that scrolls sideways on a phone
- `PopSheet`, `MenuHeading`, `SortMenu`, `MENU_ITEM`, `MENU_ITEM_CHOSEN`, `OPENS_MENU`, `PLAIN_TRIGGER` (`Menus.tsx`): the one menu
  (on `popover`, under its button, opening toward the side that keeps it in its panel; a sheet with a handle on a
  phone), its heading with the way back, the one Sort control ("Sort: <order>", the chosen order a chosen row with a
  check), a menu's row and its chosen row, the selected fill a button shows while its menu is open, and the button that
  opens a picker's menu in a toolbar. `AddFilterMenu` and `FILTER_PILL`: the one ＋ Filter (a plain-text trigger,
  "Filter by", then a kind's choices with a way back) and the chip of a filter in use; the task lists and the Runs
  history use it.
- `Glyphs.tsx`: the few icons a primitive (or the file frame's header) draws inline (lucide's own paths), since a second lucide copy breaks hq's tests
- `SearchField` (the one search box of a list: a field, 36 px) and `FilterSelect` (a list's filter: a `PlainSelect`
  the row's height), and `ViewHeaderRow` (a view's one header row — back, title, action — drawn in the panel's header slot when the panel provides one through `ViewHeaderContext`)
- `INITIALS_MARK` (`Avatar.tsx`): the one look of an initials mark, identity in the avatar gradient; never `bg-accent`
  with `text-on-accent`, which the guard test reads as a hand-copied main button
- `AttentionDialog` and `useAttention` (`AttentionDialog.tsx`, with `Attention` and `AttentionAction`): the one
  dialog for what needs the person's attention (*Messages*). Its title defaults to "That did not work"; `actions` are
  its own buttons (secondary unless given a `variant`), each closing the dialog before it runs; Try again is the main
  button. It is drawn at the body (a portal carrying `data-attention`) and its buttons are `type="button"`, so it can be
  opened from inside a form or a menu; it opens over a form dialog, and Escape closes only it. hq's
  `shared/components/AttentionDialog.tsx` re-exports it
- `useRefusal` (with `Refusal`): a control refused for a reason known in advance. Its `props` (`aria-disabled`, the
  reason as the accessible description, a press that opens the dialog in place of the control's `onClick`) spread
  onto any control; its `tooltip` goes in a wrapping `Tooltip`, and its `dialog` is rendered once. `Button`'s `refusal`
  is built on it. `withoutHover` (`controlStyles.ts`) drops a control's hover and pressed steps while it is refused,
  since `not-disabled:` does not catch `aria-disabled`
- `ConfirmDialog` (`ConfirmDialog.tsx`): the one confirm dialog (handler 2) — title, `description` or children, Cancel
  and `confirmLabel` (named for what it does), `destructive`, `busy`; Escape and a press outside are Cancel
- `@agenthix/ui/attention`, the declarative forms, one per job, for hq, ui and the Fleet Console alike (*Messages*):
  `useAttentionWhen(text, { kind, place, title, retry, actions, onClose })` says a failure handed to a component —
  `kind: 'alert'` opens the dialog when it becomes words (and again when they change or come back), `kind: 'nudge'`
  returns the nudge to render where it sits; `ShowAttention` is the same as a component, for an early `return` (`text`
  takes words, a node or an `Error`; `onClose` lets a caller clear the state that held it); `Nudge` (`place`:
  `content`, `meta`, `row`, `thread`); `ReadFailure` (`retry`, or `final` for a final answer) in place of the content;
  `useBackgroundRead` (`{ nudge, stale, failedWithoutData }`) and `ReadNudgesHeld`; the retry policy (`isFinal`,
  `backgroundRetry`, `backgroundRetryDelay`, `retryRead`); `ToastHost` and `useToast`; `FrameLine`; `Refused` greys a
  group of controls that cannot take a `refusal` of their own (a radio group, a select)
- `FormField`, `Modal` (alias `ModalDialog`; on `popover` with `shadow-pop`; `closeLabel` draws the ✕ at its title's right, which the first focus skips so its tooltip waits for hover or Tab; `titleLead` goes before the title, such as an agent's avatar), `Avatar`, `PlaceAvatar` (a project's initial or a board mark on a colour derived from its id), `Tooltip` (the name of an icon-only control, on hover and keyboard focus; `wrap` lets a reason longer than a name, such as a refused control's, run onto more lines)
- `InlineEdit` (with `renderText` / `renderEditor` plug points)
- `MarkdownBox` (with `applyMarkdownFormat`): the one Markdown editor, a `FIELD_BOX` with Write and Preview as a
  `SegmentedControl`, everywhere text is written (a task's description and comments, an agent's instructions, a new task's description, a routine's instructions in phase 8): Write and Preview tabs, the formatting toolbar, a footer slot; takes `renderPreview` so the app draws the preview; `defaultTab="preview"` reads as the text will until clicked into, which opens Write
- `EmptyState` (`variant="inline"`: the one empty-list line — a dashed outline in the flow where the list would be,
  saying why it is empty and what to do, with an `action`; every empty list uses it, never a hand-drawn dashed box), `StatCard`
- `Scorecards`: the one row of counts at the top of a list or a live view (Tasks, Your tasks, a Workroom, Workrooms) — a
  label, the number and a line under it; a card that filters is a button, a clickable card whose chosen one takes the
  ink edge, one that only counts is not; on a phone the row scrolls sideways, fading at its edge
- `FilterTabs`: the one row of tabs that narrow a list to one state, each with its count (the Runs panel's filters, the
  Runs history's All · Running · Waiting · Needs you · Finished, a run's tool calls), drawn as a segmented control
  (the pressed one raised), tall enough to tap on a phone, the strip scrolling sideways there
- `PrioritySelector`, `SiteSelector`
- `StatePill` (a state in words, its tone only repeating them: healthy, warning, danger, neutral) and
  `HostingBadge` with `hostingLabel` (where a site runs, *Self-hosted* or *Agenthix Cloud*, the same in every portal
  — U3); both used by the Fleet Console today
- `UnansweredSitesNotice` (presenter — takes composed copy; the app writes and tests the words)

**`ui/src/tasks/`** — task-domain composites:
- `KeyBadge`, `StatusBadge`, `PriorityBadge`, `RunStateBadge` (renders nothing when no run is pending; `wait` is its tooltip)
- `RunAvatar` (D18): the one avatar that shows a run, for an agent or a person — the avatar is its child, and it draws
  the ring from `core`'s execution state: Waiting a thin dotted ring, Running a turning ring (still when motion is
  reduced), Needs you a full ring with a dot, Failed a full ring with a "!", Not started and Finished none. The words
  (`runAvatarWords`: "Writer · Running · 1 min") are its tooltip and accessible name. It keeps the ring's gap as its
  margin, so nothing moves when a ring comes or goes. Used on board cards, task rows and the task header; no screen
  draws its own ring
- `TaskTypeMark` (`taskTypeIconName`, `TASK_TYPE_ICON_NAMES`): a task type's icon, named by the type — Task a clipboard
  with a list, Epic a diamond, and the custom icons `bug`, `feature`, `support`; a name it does not know is drawn as
  Task. `inline` before a key or title, `tile` (a 24 px grey square) where types are listed
- `AgentPicker`, `CommentsSection` (its boxes are `MarkdownBox`), `TaskMetaSidebar`
- `TaskFilterBar` (with `EMPTY_TASK_FILTER`, `isFilterActive`, `applyTaskFilters`)
- The task lists (a project's Tasks and Your tasks): `TasksListHeading` (a list page's title, a line under it and its
  actions, as Members draws it), `TasksScorecards` (by task state, Backlog first, then Late and No agent; never a run
  state; drawn by `Scorecards`), `TasksToolHeader` (one toolbar row: search, filter chips, ＋ Filter, `TasksFieldsMenu` and Sort; on a phone the
  chips take the line under it), `TasksList` (the header of the chosen columns, the lines, Your tasks' breaks by due
  date, ticking, and dragging a line's handle to change the rank) and `TaskListRow` (the type's mark and title, then
  priority, epic, sprint and the quiet line; wide, the chosen columns beside it; narrow, the column, the agent and the
  date on line 2; no run words: the agent's `RunAvatar` ring); the cells in `TaskListCells.tsx` (`ColumnChip`,
  `TaskSprintTag`, `EpicFact`, `AgentMark`, `DueMark`); `TasksSelectionBar` (the actions on ticked lines, floating at
  the list's foot on a wide screen) and `TasksPickDialog` (one value for every ticked task). The words, orders, filters
  and columns are pure, in `taskListWords.ts` and `taskListColumns.ts`. The marks every task screen shares, in
  `TaskMarks.tsx`: `ProgressRing` (an epic's progress, `sm` on a row, `lg` on the epic's page), `EpicBadge`,
  `PriorityFlag`
- `TaskPanel` (presenter — takes `detail: TaskDetailState`, `SessionSlot?`, `renderCommentContent?`)
- `CreateTaskModal` (presenter — takes `agents`, `boards`, `onSubmit`)
- `TaskScheduleEditor` (presenter — a task's one-off start time; takes `schedule`, `canEdit`, `onSave`, `onClear`)
- `PRIORITY_COLORS`, `PRIORITY_SELECTED_CLASSES` constant exports; `runStateLabel` / `runStateClasses` — the one label table for a task's run state (`tasks/runState.ts`), used everywhere a run state is shown; `runWaitText` — the words for why a queued or throttled task has not started

**`ui/src/projects/`** — project-domain composites:
- `ProjectHeader`, `ProjectStats`, `ProjectCard`
- `ProjectProgressBar`, `ProjectMembersList`
- `ProjectTabBar`
- The Automation tool's presenters: `AutomationOverview` (status with Pause or Resume, Now, the Routines and Rules buttons, Later), `AutomationRules` (the agents' switch, the limits with the org's maximum, the columns that start work) with `AutomationLimitsForm`; types and `whenLabel` in `AutomationTypes.ts`
- The Files tools' presenters (`FilesToolParts.tsx`): `FilesViewHeader`, `FileRow`, `TopicRow`, `WorkspaceCard`, `FileFact`, `FilesGroupHeading`, `FilesToolNote`, `FilesQuietLine`; the pure list rules in `fileListing.ts` (`kindAndSize`, `changedLabel`, `newestFirst`, `groupByRecency`, `filterTopics`). `src/sessions/mention.ts` carries Mention to the open message box
- The Tasks tool's presenters: `TasksList` (one list in three groups, two lines per task narrow and a table wide, by container width), `TasksToolHeader` (Backlog and Done with counts, search, filters), `NewTaskRow`, `BacklogList` and `DoneList`, `TaskInTool` with `TaskFact` and `OverflowMenu` (one task, its facts beside or below), `TaskSessionView` (a task's transcript with each run a divider, and the box that sends into it); the grouping, ordering and wording are pure functions in `taskGroups.ts` and `sessionRuns.ts`
- **The Boards tool's presenters** (`ui/src/board/`, adr-0097):
  - `BoardsList` with `ColumnBar` and `SprintTag` — a project's boards, Project Tasks first, each with its column bar, counts, current sprint and what needs you
  - `BoardBox` — an opened board's box: the sprint, past sprints, Finish sprint, Rename sprint, the Columns · Timeline switch; `FinishSprintForm` (nothing chosen until a destination is picked), `NewBoardForm`, `EditColumnsModal`
  - `BoardColumnsView` — the columns in one of three layouts by width: `KanbanColumns` (dnd-kit, side by side), `StackedColumns` (groups, Done folded), `ChipColumns` (a phone, one column at a time); `ColumnHeader`, `BoardCardView`, `ShowAlsoChoices`; `ColumnMenu` (every column's ⋯: starts work, the Backlog's Show also… and Hide, Done's Show or Hide) with `useBacklogFold` (the Backlog folded away, remembered per board in the browser)
  - `RoundLineBar` — one line above the columns of a board whose project throttles: the round in progress, or the next
  - Pure rules in `cardState.ts` and `columnsModel.ts`
- **The Timeline's presenters** (`ui/src/timeline/`, adr-0098): `Timeline` with `TimelineToolbar`, `TimelineRows`, `TaskBar` (a task's plan as its bar, ▶ its start, its runs as slices; dragging changes only the plan) and `TimelineAgenda` (the narrow and phone view); pure rules in `layout.ts` (the chart's range, its width and scroll position), `rows.ts` and `agenda.ts`

**`ui/src/files/`** (`@agenthix/ui/files`, adr-0155) — the renderer boundary:
- `FileFrame` — the frame around every file shown: the one header, the facts line, and every state in words (`frameStates.ts`); opened or embedded (a card for a kind whose renderer does not embed). Takes hq's open answer and callbacks
- `FrameHeader` — the one header of a file wherever it opens: ‹ back named for where the person came from, ▤ (the folder beside the file, in the Files tool), the folder line over the name, Download (a link through the relay, greyed only when no byte can be fetched), Full screen, ⋯ (Copy link, Copy path, Show in Files, Mention), ✕ where closing stays on the page, and a word after an action under the actions; in a narrow frame the name takes a line of its own. Its icon buttons are `FRAME_ICON_BUTTON`, the size and outline of ⋯
- The renderers' own controls, in `renderers/ViewControls.tsx`: `ViewTabs` (the one switch between a file's views: Read · Source, Tree · Text, Fit · 100%, a `SegmentedControl` as tabs) and `ToggleButton` (Wrap: the selected fill while on). `CodeSurface` draws text with line numbers for the code, Markdown Source and invalid JSON; `TextLines` draws any other text a line at a time, no line longer than 1,000 characters in one piece. `SCROLL_MORE_FADE` (`controlStyles.ts`) is the edge fade at any width, drawn only while more lies to the right
- The registry (`RENDERERS`, `createRegistry`) and the `Renderer` entry: a renderer is given the file's facts and its bytes, and reports one state; each lives in `renderers/<name>/`. `createFileBytes` reads a ticket link by range, with no credentials, aborted when the renderer unmounts

**`ui/src/sessions/`** — session/chat-domain composites:
- `ChatPanel` — width-responsive master-detail chat panel (session list + chat view, two-pane or single-pane by width)
- `PanelSessionList`, `PanelChatView` — the two panes `ChatPanel` composes; also usable standalone
- `PanelActivityList`, `PanelActivitySession` — the running-agents activity panel and its single-session detail view (read-only)
- `SessionTranscript` — a session's record drawn as a conversation draws it (who replied and when, the work line, approvals, failures, icons under each reply) with the run in progress live; every view of a run's conversation uses it, passing only the actions it offers. `SessionUsageButton` — the total usage behind a header icon
- `TaskSessionSection` — a task's execution/session card (run state, run count, last message)
- `SessionComponents` — `AgentAvatar` and `formatTime`
- `RequestCard` — the one card for a request for a person's okay, wherever it is answered (a conversation, a task's page, its session): the request in plain words, Approve and Deny (or the kind's own buttons), and once answered the outcome in place (*You approved it · 06:31 PM*). `ManifestRequestCard` draws a run's request on it
- `ManifestApprovalBubble`, `ManifestApprovalComment` — a run's request on a task's page and in a task comment, each as `ManifestRequestCard`
- `ClosedConversationNotice` (presenter — takes `ClosedConversationNoticeCopy`; the app composes the words, for the same reason as `UnansweredSitesNotice` above) — what a closed conversation shows in place of its message box (adr-0076)
- `socketHooks` (`useSiteSocketListener`, `subscribeToSession`, `subscribeToTask`, `subscribeToBoard`), `useStreamingText` — session-panel hooks and helpers, not components

### `@agenthix/ui/products`
| Component | Description |
|---|---|
| `ProductCard` | Grid card presenter — name, slug, status badge, project count |
| `ProductsListContent` | Grid + empty state + optional "New Product" create modal |
| `ProductDetailHeader` | Name, slug, status badge, optional vision statement |
| `ProductDetailTabs` | Tab nav — Overview, Settings |
| `ProductOverviewTab` | Projects list + task health bar + create/assign project modals |
| `ProductSettingsTab` | Edit form (name, slug, description, vision, status) + delete confirmation |
| `ProductDetailContent` | Composes header + tabs + content |

### `@agenthix/ui/programs`
| Component | Description |
|---|---|
| `ProgramCard` | Grid card presenter — name, status badge, project count |
| `ProgramsListContent` | Grid + empty state + optional "New Program" create modal |
| `ProgramDetailContent` | Full program detail — edit, delete, project management inline |

**`ui/src/agents/`** — agent-domain composites:
- `CreateAgentModal`, `ModelSelect` / `ModelOptions` (with `modelOptionLabel`, `filterModels`, `groupByProvider`), `sanitizeHandle`
- `AgentManageHeader` and the manage tabs: `ConfigurationTab`, `PromptTab`, `SkillsTab`, `VoiceTab`
- `AgentPermissionsView` (`permissions/`), `PermissionsSummary`, `BypassedMark`; the pure rules in `permissionsModel.ts`
- `AgentOverrideForm`, `ProfileCard`
- A project's agents: `ProjectAgentView`, `ProjectAgentEdit`, `ProjectAgentRemove`, `ProjectAgentAssign`; `nowLine` (`agentNowLines.ts`)
- `MODEL_PRICING`, `formatCost`, `calculateCost` (`aiMetrics.ts`)

hq-only shared pieces (`hq/src/shared/components/`), kept out of `@agenthix/ui` because only hq draws them:
- `NeedsYouBar` and `NeedsYouBars`: what waits for the person, as bars at the foot of a Workroom or Runs card — the
  alert, the agent's `RunAvatar` with its Needs-you ring (Failed for a failed run), the key and title, what it waits for,
  and one outlined answer
- The Workroom's pieces (`projects/workroom/`): `AgentCard` (an agent's scorecard: the band, then Now · In line ·
  Finished today, then its Needs-you bars), `AgentCards` (the cards, dragged to reorder; one per screen on a phone), and
  the Start and Stop every run dialogs

**`ui/src/people/`** — person-domain composites:
- `PersonAvatar`, `PersonProfileCardView`
- A project's people: `ProjectPeopleList`, `ProjectPersonView`, `AddPeopleView`, `RemovePersonView`, `ProjectPreviewView`
- Pure rules: `isLastAdmin` (`lastAdmin.ts`) and the wording in `personLines.ts` (`orgRoleLabel`, `projectRoleLabel`, `personStatusLine`, …)

**`ui/src/voice/`** — voice calls:
- `VoiceCallProvider` / `useVoiceCall`, `useVoiceSession`
- `VoiceControlPanel`, `VoiceButton`

**`ui/src/brand/`** — `Logo`, `Logomark`, `Wordmark`

**`ui/src/dashboard/`** — `StatsCards`, `RecentProjectsList`, `TopAgentsList`, `AgentCostList`, `FinancialOverview`,
`TaskOverviewBar`, `ActivityFeed`, `RunsOverview`, `SystemLoadIndicator`, `SiteFilterBar`, `DashboardLayout` /
`DashboardCard`. Exported as `@agenthix/ui/dashboard`, but nothing in hq imports it today.

When adding a new component here, add it to this list.

---

## Pointers

- Theme tokens: [`src/theme/tokens.css`](src/theme/tokens.css)
- Component sources: [`src/primitives/`](src/primitives/), [`src/tasks/`](src/tasks/), [`src/projects/`](src/projects/), [`src/agents/`](src/agents/), [`src/people/`](src/people/), [`src/sessions/`](src/sessions/)
