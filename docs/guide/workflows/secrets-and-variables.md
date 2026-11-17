---
title: Vault
description: Keep a secret or a variable for a project or for yourself in the Vault, replace it, and switch off everything that uses it.
sidebar:
  order: 2
---

A project, or a person in their own space, keeps two kinds of named values for its workflows:

- A **secret** is a key, password or token. It is stored encrypted and never shown again once saved. An agent sees its
  name and what it is for, never the value. A workflow step gets it only if the approved workflow names it for that
  step, and the step reads it as a file, `/run/secrets/NAME`.
- A **variable** is a plain setting, such as a host name or an environment. Its value is shown to everyone in the
  place and to agents, and a workflow that names it has it in every step. **Never put a secret in a variable.**

Names are capitals, digits and `_`, starting with a capital. Agents can't add or change either kind.

Open **Vault** in a project, beside Settings. In your own space and in a personal project it holds your own. Its
count shows how many there are, or how many are **overdue** or **to rotate**. Everyone in the place can read the page;
only its administrators (in your own space, you) change it. It has two tabs, **Secrets** and **Variables**, with the
same columns: name and description, value, used by, changed, and actions.

## Add a secret

1. Select **Add a secret**.
2. Enter a **Name** that says what it is for, such as `STAGING_DEPLOY_KEY`, not only whose it is.
3. Under **What it is and what it reaches**, say so in a sentence, so the next person knows whether it is safe to
   remove. Under **Where to get a new one**, say where it comes from, for example "ssh-keygen on the server".
4. Choose **Text** or **File** under **Kind of value**, and enter the value or choose the file. A file may be up to
   48 KB.
5. Optionally set **Rotate by**, a date by which to replace it. The administrators are reminded a week before, and
   it shows **Overdue** after.
6. Select **Save**.

![The form for adding a secret, with a name and a description filled in](https://github.com/solution84-com/agenthix/releases/download/v0.1.0/secrets-add.png)

Use the narrowest credential that does the job: a key for one server rather than for the account.

### Also set it on GitHub

When the place has a workspace connected to a GitHub repository, the form also shows **Also set it on GitHub, for
GitHub workflows**. Tick it when a workflow that runs on GitHub, rather than in Agenthix, needs the same value. Then
select **Save, then approve**. Saving proposes adding the name to the `set-github-secrets` workflow, and an approval
for it opens straight away. It says where the value will reach: any GitHub workflow in the repository's `production`
environment, on protected branches only. Select **Approve and set it**, or **Review all of it** to read first.
Agenthix sets it on GitHub when that workflow runs. A workspace's page lists it under **Secrets on GitHub**.

A secret set on GitHub this way is never given to a workflow on any other branch or to a pull request.

## Replace a secret

Select **Replace** on its row, enter the new value or file, and optionally a new **Rotate by** date. The name, the
description and the record stay, and the next run uses the new value. You can't see the old value; you can only replace
it.

## Turn off what uses it

If a secret may have leaked, open **⋯** on its row and choose **Turn off what uses it**. The dialog lists the
workflows that use it, and selecting **Turn off N workflows** switches them all off and stops any run in progress.
It then tells you what to do next: replace the secret at the place that issues it, then switch the workflows back on
one by one. The same item is on a variable's **⋯** menu.

Deleting a secret that an approved workflow still names is refused while that workflow is on; **Turn off what uses it**
first.

## Variables

Select the **Variables** tab, then **Add a variable**, and enter a **Name** and a **Value**. **Edit** changes the value
in place. If the value looks like a secret, such as a private key or a token starting `ghp_`, Agenthix asks "This
looks like a secret. Add it under Secrets instead?" Select **Add it under Secrets**, or **It isn't a secret: save it**.
Some names are refused because they change how programs run, such as `PATH`.

## History

**⋯**, then **History**, on any row shows what happened and who did it. For a secret: when it was set, replaced or
deleted, when a run used it, and when a run printed it and hiding it caught the value, and when its workflows were
turned off. The value is never recorded. For a variable, each change shows the old value then the new one, with who
and when.
