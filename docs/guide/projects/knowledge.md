---
title: Knowledge
description: Keep what a place shares, such as its processes, decisions and reference, as pages in sections that people and agents can search, edit and restore.
sidebar:
  order: 5
---

**Knowledge** is what a place shares: its processes, its decisions, its reference, and anything else people and agents
there need to look up. It is kept as **pages** in **sections**, like a small guide of your own. A page has a title, a
one-sentence description, tags, and text. A section is a folder of pages, and can hold other sections.

A page can also have properties of your own, such as a decision's **status** and **date**. Agenthix lists them, shows them
and searches them; what they mean is up to you.

![A project's Knowledge, with its sections beside the pages of the decisions section](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.6/project-knowledge.png)

## What belongs in Knowledge

Put in it what people will want to find again and agents will want to look up: "How we release", "Onboarding a client",
why you chose one tool over another, a client's brand rules. Keep other things where they already are:

| Keep here | Keep elsewhere |
|---|---|
| Processes, decisions, conventions, reference | What every agent must read on every run: the project's instructions, in **Files** (see [Instructions and memory](../agents/instructions-and-memory.md)) |
| | What an agent learned about you or the work along the way: [memory](../agents/instructions-and-memory.md#what-agents-remember) |
| | Documents and images people uploaded or agents made: **Files** and **Artefacts**. A page can link to them |

Nothing in Knowledge is read on every run. Agents search it when they need it.

## Four levels

There are four places knowledge can live. Each has its own pages, and an agent reads only the ones its conversation or run
can reach.

| Level | What it holds | Who reads it | Who changes it |
|---|---|---|---|
| **The Agenthix guide** | How Agenthix works: this guide | Every agent, and anyone | The people who make Agenthix. You cannot change it |
| **The organisation** | How the whole organisation works: processes, policies, brand, clients | Every member, and every agent in every place | Organisation admins, and agents when asked by one |
| **A project** | The project's own workflows, decisions and reference | Its members, and agents working in it | Anyone who may change the project's files, and agents they ask |
| **Your space** | Your own: [Your space](../getting-started/first-conversation.md#your-space) is your default personal project | You, and agents in your space | You, and agents you ask |

Any other [personal project](projects.md#personal-projects) is a project like any other, with its own knowledge, separate
from Your space.

Knowledge never moves between places by itself. A project's pages are not read in another project unless a conversation
has been given both: see [Places in a conversation](../getting-started/first-conversation.md#places-in-a-conversation).

## Find a page

Open a project, then **Knowledge** under **Files**. In **Your space** it is in the same place. A tree of sections is on the left, and the
pages of the selected section are listed beside it. On a phone the tree is one level at a time.

Each row shows a page's title, description, tags and properties, and when it changed and who changed it: a person, or an
agent and the person who asked.

- **Sections:** select a section to list its pages.
- **Filters:** **Tag**, and one filter for each property the pages use, such as **status**.
- **All pages** lists every page, newest first.
- **Needs fixing** gathers pages with a problem, such as no description or a link to a page that is gone. The problem
  is shown in place of the description. Open the page and edit it.
- **Search:** type in the search box. The list is replaced by the pages that match, each with its title, description, where
  it is from and the lines that matched; clear the box to get the list back. You can search up to 120 times a minute; an
  agent is held to 30 a minute in a conversation or run, so a search that is refused for being too fast is worth repeating
  a little later.
- **This project · Organisation · Both:** while you search, this switch chooses whether to search only the project, only
  the organisation's knowledge, or both. It starts on **Both**. In **Your space** the first choice reads **Your space**.

## Read a page

Select a page to read it. It shows its title, description, tags and properties, who changed it last (with a link to the
conversation or run it happened in), and the text. **On this page** lists its headings. Under the text, **Linked from**
lists the pages that link here.

![A knowledge page open, with its properties, its text and On this page](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.6/knowledge-page.png)

A link to another page opens that page. A link to an organisation page opens it in the organisation's Knowledge. A link to a
page that no longer exists is shown as a problem, and the page is listed under **Needs fixing**.

**Mention** puts a reference to the page into the message you are writing, so an agent can read it. **Download** saves its
text.

## Write and edit a page

People who may change the place's files see **New page**, **Edit**, **Move** and **Delete**. Everyone else can read, mention,
download and see the history.

1. Select **New page**, or open a page and select **Edit**. A new page opens in the section you were looking at.
2. Fill in **Title** and **Description**, and add **Tags**. A tag is a lower-case word; hyphens are allowed.
3. Under **Properties**, add rows of a name and a value if you want them. The properties the section's other pages use
   are offered.
4. Write the text in Markdown. **Write** and **Preview** switch between the text and how it will read.
5. Select **Save**. A problem is shown on its field, in words, and nothing is saved until it is fixed.

To start a new section, open **⋯** and select **New section**, then give it a name and write its first page. A section
exists as long as it holds a page.

A link to another page of the same place is an ordinary Markdown link. A link to an organisation page from a project page
is written `org:how-we-work/code-review.md`. A link to a page that does not exist yet is allowed, so you can write pages in
any order; it is listed under **Needs fixing** until the page exists.

A page is at most 64 KB, and a place can hold up to 2,000 pages.

If someone else saved the page while you were editing, HQ keeps your text and tells you who saved it and when. **See their
change** shows their text, and **Save mine over it** saves yours as the newest version.

## Move or delete a page

- **Move** changes a page's section or name. Links to its old address may need updating; **Needs fixing** lists them.
- **Delete** moves the page to **Recently deleted**, where it stays for 30 days.

## History and Recently deleted

Every change to a page is kept as a version, so you can see what changed and go back.

1. Open a page and select **History**.
2. Select a version. It shows when and by whom it was saved, and what changed in the title, the description, the tags, the
   properties and the text, line by line.
3. Select **Restore this version** to save it as a new version of the page. The versions in between stay in the history.

Versions are kept for 30 days, and the last 20 of a page are kept however old they are. One limit is stronger: all the
versions of a place together may take 200 MB, and when they pass it the oldest are removed first, the last 20 of a page
among them.

**Recently deleted**, at the foot of the tree, lists pages deleted in the last 30 days, who deleted them and when they will
be removed. Select **Restore** to bring one back, or **Delete permanently** to remove it at once. Use **Delete this version
permanently** in **History** to remove one version, for example one that holds a password pasted by mistake. This cannot be
undone.

## Organisation knowledge

The organisation has its own Knowledge. Every member can read it; organisation admins can add, edit, move and delete
pages.

1. Open your organisation's page: see [Your organisation's page and sign-in](../people/your-organisation.md).
2. Under **The workplace**, select **Knowledge**.

It works like a project's Knowledge. From a project, search it too with **Organisation** or **Both** beside the search
box. Agents in every project and conversation can read the organisation's knowledge, so what is written there is read
widely: keep a secret out of it. Agents can change it only when they are acting for an organisation admin.

## How agents use knowledge

- **They search it before asking.** When you ask how something is done here, or name a thing an agent does not recognise,
  it looks in the knowledge it can reach before asking you. A work step in the conversation, **Searched knowledge**, names
  the places it covered. When you ask about Agenthix itself, it looks in this guide and says so: **Looked up Agenthix**,
  with the page.
- **They change a page only when you ask, or correct them.** Say "the Release process page is wrong: …" and the agent
  edits that page. Say "write down how we deploy, for the team" and it writes a new page. A preference such as "I prefer
  short answers" is remembered instead, not written to knowledge. An agent that merely noticed something may offer to add
  it; it does not add it by itself.
- **Every change shows in the conversation.** The step reads, for example, **Updated page · Release process**, with a
  line saying what changed. **See change** opens the page's **History** at that version, and **Undo** restores the
  version before it. There is no approval step: you asked for it, and any change can be undone.
- **A change has to pass the same rules as yours.** If it does not, nothing is saved and the agent is told what is wrong,
  so it can try again.

To make agents follow the way your team lays out its sections, names its pages and records its properties, write it in the
project's instructions.
