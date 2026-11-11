---
title: Connect GitHub
description: Register the GitHub App, allow the accounts it is installed on, and connect a workspace to a repository.
sidebar:
  order: 3
---

Agenthix reaches GitHub through a **GitHub App**: one for your **HQ**, owned by a GitHub organisation or account of
yours. An agent never holds a GitHub token. Instead, each run of an approved workflow is given a token that lasts
for that run only, for one repository, with only the permissions the workflow declares. An administrator sets this
up once; after that, connecting a workspace is a few clicks.

Open **Manage organisation**, then **Settings**, then **GitHub**. The page has the App, then the GitHub accounts.

## 1. Register the GitHub App

1. Under **Who owns the App on GitHub**, choose **An organisation**, and enter the **GitHub organisation**: the name
   in its address, `github.com/<name>`. You must be one of its owners. Agenthix checks the name before it sends you
   to GitHub. Or choose **My personal account**, so that whoever is signed in to GitHub owns it. An organisation is
   recommended, because its owners can manage the App whoever set it up.
2. Select **Register the GitHub App**, then **Create GitHub App on GitHub**.
3. GitHub shows its page for creating the App. Its name starts as "Agenthix for" followed by your organisation's name,
   which is what clients read when they install it. App names are unique on GitHub: if it is taken, change it there.
   Leave the rest and create the App.

![The page for registering the GitHub App, before one exists](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.4/github-register.png)

GitHub then takes you to the page for installing the App.

Once it is registered, the page shows the App's name and owner, its homepage and **Disconnect**, and the permissions it
holds, each with what uses it. Those permissions are the most any workflow can do; each run gets only what its
workflow declares, below that. **Disconnect**, confirmed with **Confirm disconnect?**, removes the stored App from
Agenthix. It does not delete the App on GitHub, and workflows that reach GitHub stop until you register again.

## 2. Install it

Install the App on a GitHub account of yours:

1. Under **GitHub accounts**, select **Install on one of your GitHub accounts**.
2. On GitHub, choose the account, then **All repositories** or **Only select repositories**, then **Install**.
   Choose **All repositories** if agents should be able to create new repositories.
3. GitHub sends you back. Within a minute a card appears saying the account **wants to connect**. There is no button to refresh.

To install it on a client's organisation, see [A client's GitHub organisation](client-github-organisation.md).

## 3. Allow the account

An account that has installed the App does nothing until an administrator allows it. This stops someone installing
it on an account you didn't expect.

1. On the card, select **Allow**. **Ignore** sets it aside, and an ignored account can be allowed later.
2. Choose who can connect to it. Under **Projects**, choose **Every project**, for your own organisation's accounts, or
   **Only chosen projects**, for a client, and tick the projects. Under **People**, tick anyone whose own storage and
   personal projects may connect to it; by default no one.
3. Select **Allow**.

A workspace connected earlier keeps its repository; a new connection has to pass this rule. **Change** beside an
account in the table edits it later. The table shows, for each account:

- **Repositories the App can reach**: **All repositories**, or **Selected repositories only**. An account with
  selected repositories only, or a personal account, can't have new repositories created in it, and the table says so
  and how to fix it.
- **Permissions**: **Current**, or **Not yet accepted** with the permissions that GitHub's owner of the account has
  yet to accept. Until they do, projects keep the older list.
- **Which projects can connect**: the rule you chose.

## A project's default account

Open **GitHub** in a project. **Default account** lists only the accounts this project may connect to; choose the one
new repositories start in. The page also lists the project's workspaces with their repository and account, and the
workflows that reach GitHub, with **Open Workflows**. If it says no account is allowed yet, an organisation
administrator allows one as above.

## Connect a workspace to a repository

A **workspace** is a codebase agents build in; see [Files, workspaces and previews](../projects/files-and-previews.md#workspaces).

1. Open the workspace and select **Connect to GitHub**. The same appears when you make a workspace and choose **A
   GitHub repository**, and as **Back up to GitHub** on **Files**.
2. Choose **A new repository** or **An existing repository**.
3. Under **GitHub account**, choose the account. It starts at the project's default, and lists only accounts you may
   connect to. In your own space it lists the accounts an administrator chose you for.
4. For a new repository, enter the name. It is checked as you type, with "Free on" and the account. For an existing
   one, enter the **Repository address**. A new one is created private, with the workspace's files pushed to it. An
   existing one is checked out into an empty workspace; if the workspace has files, they are pushed only when it is
   empty or the history matches.
5. Select **Create and connect**, or **Connect**.

If you chose an account that can't create a repository, Agenthix says why and offers **Connect an existing repository
instead**. When a repository of that name already exists, it offers **Use the existing one**.

### Approve the starter workflows

Connecting proposes three starter workflows. The panel **When it's connected** lists them, each approved once:

- **push** pushes a branch of the workspace's repository.
- **pull** pulls the repository's changes into the workspace.
- **open-pull-request** opens a pull request from a branch.

Select **Review** on each to read it in full, then **Approve version 1**. The first version always needs the full
review: [Workflows](workflows.md#the-full-review) says what to look at. **Approve all three** approves those the
plain checks allow from here, and says which need their full review. Everyone else sees **Waiting for an
administrator of this place to approve them**. If you close the panel first, the starters wait in the project's
**Workflows**, counted as **3 need you**; the workspace's page doesn't repeat them.

Once approved, agents push, pull and open pull requests by running these workflows. A plain `git push` from an agent
fails, with a message that names the **push** workflow.

### Protected branches

**push** and **open-pull-request** refuse to push to a branch GitHub marks as protected, such as one with a branch
protection rule. The run stops as it starts and nothing is pushed. To change a protected branch, an agent pushes a
different branch and opens a pull request.

Reading whether a branch is protected needs an administration permission on the App. On a private repository on a
GitHub plan without rulesets, Agenthix reads the older protection rules only.

### Set a secret on GitHub

A fourth workflow, **set-github-secrets**, sets a secret as a secret of the repository's `production` environment,
limited to protected branches, so only code that has been reviewed and merged can read it. You don't write it: tick
**Also set it on GitHub** when you
[add a secret](secrets-and-variables.md#also-set-it-on-github).

## What a connected workspace shows

A workspace's page lists **Workflows that reach GitHub**, with whether each is on and its last run, **GitHub workflows
in the repository**, read from GitHub with their last run (run one through a workflow or on GitHub, not here), and
**Secrets on GitHub**, by name, each marked **From Secrets** or **Outside HQ**. **Disconnect** removes the link;
the repository is untouched.
