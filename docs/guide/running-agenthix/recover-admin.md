---
title: When nobody can sign in
description: Get a sign-in link, or the fleet admin role, back from HQ's own machine when no one can get in.
sidebar:
  order: 6
---

This page is for when nobody can get in: an organisation admin who forgot their password, or no fleet admin left to
open the Fleet Console. Most of it is done by a machine admin of HQ's machine, anyone who can use Docker on it.

**HQ**, your organisation's home in Agenthix, keeps no email address and sends no email. So every way back in is an
organisation admin acting in HQ, or someone who can run commands on HQ's machine. The commands below reach HQ through
a private channel inside HQ's container that only the host service on that machine can open. Nothing on the network
can.

Run them in the host service, the small program that runs Agenthix on the machine, on the machine that runs HQ:
`docker exec -it agenthix-host agenthix <command>`.

## Someone else forgot their password

If you can still sign in, you don't need a command. Open **Manage › People and invitations**, select the person, then **Reset
password** in the **⋯** menu. See [When someone forgets their password or leaves](../people/passwords-and-leaving.md).

## The only organisation admin forgot their password

1. Run:

   ```sh
   agenthix hq reset-password <username>
   ```

2. Open the link it prints. It works once, for one hour.
3. Under **Choose a new password**, enter the new password and select **Set password and sign in**.

Any other organisation admins get a notification that a password was reset from HQ's machine. Setting a new password ends
every other sign-in of that person.

On the sign-in page, **Forgot your password?** shows the same command under **If you're the only admin**.

## No organisation admin can get in

When the organisation has no organisation admin left who can sign in, make a new one:

```sh
agenthix hq invite-admin
```

It prints an invitation link, valid for 24 hours. Open it to create the account, as
[Joining by invitation](../getting-started/joining-by-invitation.md) describes. Under **Manage › People and invitations**, the new
organisation admin shows as **Invited from HQ's machine**, and any other organisation admins are told.

While HQ has no people at all, `agenthix hq invite-admin` prints the link for the first account, and so does HQ's log
each time it starts.

## The link doesn't open from another computer

A link begins with HQ's address. If that address is `localhost`, the link opens only on HQ's own machine. Fix the
address first: [what a server's address needs](domain-and-https.md#what-a-servers-address-needs).

## No fleet admin can open the Fleet Console

The Fleet Console, where the machines are looked after, is opened by HQ accounts that hold the *fleet admin* role. When nobody holds it, or the people who do
cannot sign in, nobody can read this page in the Fleet Console, so the role comes back from HQ's machine. Run, in the
host service on the machine that runs HQ:

```sh
agenthix hq fleet-admin <username>
```

It gives that person's HQ account the role. It never makes an account: they must already have one, so if no one has,
use `agenthix hq invite-admin` above first. It asks first (`--yes` answers for a script), and HQ tells every fleet admin
and organisation admin. The person can open the Fleet Console at once.

To take the role away from the machine, `agenthix hq fleet-admin --remove <username>` does it, even for the last fleet
admin. On the **Fleet admins** page in the Fleet Console, removing the last one, or your own, is refused.

## Check HQ is running

```sh
agenthix status
```

It prints HQ's version, whether it has people, and whether its site is connected. If it can't reach HQ, it says so.
