---
title: A task's files
description: Attach files to a task, open them over it, find the files its runs wrote, and link to them.
sidebar:
  order: 7
---

A task is where you asked for the work, so it is where its files are. On a task's page, **Attachments** are under the
description, and the files its runs wrote are in its **Files** tab, beside **Activity**, **Comments** and **Runs**.

## Attachments

**Attachments** are files that belong to the task: ones you attach, and ones an agent attaches as a deliverable.

1. Open the task and, under **Attachments**, select **Attach file**.
2. Choose the file. It can be up to **10 MB**. A larger file is refused with a line saying its size and the limit.

Each attachment shows its kind, its size and when it was attached. Select one to open it in the file viewer, over the task,
with **‹** and the task's number to go back to it (see [Open and download files](open-and-download-files.md)); **Download**
is in its header. A file named in the task's description opens the same way, so nothing takes you away from the task.
Anyone who is a member of the task's project can open its attachments.

## Working files

**Working files** are what the task's runs wrote in the task's own folder: the notes, outputs and drafts of the work. They
are listed folder by folder in the task's **Files** tab, whose count says how many files and folders are at the top of
the folder, and open over the task the same way. Until a run has written something, the tab says **The files this
task's runs write in its own folder show here.** When a run's result names one of these files, for example
`pages/work.md`, the name is a link that opens it. A task in **Your space** has no folder of its own, so it has none.

If the machine that keeps them is off, the list says **The site holding this task's files isn't answering.**

## Link to a task's file

**Copy link** on a file opened from a task gives a link that opens the task with that file open over it, so you can send it
to someone in the project.

A file named in the task's text that isn't in its folder says so, for example **There's no file at report/q3.md in QR-1's
working files.** When the project's **Files** has a file at that path, a button opens it.

To point an agent at a task or one of its files, write its reference in a message: `tasks/MOP-1` for the task,
`tasks/MOP-1/notes.md` for a working file, `attachments/MOP-1/screenshot.png` for an attachment. Each becomes a small
piece you can select. See [Files in conversations](files-in-conversations.md#tasks-and-their-files).

Agents can read a task's attachments too: asking for a task's details lists them, with their names and sizes.
