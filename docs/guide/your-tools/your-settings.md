---
title: Your settings
description: What is yours alone to change in Agenthix, from your timezone to your password.
sidebar:
  order: 5
---

**Settings**, in the menu behind your name at the foot of the side bar, is only yours. What belongs to the whole organisation is under
**Organisation › Settings** and **Organisation › Infrastructure**, for administrators.

![Settings, with its sections down to Devices and connections](screenshot:settings)

## Profile

At the top, you can edit your name and use **Add a picture** or **Change picture**. **Handle** shows your username,
which you sign in with. **Your timezone** begins as **Use my browser's timezone**; pick another to
see times in it.

## Appearance

Choose **Light**, which is the default, or **Dark**. It is remembered in this browser.

## Conversations

Under **Conversations**, choose what happens when you send a message while an agent is still answering:

- **Wait:** your message waits for the answer to finish, then the agent replies to it.
- **Interrupt:** the agent stops the answer it was giving and starts on your new message instead.

## Primary agent

The agent a new conversation starts with, **Kernel** to begin with. You can still pick another agent before you send the
first message.

## Models

Which model answers you and does your work: **Model for talking**, **Model for light work** and **Model for heavy
work** (the last two for what an agent starts in the background), **Which models may be picked** and a **Ceiling** on
cost. Select **Save models**. Where you choose none, the organisation's applies. You can also change a conversation's model from its message box at any time.

## Your model logins

Your own Claude login or API keys, used for runs on your behalf. [Models](models.md) explains how they combine with
a project's and the organisation's.

## Memory

What agents remember about you, and what they remember where you work. Select **Manage** to open it: you choose a set,
then add, edit, pin or delete memories. What is about you is yours to change, and nobody else can read it. Each agent's
page also has a **Memory** section. [Instructions and memory](../agents/instructions-and-memory.md)
covers how memory works.

## Devices and connections

- **Connections:** **Manage** lists the tools that act for you, such as your own Claude Code. See
  [Claude Code and other tools](connections.md).

## Sign-in

Under **Password**, select **Change**, then enter your **Current password**, your **New password** (at least 8
characters) and **New password again**, and select **Change password**. You stay signed in here; everywhere else
is signed out. **Sign out**, in the same menu behind your name, ends this browser's session.

If you forget your password, an administrator makes you a link, as
[When someone forgets their password or leaves](../people/passwords-and-leaving.md) describes.
