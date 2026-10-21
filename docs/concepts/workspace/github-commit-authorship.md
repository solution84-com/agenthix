# GitHub Commit Authorship Convention


> **Not built (flagged 2026-08-21).** This specifies the convention; the code does not implement it. `site/src/storage/repoOps.ts` passes one generic identity per git command (`GIT_IDENTITY`), and no trailer block is written. Read it as the specification the work will be built against, not as a description of what the repository does today. The work is queued.

> Convention reference for tracing agent activity in GitHub using a single org account with per-agent author metadata.

---

## Author Format

```
user.name  = {agentName} ({agentId})
user.email = {agentId}@{orgSlug}.agenthix.dev
```

**Example:**
```
Author: Dev Agent (agt_aaa) <agt_aaa@acme.agenthix.dev>
```

The email does not need to be a real inbox. It is a stable, structured, traceable identifier. The `orgSlug` scopes it to the org so authors are unique across orgs.

---

## Git Configuration

Author fields are set for each run, never in a workspace's `.git/config` and never globally. An agent has no workspace of its own: a workspace belongs to a project or a person and every agent working there shares it ([workspace.md](./workspace.md)), so an identity stored in the workspace could name only one of them.

The Site sets the author of the agent a run is for in that run's environment when it starts the run:

```sh
GIT_AUTHOR_NAME="Dev Agent (agt_aaa)"
GIT_AUTHOR_EMAIL="agt_aaa@acme.agenthix.dev"
GIT_COMMITTER_NAME="Dev Agent (agt_aaa)"
GIT_COMMITTER_EMAIL="agt_aaa@acme.agenthix.dev"
```

The agent never configures this itself.

---

## Commit Message Convention

Author fields identify who made the commit. The commit message provides task, project, and site context for queryability.

```
<commit message>

Agent: agt_aaa
Task: task_xyz
Project: proj_abc
Site: site_123 (Acme Production)
```

**Example:**
```
feat: implement dark mode toggle

Agent: agt_aaa
Task: task_abc123
Project: proj_xyz789
Site: site_123 (Acme Production)
```

The trailer block follows the [Git trailer convention](https://git-scm.com/docs/git-interpret-trailers) — machine-readable, queryable via `git log`, and visible in GitHub's commit view.

Agents are taught this format via their system instructions — injected at session creation, not stored in the workspace.

---

## What Each Field Traces

| Field | Where | Traces |
|---|---|---|
| `user.name` | Git author | Human-readable agent name + ID |
| `user.email` | Git author | Machine-readable agent ID scoped to org |
| `Agent:` trailer | Commit message | Agent ID — links the commit to the agent in hq |
| `Task:` trailer | Commit message | Task ID — links the commit to the task in hq |
| `Project:` trailer | Commit message | Project ID — links the commit to the project in hq |
| `Site:` trailer | Commit message | Site ID + name — links commit to the Site that executed it |

---

## Run Start

When the Site starts a run, it adds the author of the run's agent to the environment the harness runs in:

```typescript
const author = { name: `${agent.name} (${agent.agentId})`, email: `${agent.agentId}@${org.slug}.agenthix.dev` }
env.GIT_AUTHOR_NAME = env.GIT_COMMITTER_NAME = author.name
env.GIT_AUTHOR_EMAIL = env.GIT_COMMITTER_EMAIL = author.email
```

Because it is taken from the agent at the start of each run, a renamed agent's next run commits under its new name, and two agents working in one workspace each commit under their own.

---

## Agent Instructions

Agents are taught the commit message convention via system instructions:

> "Every commit message must include a trailer block identifying the agent, task, project, and site:
>
> ```
> Agent: {agentId}
> Task: {taskId}
> Project: {projectId}
> Site: {siteId} ({siteName})
> ```
>
> The task, project, and site details are provided in your session context. Always include them — this is how humans trace your work back to the board."

---

## Querying the History

```bash
# All commits by a specific agent
git log --author="agt_aaa"

# All commits for a specific task
git log --grep="Task: task_xyz"

# All commits for a specific project
git log --grep="Project: proj_abc"

# All commits from a specific site
git log --grep="Site: site_123"
```

GitHub's commit view surfaces the author name and email directly. The trailer block is visible in the full commit message.

---

## Open Questions

- Should the Site validate that commit messages contain the trailer block before allowing a push, or trust the agent to follow instructions?
- Should `orgSlug` in the email be the org's id or a human-readable slug?

---

## Related

- [git-access.md](../git/git-access.md) — how repositories are attached and reached today
