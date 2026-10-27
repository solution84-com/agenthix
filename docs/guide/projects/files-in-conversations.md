---
title: Files in conversations
description: Put a file, a folder or a task into a message, see the files agents mention as pieces you can select, and open them beside the conversation.
sidebar:
  order: 8
---

When a message names a file, a folder, a task or an attachment, it shows as a small piece, a **chip**, with an icon, a name
and what kind it is. Select it to open what it names. This page uses **HQ**, your organisation's home in Agenthix; see
[How Agenthix works](../getting-started/how-agenthix-works.md).

## Open what a chip names

- A **file** opens **beside the conversation**, in the same view as in **Files** (see
  [Open and download files](open-and-download-files.md)). On a phone it opens as a sheet from the bottom.
- A **folder**, shown with a folder icon, opens **Files** at that folder.
- A **task** shows its number, title and status, and opens the task.
- A **file of a task**, or one of its **attachments**, opens beside the conversation.

A file that has changed since the message was written carries **Changed since this message**: a message points at a file,
it doesn't keep a copy, so you always see the file as it is now.

If the file has been removed, its chip is struck through and keeps its name. Selecting it says **This file isn't here any
more**, with the folder it was in.

A link to a file, copied with **Copy link** and pasted into a message, shows as the same chip.

## Put a file into your message

There are two ways. In both, the file appears **inside the message box** as a chip, one piece you delete with a single
Backspace, with your own words typed either side. What the agent receives is the file's path, such as
`files/reports/q3.pdf`.

**Mention.** Open the file, then select **Mention**. The chip goes in at the cursor.

**The @ picker.**

1. In the message box, type `@`. A list opens under the cursor with the files of the conversation's place, the most recently
   changed first, each with its folder beside it.
2. Keep typing to narrow it. It matches the file's name, names that start with what you typed first. If nothing matches, the list says
   **No files match** with what you typed.
3. Choose one with the arrow keys and **Enter**, or select it. It replaces the `@` and what you typed with the chip.
   **Escape** closes the list and leaves your text as it is.

The picker lists the files of the conversation's own place, at most 20 at a time; a place whose machine isn't answering is
named at the foot as **isn't answering, so its files aren't listed.** To name a file of another place, open it there and
select **Mention**.

You can also type or paste a path such as `files/reports/q3.pdf`; it becomes a chip once it names a file.

## What agents write

Agents write a path from the place's root for something you can select: `files/…` for Files, `artefacts/…` for
Artefacts, `workspaces/<id>/…` for a workspace. A path written relative to a folder isn't one you can select, so if an agent
lists files you can't open, ask it to "write the paths from files/". A path that ends with a slash, `files/reports/`, is a
folder.

### Tasks and their files

An agent names a task by its number and never writes an address, because it doesn't know HQ's. In a conversation, these
become chips:

| An agent writes | You get |
|---|---|
| `tasks/MOP-1` | The task, to open |
| `tasks/MOP-1/notes.md` | One of the files its runs wrote |
| `attachments/MOP-1/screenshot.png` | One of the task's attachments |

You can see only the tasks you could open anywhere in HQ. A task you can't see stays as plain text, without its title.
Which tasks an agent can read in a conversation follows your access to them, not the places added to the conversation.

## Images in a reply

An agent shows a picture by writing it into its reply, such as `![the Q3 chart](files/charts/q3.png)`, and the picture is
drawn in the reply, up to 480 pixels tall. Select it to open the file. A file of any other kind, written the same way,
shows as a card instead. See [Images in pages](images-in-pages.md).
