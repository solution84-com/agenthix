# hq

The Agenthix control plane: the web application where an organisation manages its agents, projects, tasks,
sessions and skills, and the single source of truth for its data. It dispatches every run to an Execution Site
(`../site/`) and runs no agents itself. Built with [Wasp](https://wasp-lang.dev/) (React, Node.js, Prisma,
PostgreSQL).

- **How it is built:** [`docs/architecture/`](../docs/architecture/README.md)
- **Working on it:** [`AGENTS.md`](AGENTS.md), after the repository's own [`AGENTS.md`](../AGENTS.md)
- **Running it locally:** the repository [README](../README.md#local-development)
- **Deploying it:** [the deployment guide](../docs/architecture/deployment.md) — copy `compose.env.example` to
  `compose.env` and run `compose.yml`
