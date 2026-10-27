# Part 2 · The renderer boundary and the Files UI

What Agenthix draws, and what a renderer draws. Boards: *4 · The renderer boundary*, *F1–F4*, *T3 · Embedded*.

## Choosing the kind

One function, in `core`, so hq and the page agree: the name gives a content type, then the site's look at the first
bytes says text or binary. It returns a **kind**: `markdown`, `text`, `code` (with a language), `json`, `csv`, `image`,
`pdf`, or `none`. It replaces `classifyFileContent`'s closed union and its JSON content path.

## The registry and the contract

A list of renderers, each declaring the kinds it draws and where it runs, looked up by kind — the pattern hq uses for a
place's tools (`PlaceTool { id, label, render }`). Adding a format is adding an entry.

```ts
// core: what every renderer is given
interface FileFacts {
  name: string; size: number; version: string; contentType: string
  kind: Kind
  language?: string                       // code only
}
interface FileBytes {
  link: string                            // the ticket link on the relay
  read(limit: number): Promise<{ bytes: Uint8Array; whole: boolean }>
  range(start: number, end: number): Promise<Uint8Array>
}

// ui: one entry per renderer
interface Renderer {
  id: string
  kinds: Kind[]
  runs: 'page' | 'frame'
  previewLimit: number                    // part 6, caps
  embeds: boolean                         // draws when embedded; otherwise the frame draws a card
  render?(props: { facts: FileFacts; bytes: FileBytes; mode: 'opened' | 'embedded';
                   report: (r: Report) => void }): ReactNode
  viewer?: string                         // a framed renderer's page on the files address
}
type Report =
  | { state: 'ready' }
  | { state: 'partial'; shown: number }
  | { state: 'failed'; reason: 'unreadable' | 'too-large' | 'changed' | 'unavailable' }
```

- **In:** facts and bytes. No hq API, no person, no store: a renderer can only draw.
- **Out:** one report, which the frame turns into words. A renderer never draws its own error.
- **Two modes:** *opened* fills the area, inside the frame; *embedded* sits inside a page or a message, bounded, with
  no controls.
- **Lifecycle:** mounted when the file opens, unmounted when it closes or changes; reads are cancelled on unmount.
- **Where it runs:** text-like kinds **in the page**, drawn by trusted code as text, never as HTML. Active kinds **in a
  frame** loaded from a viewer page on the files address, which reports by `postMessage`, checked against that origin.

## The renderers

| Renderer | Kinds | Runs | Reads at most | Phase |
|---|---|---|---|---|
| Markdown | markdown | page | 1 MB | MVP: today's, moved behind the boundary; Read / Source |
| Text | text | page | 1 MB, wrapped | MVP |
| Code | code | page | 1 MB; highlighted to 512 KB (`react-syntax-highlighter`, already a dependency) | MVP |
| JSON | json | page | 5 MB as a tree; as text beyond | MVP |
| Table | csv | page | 10,000 rows, 5 MB | MVP |
| Image | image (png, jpg, gif, webp, avif, svg as an image, ico, bmp) | page, embeds | 20 MB | MVP |
| PDF | pdf | frame (pdf.js in a viewer page on the files address) | 50 MB, by range | MVP; needs a files address |
| YAML, HTML source | code | page | 1 MB | Stretch |
| Diff | diff | page | 1 MB | Stretch (part 4) |

PDF uses pdf.js in a viewer page of Agenthix's own, not the browser's built-in viewer: browsers refuse their own viewer
inside a sandboxed frame, and pdf.js reads by range and reports like any renderer. If it were ever tricked, it runs
where there's no hq session.

**Admin-managed renderers** (designed, not built): a renderer an organisation's admin adds is a framed renderer — a
viewer page on the files address, never code in hq's page — declaring its kinds or content types, speaking the same
contract by `postMessage`, seeing one file's bytes for one ticket's life. An admin chooses which wins for a kind. Not
in this epic: a marketplace, renderers run on a server, editing.

## The frame (F2)

Today's layout is kept: the place's panel, the folders, the open file. What changes:

