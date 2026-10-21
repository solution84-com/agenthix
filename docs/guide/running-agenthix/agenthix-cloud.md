---
title: Agenthix Cloud
description: What Agenthix Cloud adds to an HQ you run yourself, how a fleet admin connects it, and how people sign in with an Agenthix account.
sidebar:
  order: 10
---

**Agenthix Cloud** is the hosted service from the makers of Agenthix. Everything in Agenthix works without it: you
install **HQ**, your organisation's home in Agenthix, and its **sites**, where agents run, on your own machines, and
nothing here is needed. Cloud is for an organisation that wants more than that, and it is always the organisation's
choice, made by connecting HQ to Cloud.

## What Cloud adds

- **One account for every organisation.** A person has an *Agenthix account*, and signs in to each organisation's HQ
  with it, and switches between their organisations from the top of HQ's menu.
- **An organisation of your own.** Anyone can start a new organisation from the same place.
- **Sites you do not have to look after.** Cloud can run sites for your organisation on its own machines.
- **A way into the Fleet Console from elsewhere.** A fleet admin can open the Fleet Console from anywhere for a while,
  through Cloud, instead of over an SSH tunnel.
- **Notice of planned downtime.** When a fleet admin plans a change that takes HQ or a site away for a while, Cloud can
  email the people who have linked an Agenthix account the day before.

What Cloud does not do: HQ stays the one home of your organisation's data. Cloud learns that HQ is connected, and who
signed in with which account. It does not receive your projects, conversations or files, and HQ never learns which
other organisations a person belongs to.

## Connect HQ to Cloud

Only someone who is both a **fleet admin** and an **organisation admin** can connect or disconnect HQ, because the
connection belongs to the organisation. It is made on the Fleet Console's machine, not through remote access.

1. Open the Fleet Console and go to its **HQ** page (see [Open the Fleet Console](index.md#open-the-fleet-console)).
2. In the **Agenthix Cloud connection** section, select **Connect to Agenthix Cloud**. The page shows a short code.
   If Cloud is busy, the section says **Not yet** and when to try again.
3. Select **Approve on Agenthix Cloud**. Cloud's page asks you to sign in and shows the same code. Check that the
   two codes match, then approve.
4. Back on the **HQ** page, the section reads **Connected** and names the organisation as Cloud knows it.

To end the connection, select **Disconnect…** in the same section. Nothing on your own machines changes; remote
access to the Fleet Console turns off, the sites Cloud runs leave the fleet, and people who signed in with an Agenthix
account sign in with their username and password from then on. HQ tells each of them.

Until HQ is connected, it never contacts Cloud. Once connected, it checks in with Cloud about once an hour, so Cloud
can tell an HQ that stopped from one that is only quiet, and HQ notices within the hour if the connection was ended on
Cloud's side.

When Agenthix Cloud runs HQ for you, there is nothing to do: Cloud connects HQ as it sets it up, and the section reads
**HQ on Agenthix Cloud**, with no **Disconnect**. If it does not, the section offers **Connect to Agenthix Cloud** as
above.

## Sign in with an Agenthix account

Once HQ is connected, its sign-in page can sign people in with their Agenthix account. A person links their account
once, signed in as themselves:

1. Go to **Settings**, then **Sign-in**.
2. Next to **Agenthix account**, select **Link** and type your password to confirm it is you.
3. Sign in on Agenthix Cloud when it asks. You come back to **Settings** with the account **Linked**.

Afterwards, **Sign in with Agenthix Cloud** on HQ's sign-in page signs you in. It is never the only way in: your
username and password keep working, and accepting an invitation still asks for both. A person who has not linked an
account is told so, and can sign in with their password and link it. **Unlink** in the same place ends the link.

While HQ is not connected, the sign-in page still shows the button, greyed out, with the reason beneath it, and
**Settings** offers **Ask a fleet admin to turn it on**. Each person can ask once; fleet admins see in the Fleet
Console how many people asked.

## Switching organisations

At the top of HQ's menu, the organisation's name and picture open a short list. HQ lists only your organisation there,
because it does not know the others. When your Agenthix account is linked, **Switch organisation…** opens your list on
Cloud, and **Start your own organisation** opens Cloud's page for that. Both are plain links that carry nothing about
the organisation or about you.

Without Cloud, the same menu says other organisations need Agenthix Cloud, because one account that signs in to every
organisation is what Cloud provides.

## For fleet admins

Where Cloud would remove a limit you have hit, HQ and the Fleet Console may show you one line saying so, with a link.
For example, **No Execution Site is connected** may be followed by an offer to run a site on Cloud. Each line has **×**,
and a line you dismiss does not come back for you. Members never see them.
