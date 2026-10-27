---
title: Open and download files
description: Read what agents made without leaving Agenthix, copy a file's link or path, open it full screen, and what to do when a file can't be opened.
sidebar:
  order: 6
---

Files open where you find them: in **Files**, **Artefacts**, a workspace, a task, or a link in a conversation. You read the
file in place and can download any of them. This page uses **HQ**, your organisation's home in Agenthix, and the **Execution
Site**, the machine that keeps a project's files; see [How Agenthix works](../getting-started/how-agenthix-works.md).

## Open a file

Select a file in **Files**, **Artefacts** or a workspace. It opens beside the list, and on a narrow screen it covers the list
with **‹ back**. Above it are the folders it is in, its name, and a line of facts: when it changed, what kind it is, how big
it is, and one fact of its own kind, such as the number of pages or rows.

| Kind of file | How it opens |
|---|---|
| Markdown (`.md`) | Read as a page, images included. **Read** and **Source** switch between the page and its text |
| Code (`.ts`, `.py`, `.sh` and many more) | Highlighted, with line numbers and the language in the facts line. **Wrap** is off until you turn it on |
| Text (`.txt`, `.log`, and files with no known kind that are plain text) | As text, wrapped |
| JSON | A tree folded below its first level. **Tree** and **Text** switch between the tree and the raw text |
| Tables (`.csv`) | A table with row numbers and a fixed header row. Select a column's header to sort by it |
| Images (PNG, JPEG, GIF, WebP, AVIF, SVG, ICO, BMP) | Fitted to the area on a checkered ground, so transparent parts show. **Fit** and **100%** switch the size; the facts line gives the size in pixels |
| PDF | Drawn page by page, with the page count, the page number and zoom |

An SVG is drawn as a picture and never run. Any other file, such as a `.zip`, says **No preview for .zip files.** and offers
**Download**. A file named `.md` or `.csv` whose contents are not text says **This doesn't look like text, so it isn't shown.**

## Big files

A file opens only as far as it can be drawn well. **Download** always gets the whole file, whatever its kind or size.

| Kind | Shown |
|---|---|
| Text, Markdown and code | The first 1 MB. Code is highlighted up to 512 KB, and a plain version follows with a line saying why |
| JSON | As a tree up to 5 MB; beyond that, the first 5 MB as text |
| Tables | The first 10,000 rows, under **Showing 10,000 of 48,210 rows** |
| Images | Up to 20 MB |
| PDF | Up to 50 MB |

A file that is only partly shown has a line above it, such as **Showing the first 1 MB of 3.4 MB**, with **Download**
beside it. A file past the limit for its kind, with nothing useful to show, says **Too large to preview** and its size.

## Download a file

Select **Download** on the open file. It saves the file as it is, with its own name. It works for every kind and size.

## Copy its link or its path, or open it full screen

Select **⋯** on an open file.

- **Copy link** copies a link to the file. Anyone who can open the project can open the link and lands on the file. The
  link names the project, the tool and the file's path, never the machine that holds it, so it keeps working if the site
  moves. Someone who isn't in the project gets the same "not found" as for any page of it.
- **Copy path** copies the file's path, such as `files/reports/q3.pdf`, to paste into a message.
- **Open full screen** fills the window with the same view. Close it to go back.

**Mention** is a button beside **Download**, where a message box is open: it puts the file into the message you are
writing. See [Files in conversations](files-in-conversations.md).

## If the file changes while it is open

If an agent changes the file after you opened it, the view says **This file changed since you opened it.** Select **Show
the new version** to open it again.

## When a file can't be opened

A file is carried to your browser by HQ's **relay**, a small part of HQ that runs with it. If it stops, a file says, for
example, **Files on hq-box · HQ's site can't be opened right now: hq-box · HQ's relay isn't answering.** with **Try
again**, and **Download** is greyed out. The words name the relay, not the machine: the rest of HQ, including folders and
conversations, keeps working. If **Try again** doesn't help, tell whoever runs HQ; they can see on the Fleet Console's
**HQ** page whether the relay is running (see [HQ, sites and fleet admins](../running-agenthix/hq-sites-and-fleet-admins.md)).

Two other words you may meet:

- **The site holding these files isn't answering.** The machine that keeps the files is off or out of reach. Try again
  later; see [Files, workspaces and previews](files-and-previews.md).
- **PDF preview needs a files address. An admin can set one up.** A PDF can still be downloaded. For whoever runs HQ, this is
  explained in [Address and front door](../running-agenthix/domain-and-https.md#the-files-address).

If a file can't be shown at all, or you may not read it, HQ says **This file isn't there, or it isn't yours to open.** It
doesn't say which.