- **Download is a button**, for every kind and size, through the relay.
- **A breadcrumb** above the title.
- **The facts line**: when it changed and by whom where the site knows, the kind, the size, and the kind's own fact
  (pages, rows, lines, pixel size).
- **⋯ › Copy link** copies the stable link; **Copy path** stays for messages; **Open full screen** fills the window
  with the same frame and renderer.
- Narrow, as today: ‹ back to the folder, actions under the title; a table scrolls sideways inside its own area.

## The renderers' faces (F3)

- **Text** wraps. **Markdown** reads as today, with no raw HTML except a sized image tag (D23), and with **Read / Source**.
- **Code**: highlighted, the language in the facts line, line numbers, **Wrap** off by default; over 512 KB plain, with
  a line saying why.
- **JSON**: a tree folded below the first level, **Tree / Text**; invalid JSON as text with the line of the problem.
- **CSV**: a table with row numbers, the header fixed, sortable; "Showing 10,000 of 48,210 rows" past the cap.
- **Images**: fitted, **Fit / 100%**, a checkered ground for transparency, pixel size in the facts.
- **PDF**: pages by range, page count, page number, zoom.

## The frame's states (F4)

| | When | It says | Offers |
|---|---|---|---|
| 1 | No renderer for the kind | "No preview for .zip files." | Download |
| 2 | Past the cap, part shown | The renderer, under "Showing the first 1 MB of 3.4 MB." | Download |
| 3 | Past the cap, nothing useful to show | "Too large to preview (68 MB)." | Download |
| 4 | Looks like text but isn't | "This doesn't look like text, so it isn't shown." | Download |
| 5 | PDF with no files address | "PDF preview needs a files address. An admin can set one up." | Download |
| 6 | Changed while open | "This file changed since you opened it." | Show the new version |
| 7 | The site's relay isn't answering | "Files on office-server can't be opened right now: relay-2 isn't answering." | Try again |
| 8 | The site isn't answering | "The site holding these files isn't answering." | Try again |

Download is greyed only in 7 and 8, when no byte can be fetched.

## Embedded files (T3, D19)

|  | Opened | Embedded |
|---|---|---|
| Where | Files, a task's panel, full screen | Inside a Markdown page, a task's description or comment, a message |
| Size | The whole area | The text's width; images to 480 px tall, then scaled |
| Kinds | Every kind with a renderer | Images drawn inline; every other kind as a card (icon, name, kind, size, a line of preview where cheap) |
| Controls | The frame's | None; a click opens it, hover shows Download |
| Bytes | A ticket per file | The same, asked for all the embeds on screen in one request; loaded as they scroll into view |

**One Markdown embed, everywhere Markdown is drawn.** Markdown files, knowledge pages, a task's description and
comments, and agents' replies all render through `MarkdownMessage`, so the embed is added there once:

- A **relative image path** resolves against the page's folder, in the same place, and embeds through the relay. A path
  outside the place shows as a broken image with its name.
- **A place's folders are siblings.** A path starting with one of the place's top folders — `files/…`, `artefacts/…`,
  `workspaces/<id>/…`, as an agent writes them — names that file of the place, wherever the text is: a knowledge page
  reaches the place's Files, and a task's description or comment reaches them too. A task's text also reaches its own
  attachments as `attachments/<task key>/<file>`. Any other path resolves against the page's folder, as above. The
  organisation's own knowledge has no Files, so only its own paths resolve.
- **The editor's Preview draws what the saved page draws**, with the same place and folder.
- An **image tag**, `<img src="charts/q3.png" alt="Q3" width="600">`, is drawn the same way, so an image can be sized (D23).
  It is the only HTML Markdown accepts. Only `src`, `alt`, `width` and `height` are kept; anything else in the tag, and
  every other tag, is dropped and shown as text, as today. Its `src` resolves exactly like a Markdown image: a file in
  the place, a path out of the place shows as broken, and another website waits for Load.
- A **link to another file** becomes a card, or a chip inline.
- An **image on another website isn't loaded on its own**: "Image from example.org · Load", so opening a page never tells
  another site who's reading.
