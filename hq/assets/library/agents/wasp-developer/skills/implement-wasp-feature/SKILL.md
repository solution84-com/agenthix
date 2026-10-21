---
name: Implement Wasp Feature
description: Implement a feature in a Wasp codebase following Wasp conventions. Covers the full pattern: schema, main.wasp.ts, server, and client layers.
---

# Implement Wasp Feature

Use this skill when working through an implementation plan step. It covers the Wasp-specific patterns you must follow in this codebase.

## Before Writing Any Code

1. Read all files mentioned in the plan — understand what exists before adding to it
2. Check the current `main.wasp.ts` for any existing declarations related to your feature
3. Note the pattern used by the nearest existing feature — match it

## Adding a New Page

1. Create the React component in `src/pages/<section>/<PageName>.tsx`
2. Add to `main.wasp.ts` — the import at the top, the declaration in the `spec` list:
   ```typescript
   import { MyPage } from "./src/pages/section/MyPage" with { type: "ref" };
   // …
   route("MyRoute", "/my-path", page(MyPage, { authRequired: true })),
   ```
3. Client imports: `react`, `react-router`, `wasp/client/operations`

## Adding a Server Action or Query

**Query** (read-only, cached on client):
1. Create handler in `src/<module>/queries.ts`:
   ```typescript
   import type { GetMyThing } from 'wasp/server/operations'
   export const getMyThing: GetMyThing<Args, Return> = async (args, context) => {
     if (!context.user) throw new HttpError(401)
     return context.entities.MyModel.findMany({ ... })
   }
   ```
2. Add to `main.wasp.ts`:
   ```typescript
   import { getMyThing } from "./src/<module>/queries" with { type: "ref" };
   // …
   query(getMyThing, { entities: ["MyModel"] }),
   ```
3. Client usage: `const { data } = useQuery(getMyThing, args)`

**Action** (write, invalidates queries):
1. Create handler in `src/<module>/actions.ts` — thin wrapper only:
   ```typescript
   import type { CreateMyThing } from 'wasp/server/operations'
   export const createMyThing: CreateMyThing<Args, Return> = async (args, context) => {
     if (!context.user) throw new HttpError(401)
     return createMyThingRecord(args)  // delegate to service
   }
   ```
2. Business logic goes in `src/<module>/<module>Service.ts`
3. Add to `main.wasp.ts` like the query example above, with `action(...)`
4. Client usage: `const createFn = useAction(createMyThing)`

## Adding a Schema Model

1. Add the model to `schema.prisma`
2. Run: `./scripts/dev/db.sh migrate`
3. The migration will be created in `migrations/` — commit it alongside the code

## Adding an M2M API Route

1. Add handler to `src/server/apis.ts`:
   ```typescript
   export const myEndpoint = async (req: Request, res: Response, context: any) => {
     // auth is handled by middleware, not here
     res.json({ data: ... })
   }
   ```
2. Add to `main.wasp.ts`:
   ```typescript
   import { myEndpoint } from "./src/server/apis" with { type: "ref" };
   // …
   api("GET", "/api/v1/my-endpoint", myEndpoint, { auth: false }),
   ```

## Common Mistakes to Avoid

- **Missing main.wasp.ts declaration** — the app will build but the route/operation won't exist
- **Server code in client files** — importing `wasp/server` from a page component breaks the build
- **Business logic in actions/queries** — put it in a service file; keep wrappers thin
- **Forgetting to migrate** — schema changes without a migration cause runtime failures
- **Editing `.wasp/out/`** — it is overwritten every build; changes are lost

## After Each Logical Unit

```bash
git add <specific files>
git commit -m "feat: <description> (#<task-id>)"
```

Do not commit everything at once at the end. Commit as you complete each meaningful step.
