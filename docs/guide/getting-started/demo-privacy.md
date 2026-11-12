---
title: The demo's privacy notice
description: What the public demo of Agenthix keeps about a visitor, for how long, and who to ask.
sidebar:
  order: 8
---

This page is about the public demo described in [Trying the demo](trying-the-demo.md), and nothing else: an HQ you
install yourself keeps what you decide. The demo keeps little, and none of it past its next reset.

## What the demo keeps

- **What you type and upload**, in the demo's own storage, until the next reset (every 6 hours): messages,
  comments, tasks, Knowledge pages, files and anything else you add. What you add is in your own space, which other
  visitors do not see. **Don't type anything personal.**
- **Your visitor.** Pressing **Enter the demo** makes an account with a random name and username, the **member** role
  and a random password nobody is shown. It holds no email address, real name or other detail about you, and it is
  removed at the reset.
- **The address your request comes from, for the entry limit.** To stop one address filling the demo, it counts how
  many times an address has pressed **Enter the demo** in the last hour (an address's whole network, for IPv6). That
  counter is in the demo's database with the address in it, and it goes at the latest at the reset.
- **A count of what each visitor has sent**, for the storage limits, and when a visitor was last active, so that an
  idle visitor stops using a place. Neither is shared, and both go at the reset.

## What the demo does not keep

- **No request log with addresses.** HQ's log lines for a request hold the method, the path, the result and how long
  it took, not the address. HQ's logs live in the same storage that the reset removes.
- **No access log at the front door.** Agenthix's front door, the web server in front of HQ, is not set to write one.
  Like any web server it can mention an address in a message about a failed connection. Those messages, and every
  log line of the demo's own containers, are kept in logs capped at three files of 10 MB each: the oldest lines are
  overwritten as new ones arrive, usually within days.

## What is shared with others

Nothing is sold, passed to another service or used for anything else. The demo calls no AI model and no voice
service, so what you type reaches none, and its pages load nothing from another site: the typeface and everything
else come from the demo itself.

## Who to ask

To ask about this notice, or to have something removed before the reset, email **privacy@agenthix.com**. Say what
you wrote and about when, but do not repeat anything personal. Who runs the demo, and the rights you have, are in
[Agenthix's privacy policy](https://agenthix.com/privacy). A security problem goes through the repository's
**Security** tab (**Report a vulnerability**).
