---
title: GitHub
description: Connect Agenthix to GitHub once, then back a project's files up to a repository.
sidebar:
  order: 4
---

Connecting GitHub lets agents clone and push code with short-lived, per-repository tokens instead of long-lived
passwords, and lets a project's files be backed up to a repository. Agenthix does this through a **GitHub App**, one
for your **HQ**, your organisation's home in Agenthix. An administrator sets it up once, in two steps.

## 1. Register the GitHub App

1. Open **Organisation › Infrastructure**, and under **More** select **GitHub App**.
2. Under **GitHub organization**, enter the name of the GitHub organisation that will own the App, or leave it blank
   to create the App under your personal account.
3. Select **Register the GitHub App**. GitHub asks you to confirm creating it, then sends you back to Agenthix.

The page then reads **GitHub App registered**, with the App's name. The App is tied to HQ's address. **Disconnect**
removes the stored App credential from Agenthix, after you confirm with **Confirm disconnect?**. It does not delete the App on GitHub, and agents' git access stops until you
reconnect.

## 2. Install it on your accounts

1. Open **Organisation › Settings**, and under **Access to models and tools** select **GitHub**.
2. Select **Install or manage on GitHub**, and install the App on your organisation or account.
3. Back in Agenthix, select **Refresh installations**. The accounts appear under **Installed on**.

An App installed on a personal account can link existing repositories but can't create new ones: that needs the App
installed on a GitHub organisation.

## Back a project's files up

With the App installed, a project administrator can back the project's files up to a private repository, or link one
that already exists. The steps are in [Back it up to GitHub](../projects/files-and-previews.md#back-it-up-to-github).

## What the connection is used for

- **Agent repository access:** short-lived tokens for each repository, so agents can clone and push.
- **Operations:** the repository's GitHub Actions workflows, their runs and their secrets, without a personal
  account involved.
