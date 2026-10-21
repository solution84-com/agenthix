---
name: database-migrations
description: Use when changing hq/schema.prisma or site/schema.prisma, or writing, applying or checking a database migration in either app — additive or destructive, through Wasp for hq and Prisma for site. Covers what may be run without asking, what needs the owner's consent, and the commands that look like they work but do not.
---

# Database migrations

The clean-slate note below applies to both `hq/` and `site/`. The commands differ: `hq/` migrates through Wasp, `site/` through Prisma directly (see *The site — Prisma directly* below).

hq's Wasp CLI is pinned in `hq/package.json` (`@wasp.sh/wasp-cli` 0.25.0), so every `wasp` command below runs as `npx wasp` from `hq/`. Wasp 0.25 still uses Prisma 5.19 and still generates the schema it migrates against at `hq/.wasp/out/db/schema.prisma` (`npx wasp compile` writes it). Its `wasp db` commands are `migrate-dev` (with `--name <name>` and `--create-only`), `reset`, `seed [name]`, `studio` and `start` (the same as `wasp start db`). Wasp's documentation says never to run `prisma` directly against hq; the one exception below, `prisma migrate diff`, only reads.

> **Until the first release candidate, `0.1.0-rc.1`: clean slate, no data migration.** No install needs its
> data carried forward yet. Never write code that converts existing rows, stored values or on-disk layout —
> old data and old locations are ignored or wiped. A destructive schema change is approved in principle: say
> what it drops, then run it as *Destructive changes* below describes. Each app has one initial migration,
> which may be regenerated from the schema once more before `0.1.0-rc.1`. **From `0.1.0-rc.1` on, every
> schema change is a new migration that carries a release's data forward**; remove this note then.

Make the schema change in the module's `schema.prisma` and commit it. Then, for the migration itself, **which of the two cases you are in decides whether you can run it yourself** — verified against Wasp 0.21.1 on 2026-08-11, and not yet re-run on 0.25: the commands and flags are unchanged, but confirm the behaviour on first use and correct this skill if it differs. The commands in the next three subsections are hq's.

## Additive changes — run it

A migration that only *adds* (new tables, new nullable columns, new indexes) raises no prompt at all once `--name` supplies the migration name. Run it:

```bash
cd hq && echo "" | npx wasp db migrate-dev --name <describe-the-change>
```

`--name` is what removes the prompt. The `echo ""` is belt-and-braces for a stray read on stdin and is usually inert — it is not itself the mechanism, so **do not treat it as a general TTY bypass**.

## Destructive changes — ask the user, then write the migration yourself

A migration that drops a column, narrows a type, adds a required column to a table that has rows, or otherwise
loses data makes Prisma warn and ask for confirmation, and **it cannot be confirmed without a terminal**. Piping an
answer does not work: `echo "y" | npx wasp db migrate-dev` hands the `y` to Wasp's database check, which sends it to
Postgres as SQL and then reports that it cannot connect; and Prisma refuses `migrate dev` outright when it detects
no terminal, `--create-only` included. `echo ""` declines and aborts without an obvious failure. *(Found
2026-10-03, Wasp 0.21.1, Prisma 5.19.)*

Losing data is never yours to decide alone. So:

1. Say plainly what will be lost — which table, which column, roughly how many rows if you can count them.
2. Ask whether to run it or leave it for them.
3. If they approve, write the migration from the difference between the database and the schema, then apply it:

   ```bash
   cd hq && npx wasp compile                     # regenerates .wasp/out/db/schema.prisma
   mkdir migrations/$(date -u +%Y%m%d%H%M%S)_<describe-the-change>
   npx prisma migrate diff --from-url "$DATABASE_URL" \
     --to-schema-datamodel .wasp/out/db/schema.prisma --script > migrations/<that folder>/migration.sql
   npx wasp db migrate-dev < /dev/null          # applies it; asks nothing, because nothing is left to generate
   ```

   `DATABASE_URL` is the one in `hq/.env.server`, and the database must be at the state of the previous
   migration. Read the SQL before applying it, and commit the folder with the schema change.
4. A required column with no default cannot be added to a table that has rows. Until `0.1.0-rc.1` the answer is
   to wipe the development database (clean slate, above) — say so and ask, as in step 1.
5. If they decline, or you cannot reach them: commit the schema change and leave the step in the plan.

## Either way

- Continue with all other tasks — TypeScript and Wasp compile against the updated `schema.prisma` even before the migration runs.
- If a schema change sits un-migrated, Wasp warns on every boot that schema and database disagree. Expected in that window, not a fault.
- **`wasp db migrate-dev --help` is not a help flag.** Wasp passes it through, so the command starts a real migration and then blocks. `npx wasp db` with no command prints the database commands and their flags instead.
- `npx prisma migrate deploy` is **not** a substitute. It only applies migration files that already exist; it never generates one, so against an un-migrated schema change it reports nothing to do and exits cleanly — success-looking, and wrong.

## The site — Prisma directly

`site/` has no Wasp, so it migrates with Prisma itself, against the committed `site/schema.prisma` and `site/migrations/` — no copy is made anywhere. The scripts read `DATABASE_URL` from `site/.env.server`, and the environment wins over the file:

```bash
cd site && npm run db:migrate -- --name <describe-the-change>   # prisma migrate dev: write and apply a migration
cd site && npm run db:deploy                                    # prisma migrate deploy: apply the committed ones
cd site && npm run db:status                                    # prisma migrate status
```

The same two cases hold, and the same rule about who decides. An additive change runs with `--name` and raises no prompt. A destructive one makes Prisma ask for confirmation, which it cannot do without a terminal — and, as for hq, `migrate dev` refuses outright with no terminal, `--create-only` included. So say what will be lost, ask, and if approved write the migration from the difference, as for hq, then apply it:

```bash
cd site && export $(grep -E '^DATABASE_URL=' .env.server | xargs)
mkdir migrations/$(date -u +%Y%m%d%H%M%S)_<describe-the-change>
npx prisma migrate diff --from-url "$DATABASE_URL" \
  --to-schema-datamodel schema.prisma --script > migrations/<that folder>/migration.sql
npm run db:deploy && npx prisma generate     # applies it, asking nothing; then regenerates the client
```

The database must be at the state of the previous migration; read the SQL before applying it. This path has not yet been run on the site; watch the output, and correct this skill if it differs. `db:deploy` is not a substitute for `db:migrate`, for the reason given above. The image applies migrations itself at every start (`prisma migrate deploy`), and `db:migrate` regenerates the Prisma client; after a pull that changes the schema, `npm install` (its `postinstall`) does.

---
