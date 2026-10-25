# Part 5 · Screens

The Knowledge tool becomes pages in sections that people browse, edit and restore, the same at every level; a conversation shows the
places it reaches. Boards: *U1–U5*, *C1–C3*. Each board shows desktop and phone, in light and dark.

## Browsing knowledge (U2)

In the Files group of a project and of Your space, as today. A tree of the place's sections beside the selected
section's pages, listed as items:

- **A row**: title, description, tags, the team's properties (a decision's `status` and `date`), when it changed and
  who — a person, or "*agent*, asked by *person*".
- **Filters**: Tag, and one for each property the section's pages use. Nothing about decisions is built in.
- **Needs fixing** gathers pages with problems, shown in place of the description, titled from the file name until
  they have a title.
- **All pages** lists every page, newest first; **Recently deleted** opens U4's list.
- **New page** opens the editor in the section shown, with the properties its other pages use already offered; ⋯ has
  New section. For people who may change the place's files.
- On a phone the tree becomes one level at a time.

The heading "Topics" of today's tool becomes "Pages".

## A page (U3)

- Reads like a guide page: the title, description, tags, properties and who changed it last (linked to the
  conversation or run it happened in); the text; **On this page**, its headings, beside it.
- **Links** between pages open the linked page; an `org:` link opens it in the organisation's Knowledge. A broken link
  is shown as a problem, with where the page went if it was moved.
- **Linked from**, under the text: the pages that link here.
- **Edit**, **Move** and **Delete** for people who may change the place's files; others see Mention, History and
  Download.
- **The editor**: Title, Description and Tags as fields, **Properties** as name and value rows (offered from the
  section's other pages), and the text in Markdown with Write and Preview. Save writes the page with its front matter
  and goes through the gate; a problem shows on its field.
- **A conflict** ("Kernel saved this page 1 minute ago") keeps the person's text, with *See their change* and *Save
  mine over it*.

## History and recently deleted (U4)

- **History**: versions newest first, each with when and who; the change it made, line by line, and to title,
  description, tags and properties; **Restore this version** (saved as a new version) and **Delete this version
  permanently**.
- **Recently deleted**: deleted pages with who deleted them and when they will be removed; **Restore** and **Delete
  permanently**.

## Organisation knowledge (U5)

A Knowledge entry in the organisation's own area, beside People, Teams and Projects, with the same tool inside. Every
member can read it; organisation admins see New page, Edit, Move and Delete. From inside a project, search has a
switch, *This project · Organisation · Both*, defaulting to Both, each result marked with where it is from.

## Correcting a page by asking (C1)

The person names the page ("the Release process page is wrong: …"); the agent finds it with `search_knowledge` and
changes one passage with `edit_knowledge`. The conversation shows **Updated page · Release process** as a work step with
what changed in one line, **See change** (History at that version) and **Undo** (restore the version before it). No
approval step: the person asked, and every change can be undone.

| The person says | The agent |
|---|---|
| "The release process page is wrong: …" | Changes the page |
| "Write down how we deploy, for the team" | Writes a new page |
| "I prefer short answers" | Remembers it (memory) |
| Nothing; the agent noticed something | Remembers it; may offer to add it to the place's knowledge |

## Asking about Agenthix itself (C2)

"Look through the files in my space" maps to Your space through the glossary, with no question back. "Where do I add a
model key?" is answered with a link to the screen in hq, not to the website, so it is always this version's screen. The
work step names the `platform:` page used; what the person may do follows their role, as the guide says.

## Places in a conversation (C3)

- **The header**: *Places: Your space · Website rebuild ✕ · + Add place…*. The conversation's own place comes first and
  can't be removed.
- **Add place…** lists only places the person can access; choosing one asks once (part 4). Removing takes effect from
  the next turn.
- **The search work step** names the places it covered.
- **When the lead needs a place**, its card reads *Add a place to this conversation: Shop*, with *Not now* and *Add
  Shop*; only the person in the conversation sees the buttons.
- On a phone the header shows "2 places", and a tap opens the list as a sheet.
