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

Select a file in **Files**, **Artefacts** or a workspace. The folders fold away and the file takes the whole tool, with
**‹** and the name of its folder to go back. **▤** beside it shows the folder again next to the file, for going through
files one by one. **Search files** finds a file by its name in every folder.

A file you select where it is mentioned (in a conversation, on a task, in a page or a README) opens in the **file viewer**:
over the whole page between the menu and the conversation, which stays beside it so you can ask the agent about what you
see. On a medium window, where the conversation otherwise slides over the page, it sits beside the file instead;
**Minimised (⌘J)** folds it to its bar so the file has the width, and **Beside the page** brings it back beside the file.
What you choose holds as you open other files, and closing the file puts the conversation back as it was before. While
a file is open, **Over the page** is greyed. **‹** goes back to where you came from, named for it: **‹ Conversation**,
**‹ QR-1**. The browser's **Back** closes the viewer too, and the page's address, copied, opens the same file again. On a
phone the viewer is the whole screen.

Every file has the same header: **‹** back, the folders it is in above its name, **Download**, **Full screen** and **⋯**.
Under the header is a line of facts: when it changed, what kind it is, how big it is, and one fact of its own kind, such as
the number of pages or rows.

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

## Open it full screen

**Full screen** in the header fills the window with the same view, over the menu and the conversation too, for a wide table
or a PDF. **‹ Back to the viewer**, **✕** or Escape brings you back.

## Copy its link or its path, or mention it

Select **⋯** on an open file.

- **Copy link** copies a link to the file. Anyone who can open the project can open the link and lands on the file. The
  link names the project, the tool and the file's path, never the machine that holds it, so it keeps working if the site
  moves. Someone who isn't in the project gets the same "not found" as for any page of it.
- **Copy path** copies the file's path, such as `files/reports/q3.pdf`, to paste into a message.
- **Show in Files** opens a file you found in a conversation or on a task in its project's **Files**. In full screen in
  **Files**, it leaves full screen with the folder shown beside the file.
- **Mention** puts the file into the message you are writing. See [Files in conversations](files-in-conversations.md).

**Link copied.** and the like show for a moment under the header.

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
