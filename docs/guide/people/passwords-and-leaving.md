---
title: When someone forgets their password or leaves
description: Make a password reset link, reset your own password, and remove, bring back or erase a person.
sidebar:
  order: 4
---

**HQ** is your organisation's home in Agenthix. It keeps no email addresses and sends no email, so every way back in is an administrator making a link and sending it, or someone running a command on HQ's machine.

## Someone forgot their password

On the sign-in page, **Forgot your password?** tells them to ask an administrator. The administrator makes a link:

1. From the menu behind your name at the foot of the side bar, select **Manage**, then **People and invitations**, and open the person.
2. Select **More** (the three dots), then **Reset password**.
3. In the dialog, select **Make link**.
4. Select **Copy link** and send it to them yourself.

The link works once, for the next hour, and is shown once. Making a new link ends any earlier one. You never learn the new password.

When they open it, the page names their account and who made the link, and asks for a **New password**, then **Again**. **Set password and sign in** signs them in and ends their sign-ins on every other browser and device.

If the page says the link doesn't work, it has expired or been replaced: make another.

## The only administrator forgot theirs

There is no one in the app to ask. Someone with access to the machine that runs HQ makes the link with a command, and a second command makes a new administrator when nobody can sign in. Both are in [When nobody can sign in](../running-agenthix/recover-admin.md).

## Change your own password

From the menu behind your name at the foot of the side bar, select **Your settings**, then **Change** beside **Password** under **Sign-in**. Give your current password and the new one twice. Your other browsers and devices are signed out; you stay signed in here.

## Someone leaves

Removing a person stops them signing in and takes them out of every project and every team. Nothing is deleted.

1. Open the person from **Manage › People and invitations**, select **More**, then **Remove from the organisation**.
2. If the page lists projects under **Open tasks**, choose for each one who the tasks done on their behalf are now done on behalf of, or **Leave them waiting**. Tasks left waiting don't run until someone takes them on. Nothing is chosen for you. Tasks in private projects you aren't in are left waiting.
3. Select the **Remove** button, which carries their name.

Their name stays on tasks, comments, messages and runs, shown as left. Their private conversations and personal files stay private: no one, administrators included, can open them. You can't remove yourself, and Agenthix refuses if it would leave a project without an administrator: appoint another one there first.

Anyone removed shows under **Left** at the foot of the **People** screen, and isn't offered when you add people to a project.

## Bring someone back

Open the person from **Left** and select **Reactivate**. The same account returns with its history. Their projects and teams aren't restored: add them again.

## Erase a person's data

For a data-protection request, or when the organisation no longer needs the account, open a person who has left and select **Erase their data…**. It deletes their private conversations, personal project and files, memory, connections, model logins, name and picture. Tasks, comments and runs stay with their projects, with the name replaced by **Former member**.

This can't be undone. Agenthix asks you to type their name before it will go ahead.
