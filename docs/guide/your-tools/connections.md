---
title: Claude Code and other tools
description: Let a tool outside Agenthix, such as your own Claude Code, work in HQ as you.
sidebar:
  order: 4
---

A **connection** lets a tool outside Agenthix, such as your own Claude Code or any other MCP client, work in **HQ**
as you. HQ is your organisation's home in Agenthix. A connection can do only what you can, and only what you turn
on for it.

## Create a connection

![The New connection form, with a name, permissions, projects and an expiry](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.4/new-connection.png)

1. Open **Settings**. Under **Devices and connections**, beside **Connections**, select **Manage**.
2. Select **New connection**.
3. Enter a **Name** that says what will use it, such as `Claude Code on my laptop`.
4. Under **Permissions**, tick what the connection may do. Each only narrows what you can do yourself:

   | Permission | What it covers |
   |---|---|
   | **Read** | Projects, boards, tasks, comments. On to begin with |
   | **Change tasks** | Create, edit, move and comment on tasks |
   | **Start work** | Run a task, set a schedule. Work it starts counts as started by you |
   | **Manage** | Boards, workforce templates, project settings, only where your role already allows it |

5. Under **Projects**, choose **All my projects**, or **Only these** and tick the projects.
6. Choose **Expires after**: 7, 30, 90, 180 or 365 days. It begins at 90.
7. Select **Create connection**.

## Copy the token now

HQ then shows **“Claude Code on my laptop” is ready** with three things to copy: the **Token**, the **Address**
(it ends in `/mcp`) and **Add it to Claude Code**, a command for Claude Code:

```sh
claude mcp add --transport http agenthix <address> --header "Authorization: Bearer <token>"
```

Run it where Claude Code is installed, with the address and token HQ shows. For another MCP client, give it the
address and send the token as a bearer token in the `Authorization` header.

**The token is shown once.** HQ keeps only a fingerprint of it. If you lose it, revoke the connection and create
another. Select **I have copied it** when you have it.

## Keep an eye on your connections

Each connection lists its **Permissions**, its **Projects**, when it was **Last used** and when it **Expires**.

- **Renew for 90 days** starts its time again.
- **Revoke** ends it at once, after you confirm. Anything using it stops working. You can have up to 25 active
  connections.

Revoke a connection when you stop using the tool, or if you think a token has leaked. Connection tokens begin with
`ahx_conn_`, so a leaked one is easy to recognise.
