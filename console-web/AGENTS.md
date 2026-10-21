# console-web — the Fleet Console's screens

Read the repository's [`AGENTS.md`](../AGENTS.md) and [`console/AGENTS.md`](../console/AGENTS.md) first; this file
adds what applies to work in `console-web/`.

The fleet admins' screens: a React 19 app built with Vite and Tailwind v4 (the same majors as `hq/`), with
`lucide-react` icons. It is built into static files (`npm run build` → `dist/`), which the Fleet Console's own server
serves on `127.0.0.1` behind its guards (`console/src/http/web.ts`); the image copies `dist/` to `/app/web`. It talks
to nothing but that server's API under `/api/`. Nothing here imports from `hq/`, `site/`, `host/` or `console/`.

- **The look is the boards' and the tokens'.** Colours and fonts come from `@agenthix/ui/theme/tokens.css`; the Fleet
  Console's own values are a token set there, selected by `data-portal="fleet-console"` on `<html>` (`index.html`),
  under the same token names as hq's. Read [`ui/DESIGN-SYSTEM.md`](../ui/DESIGN-SYSTEM.md): never a hex value here.
- **Components:** what HQ draws too lives in `@agenthix/ui` (`Button`, `EmptyState`, `StatePill`, `HostingBadge`,
  `Modal`, `SearchField` …); what only the Fleet Console draws lives in `src/components/`. Reuse before drawing a
  second: where the Fleet Console's look differs (its gradient primary, its quiet outline danger), the difference is
  a token in the Fleet Console's set, never a second component.
- **It makes no request off its machine.** Inter and JetBrains Mono are bundled (`@fontsource-variable/*`); no CDN,
  no remote origin. The server's content security policy allows this origin only and nothing inline, so: no inline
  `<script>` or `<style>` in `index.html`, and no asset inlined as a `data:` URL (`assetsInlineLimit: 0`). React's
  `style` props are allowed (they are set through the DOM, not markup).
- **Light and dark:** light unless the browser stored dark (`src/theme.ts`, key `theme`); `public/theme-init.js`, a
  file loaded in the page head, applies it before the first paint.
- **Talking to the server:** only through `api()` in `src/api/client.ts`. It sends JSON with the session's CSRF
  header (`x-csrf-token`), and a 401 returns the app to the sign-in page. The server returns the token once, at
  sign-in; it is kept in `sessionStorage` (`src/api/csrf.ts`), never `localStorage` or a cookie. A new tab asks an
  open one for it over a same-origin `BroadcastChannel` (`src/api/tokenShare.ts`), and signing out tells the others.
- **Screens and the shell:** a screen is a path (`src/router.tsx`: `usePath`, `navigate`, `Link`), drawn inside the
  shell (`src/shell/`) by `Page` in `src/App.tsx`. The paths: `/` (Dashboard); `/hq` and `/hq/address`;
  `/sites/<fingerprint>` (`/fleet/<fingerprint>` redirects to it); `/maintenance` (`/changes` and `/scheduled` redirect
  to it); a move followed at `/hq/move` and `/sites/<fingerprint>/move` (with `?move=<id>`, the move a notice names:
  its progress, or its outcome once over, or the page itself once it is no longer held), while the older `/hq/<kind>` and
  `/sites/<fingerprint>/<kind>` (`upgrade`, `capacity`, `suspend`, and `move` with no move under way) open *Plan
  maintenance* on that page with the kind chosen; `/backups`, `/backups/<fingerprint>` and
  `/backups/<fingerprint>/export`; `/activity`; `/fleet-admins`; `/fleet/add` and `/fleet/add/restore` (Add a site,
  and restoring a lost one); `/help` and `/help?topic=<id>` (`&section=<heading id>`); `/account`; and
  `/remote-access`. The menu (`menu.ts`,
  `Sidebar.tsx`) is in three parts: Dashboard (`/`) and HQ fixed at the top; every site, named after its machine with
  a dot for its state, in a middle part that scrolls; the jobs pinned at the bottom (Maintenance, Backups, Activity,
  Fleet admins, Remote access, Help), then the person. There are no breadcrumbs. The bell
  opens the notices in a panel beside the menu, over the page, kept in the address (`?panel=notices`, written in
  place) as HQ keeps its own; leaving the page closes it. *Plan maintenance* is the other panel, at the page's right
  (`?panel=maintenance&which=<hq or fingerprint>&what=<kind>`, `useShellPanel().openMaintenance`); Escape, its close
  button or a click beside it closes it. A menu item whose screen is not built yet shows a "comes later" page. Pages
  live in `src/pages/`, one folder each; a card that shows a thing is one link as a whole (`CardLink`), with no second
  link or button inside it.
- **Agenthix Cloud:** its screens live in `src/cloud/`, drawn in every build and gated by what is true, never a flag:
  the Cloud section of HQ's page in each state (not connected, waiting for approval, connected, HQ on Cloud), the
  organisation switcher under the machine badge (`shell/OrgSwitcher.tsx`), and the one-line offers on the Dashboard,
  backups and address pages (`CloudOfferLine.tsx`). Each reads the server's `GET /api/cloud` family and says "Not
  connected" for a 409 `not_connected` answer. Links out to Cloud are built from the `cloudUrl` the server returns
  (`linkOut.ts`), and through remote access the section is read-only.
- **Maintenance:** every kind of work on HQ or a site — upgrade, change capacity, move, suspend, restore a backup — is done from *Plan
  maintenance* (`src/pages/maintenance/PlanMaintenancePanel.tsx`), the one door to it from the Maintenance page, HQ's
  page and a site's page; Erase stays a button of its own on HQ's page. *Which* and *What* are drop-downs
  (`DropDown`) that are always there: changing one never starts over. Each kind's fields live in `src/forms/` and keep
  what was typed with `useDraft` (`forms/drafts.tsx`), as does the machine's answer (`useChangeCommand`); every kind
  ends in `MaintenanceEnding` — *When* (`ScheduleWhen`, Now / At a time…, with one line on what members see) and the
  one button, whose words follow it: *Do it now* or *Schedule for <day time>* (`doItLabel`). Kinds keep their own
  names; the job is called maintenance on every screen, never "change".
  *Restore a backup* (`forms/RestoreChange.tsx`) has a second door: *Restore…* beside each night on a machine's
  backups page (`pages/backups/NightsCard.tsx`) opens the panel on it with that night chosen (`&night=<backup id>`,
  `useShellPanel().openRestore`). It sends through the server's `POST /api/hosts/:fp/restore`, never the command route.
- **Help:** the pages of `docs/guide/running-agenthix/` are read at build time (`src/pages/help/topics.ts`) and drawn
  at `/help`; nothing is fetched. Where a section's idea needs explaining, put a `HowThisWorks` link beside its title
  (`help` on `PageHeading`, `ListTitleRow` and `FactCard`), not on every card. `helpLinks.test.ts` checks that each
  placed link names a real topic and a real heading of it.
- **`/_components`** shows every component, light and dark side by side, in development builds only
  (`import.meta.env.DEV`); a production build leaves it out.

Commands, each in `console-web/` (`core/` must be built first, `cd core && npm run build`):

| Command | What it does |
|---|---|
| `npm run dev` | Vite on `127.0.0.1`, passing `/api` to the Fleet Console at `127.0.0.1:4300` as if the page came from it |
| `npm run build` | The static files, in `dist/` |
| `npm run typecheck` | The browser code (`tsconfig.json`: DOM, no Node types), then the configs and tests (`tsconfig.node.json`) |
| `npm test` | The unit tests (vitest, jsdom) |
