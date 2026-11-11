---
title: Invite people and choose their role
description: Make an invitation link, choose the person's organisation role and first projects, and see who has joined.
sidebar:
  order: 1
---

Nobody joins an organisation's **HQ** without an invitation. HQ is your organisation's home in Agenthix, and it keeps no email addresses, so an invitation is a link you make and send yourself. Only an organisation administrator can invite people.

## Make an invitation

1. From the menu behind your name at the foot of the side bar, select **Manage**, then **People and invitations**. The screen lists everyone in the organisation.
2. Select **Invite**.
3. In **Who it's for**, type a name, so you can tell invitations apart. It is optional.
4. Choose their **Organisation role**:

   | Role | What it allows |
   |---|---|
   | **Admin** | Runs the organisation: its people, agents, projects and settings |
   | **Member** | Works in their projects, as their role in each allows |

5. Under **Projects they join on accepting**, add the projects they should start in. It is optional, and they join each one as a member.
6. Select **Create link**.

![The Invite someone dialog, with the role choices and a project chosen](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.4/invite-dialog.png)

The link appears once. Select **Copy link** and send it yourself: Agenthix sends no email. It works for one person, once, for 7 days. If you lose it, revoke the invitation and make another.

If the dialog says **This link works only on this computer**, HQ doesn't know the address people reach it by. Set it first: see [Address and front door](../running-agenthix/domain-and-https.md).

What the person sees when they open the link is on [Joining by invitation](../getting-started/joining-by-invitation.md).

## See who has joined

![The People screen, with a waiting invitation above everyone in the organisation](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.4/people-list.png)

- **Invited · waiting** lists links that haven't been used, with the role, the projects and how long they have left. Select **Revoke** to stop one working.
- **Earlier invitations**, folded at the foot, shows what happened to the others: accepted by someone, expired or revoked.
- The list under **People** shows each person's role, how many projects they are in, and when they joined. Search by name or @handle.

An invitation that has waited a week gets a notice under **Needs attention** on **Manage › Overview**.

## Change a role afterwards

On the **People** screen, change someone's **Organisation role** from the list beside their name. Select their name for their own page, where each role is spelled out. You can't change your own role, so another administrator has to do it.

An organisation role says what someone may do across the organisation. What they may do in one project is their role in that project: **Admin**, **Member** or **Viewer**. See [Projects, and who can join](../projects/projects.md#roles-in-a-project).

To put someone in a project, open their page and select **Add to a project**, choose the project and the role, then **Add**. Or do it from the project's **Members**.
