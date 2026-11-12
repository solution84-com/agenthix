---
title: Trying the demo
description: What the public demo of Agenthix is, what in it is scripted, what it refuses, and when it resets.
sidebar:
  order: 7
---

The demo is a running **HQ** (your organisation's home in Agenthix, the part you open in a browser) with a sample
organisation, Fernhill & Co, already in it. You open it, press one button and look around: nothing to install, no
account to make, nothing to pay. Use it to see whether Agenthix suits you before you install it.

It is a demo, not a trial of your own organisation. It is shared with other visitors, it is wiped every 6 hours, and
the agents' answers are scripted. Read on for what that means, and do not type anything personal into it.

## Getting in

1. Open the demo's link. The sign-in page shows one button, **Enter the demo**, the notice that the demo is shared and
   wiped every 6 hours, and the time left until the next wipe.
2. Select **Enter the demo**. You are signed in as a visitor with a name such as *Visitor 4821*. You are a **member**
   of the organisation and a **viewer** of its projects, and you work in **Your space**, your own private place. You
   have no password to know or to change.

The same browser stays the same visitor until the next reset. Signing out ends that visitor: you can enter again, but
as a new one.

If the button says **The demo is full**, come back in a little while. Each address may enter 5 times an hour, and the
demo holds up to 300 visitors who have been active in the last hour; a visitor who has done nothing for an hour no
longer counts.

## What is real

Everything you can see is the real product working on sample data: projects, boards, tasks and comments, the Workroom,
Knowledge, files, the Library and routines.

- **The sample's projects you can read, not change.** As a viewer you open every board, task, file and Knowledge page,
  but you cannot move, edit or start anything there, as a viewer cannot in any organisation. So the sample looks the
  same for everyone.
- **Your space is yours to change.** Talk to the agents there, ask them for work, and add your own tasks, files and
  Knowledge pages. Nobody else sees your space or your conversations, and the other visitors are not listed among the
  people.

## What is scripted

No AI model is called and no agent container ever starts. What looks like an agent working is a script.

- **Replies.** In a conversation, an agent answers from a short script written for it, so it sounds like itself.
  Your message is matched to the closest of a few topics. A message that matches none gets a reply that says this is a
  demo and suggests what to ask. The suggestions above the message box are the questions each agent answers. When a
  reply makes a task in your space or looks something up, that is done for real.
- **Runs.** A task an agent works on in your space plays a prepared run of a few seconds: its steps and tool calls
  appear one by one, it may write files you can open, and the task moves to *In review* for you to check. The
  sample's projects also hold past runs to read, some ending in a failure or a limit on purpose, so you can see how
  those look.
- **Voice.** The voice screen is the real one, but it is a **Demo voice**: you do not speak and nothing is listened to.
  The lines you can say appear as buttons, and the agent answers each aloud from a recording.

## What the demo refuses

Most of what you cannot do in the demo is what a member or a viewer cannot do in any organisation: the admin screens
and the sample's projects say so as they always do. On top of that, a few things a member could do are refused, with
**The demo can't do this. Nothing was changed.**:

- **Anything that reaches outside the demo:** adding a provider or key, signing in to your own Claude subscription,
  a web-search key, GitHub, connecting Agenthix Cloud or another service, a secret's value, and installing a package
  from a web link.
- **Anything that changes who can get in:** invitations, password-reset links, changing your password, and pairing a
  phone.
- **What needs a container:** starting a workflow and live previews. The sample has past workflow runs to read.
- **Making a project**, since every visitor would see it. Work in your space instead.

The [Fleet Console](../running-agenthix/index.md) is not part of the demo.

## What is limited

- **Uploads** are at most 2 MB each and are only ever offered as downloads, never shown as a page.
- **Each visitor** may send the demo up to 20 MB in all, and **the demo as a whole** up to 2 GB, until the next reset.
  Past either, the demo says so and saves nothing.

## When it resets

Every 6 hours, at 00:00, 06:00, 12:00 and 18:00 UTC, the demo is wiped and the sample organisation is made again,
dated around that day. Everything visitors made goes, **including your visitor**. A line at the top of every screen
says *Demo — shared with other visitors* and the time left; in the last 10 minutes it says that what you have done is
about to be wiped, and links to this page. After a reset, select **Enter the demo** again.

## What to do next

If you want to keep what you make, [install Agenthix](install.md) and [set up your HQ](setup-hq.md); everything the
demo refuses is yours to do there. What the demo keeps about you is on [the demo's privacy notice](demo-privacy.md).
