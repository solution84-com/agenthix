---
title: Images in pages
description: Show a picture from your files in a knowledge page, a task description or a comment, and size it, and how pictures from other websites are handled.
sidebar:
  order: 9
---

A picture in Files can be shown where text is written: in a **knowledge page**, a **task's description and comments**, and an
**agent's reply**. A Markdown file in **Files** shows the pictures beside it too. This page uses **HQ**, your organisation's home in
Agenthix; see [How Agenthix works](../getting-started/how-agenthix-works.md).

## Add a picture to a page

Write it as Markdown, with a path to the file:

```md
![Q3 chart](files/charts/q3.png)
```

The words in the brackets describe the picture for anyone who can't see it. A path beginning `files/` is a file in the
project's **Files**, and it works the same way in a knowledge page and in a task. Other beginnings work the same:
`artefacts/…` for an artefact, and `workspaces/<id>/…` for a file in one of the project's workspaces.

A path that doesn't begin with one of those is read from the folder the page is in. In a Markdown file in
`reports/`, `![chart](q3.png)` is `reports/q3.png`, and `../charts/q3.png` goes up one folder.

To choose a size, write an image tag:

```html
<img src="files/charts/q3.png" alt="Q3 chart" width="600">
```

An image tag can have `src`, `alt`, `width` and `height`, and nothing more; a width is a number of pixels or a percentage,
like `50%`. It is the only HTML a page accepts: any other tag is shown as the text you typed.

## Where this works

| Where | A picture's path starts with |
|---|---|
| A project's knowledge page | `files/`, `artefacts/`, `workspaces/<id>/`, or a path from the page's folder in Knowledge |
| A task's description and comments | The same, and `attachments/<task number>/<file>` for one of the task's own attachments |
| An agent's reply | `files/`, `artefacts/`, `workspaces/<id>/` |
| A Markdown file in Files, or in a workspace | A path from the file's own folder, such as `q3.png` or `../charts/q3.png` |

The organisation's own knowledge belongs to no project, so it has no **Files** to show: `files/…` doesn't work in its
pages. A task can show only its own attachments, never another task's. A path that leaves the place, or points to a
file that isn't there or that you can't read, shows its name in a box where the picture would be.

The editor's **Preview** shows what the saved page will show.

## Pictures from other websites

A picture from another website isn't loaded on its own, so opening a page never tells that website who is reading. It shows
**Image from example.org · Load**, and selecting **Load** fetches it.

## Other files in a page

A link to another file in the place becomes a small piece (a chip) within a sentence. A file that isn't a picture, written
as an image, shows as a card with its icon, name, kind and size; select it to open the file, or hover over it for
**Download**.
