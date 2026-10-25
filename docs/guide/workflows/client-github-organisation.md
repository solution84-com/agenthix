---
title: A client's GitHub organisation
description: Send a client a link to install the GitHub App, then choose which projects may use their repositories.
sidebar:
  order: 4
---

To work in a client's repositories, the client's GitHub organisation installs your GitHub App. They need no Agenthix
account, and you never need their password. First [register the App](connect-github.md#1-register-the-github-app).

## Send the install link

1. Open **Manage organisation**, then **Settings**, then **GitHub**.
2. Select **Get an install link for a client**.
3. Select **Copy** to copy the link, or **Copy the note** to copy the message that goes with it. The note says who
   is asking, that GitHub shows the App and what it may do, that the client chooses all repositories or only some,
   and that they can change or remove it in their own GitHub settings, which stops the access at once. Select **Done**.
4. Send both to an owner of the client's organisation. Only an owner can install an App on it.

## What the client does

The owner opens the link, chooses their organisation, then either **All repositories** or **Only select
repositories** and picks which, then selects **Install**. Choosing only some repositories is the usual choice. The App
reaches those and nothing else.

A selected-repositories install can't have new repositories created in it, so connect an **existing** repository
to a workspace. Agenthix shows "Selected repositories only" and "Can't create new repositories" beside the account, and
how to fix it: the owner sets **Repository access** to **All repositories** in the App's settings for their organisation
on GitHub.

## Allow it for the right projects

A card appears saying the client's organisation **wants to connect**. Select **Allow**, choose **Only chosen projects**, tick the
client's project only, and select **Allow**. This stops another client's project from connecting to the account.
A project's **GitHub** page then offers the account only to the projects chosen.

In that project, [connect a workspace](connect-github.md#connect-a-workspace-to-a-repository) to an existing
repository, choosing the client's account, and approve the starter workflows. Until you allow the account, nothing
in Agenthix uses it, and the client can remove the App at any time.
