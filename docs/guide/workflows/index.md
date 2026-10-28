---
title: Workflows and secrets
description: Let work that needs a password or token run safely, and connect GitHub, without any agent ever holding a secret.
sidebar:
  order: 7
---

An agent never holds a secret. A key, password or token is kept by a project, or by a person in their own space, and
only a **workflow** can use it. A workflow is a short list of fixed steps that a person approves. Agenthix runs it in
containers of its own and hides every secret value in what it prints. Agents propose workflows and run the approved
ones; people review, approve, switch them on and off, and follow their runs.

These pages use **HQ**, your organisation's home in Agenthix; see
[How Agenthix works](../getting-started/how-agenthix-works.md).

1. [Workflows](workflows.md): approve a version, switch a workflow on or off, run one and follow the run.
2. [Secrets and variables](secrets-and-variables.md): keep a key or a setting, replace it, and turn off what uses it.
3. [Connect GitHub](connect-github.md): register the GitHub App, allow accounts, and connect a workspace to a repository.
4. [A client's GitHub organisation](client-github-organisation.md): work in a client's repositories without an account of theirs.

GitHub works through workflows too: pushing, pulling and opening a pull request are workflows you approve once,
so an agent never holds a GitHub token either.
