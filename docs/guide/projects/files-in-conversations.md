---
title: Files in conversations
description: Add a photo or file to a message, put a file, a folder or a task into one, see the files agents mention as pieces you can select, and open them beside the conversation.
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

## Add a photo or file

To show an agent what you mean, add a photo, a screenshot or a file to your message:

- Select **＋** in the message box, then **Photo or file**, and choose one or more. On a phone, **Take a photo** opens the
  camera.
- Or paste a screenshot into the message box, or drag a file onto it.

What you add shows in the message box above your words, a picture as a small thumbnail and any other file as a chip, each
with **✕** to take it out again. You can send it with no words. HQ takes **photos (PNG, JPEG, GIF or WebP), PDFs and
text files, up to 10 MB each**, and at most six in one message; anything else is refused when you add it, and it is
checked again on the server from what the file holds, not only its name.

When you send, each file is saved in the conversation's place, in the folder **Shared in conversations** of its
**Files**, so the agent, and any work it hands on, can open it. Your message shows the thumbnails and chips; select one
to open it beside the conversation. A file of the same name already there is never replaced: the new one is saved as,
for example, `screenshot (2).png`. To add a file to a place you need to be able to work there, not only read it.

### Which models see a picture

A model that can see images gets the picture itself; one that reads text only gets the file's path instead, and can still
open it or hand it on. Which models can is taken from the model list:

- When HQ knows the conversation's model reads text only, the message box says so as soon as you add a picture, such
  as *DeepSeek Pro can't see images. Writer will get the file, not what is in it.*, with a button to switch to a model
  that can. Sending anyway still gives the agent the file.
- When HQ doesn't know, as for a model on your own endpoint, the picture is sent. If the provider refuses it, the reply
  is asked for again without the picture, and a line under your message says the model couldn't see it.

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
