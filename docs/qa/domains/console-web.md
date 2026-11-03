---
name: Domain map — console-web
description: Feature-domain carving of the console-web module (the Fleet Console's screens) for a QA audit's accuracy code pass. Domain names 1 to 7 match console.md so one agent can take a server route and its screen together. Written 2026-11-03 from src/App.tsx, src/router.tsx and the module's folders. Update only when the screens change.
updated: 2026-11-03
---

# Domain map — `console-web/`

9 domains. The screens are a React app built with Vite into static files, which the Fleet Console's server serves behind its guards; they talk only to its `/api/` routes. About 180 source files, grouped by the screen folders under `src/pages/`, with the shared shell and components in the last domain. Each subagent reads only its files; the one-line scope is what every other subagent receives for overlap awareness.

**Domains 1 to 7 carry the same names as the server's map** ([`console.md`](console.md)), so a server route and its screen go to one agent. Domain 8 has no server twin of its own: its commands go through the server's domain 3. Domain 9 is the frame around every screen.

| # | Domain | Aggregate root(s) or concern | One-line scope |
|---|---|---|---|
| 1 | Access, network & remote access | Session, CSRF token, fleet admins, remote access | sign-in, the session and its token (kept per tab, shared by `BroadcastChannel`), Your account, the fleet admins screen, Remote access and the authenticator code |
| 2 | Process start, hq link, activity & notices | Activity, notices | the Activity screen and its filters, the notices bell and panel, dismissing |
| 3 | Fleet & signed host commands | Fleet, Site, hq | the Dashboard, a site's page and its cards, disconnect, the notify setting, the hq page, its address, the relay card, erase |
| 4 | Joining & adding sites | Join | *Add a site*, the one-time code and its waiting states, *Restore a site* |
| 5 | Moves & handover | Move | *Move site…* and *Move HQ…* forms and the screens that follow a move |
| 6 | Backups, restore & exports | Backup night, Export | the Backups screens, the nights, restore, the export panel and its download |
| 7 | Cloud & live previews | Cloud section, live previews | the Cloud section, Cloud site pages, offers, fleet admins as Cloud shows them, a site's live previews |
| 8 | Maintenance & changes | Scheduled change | planning, scheduling and running upgrades, capacity, suspend, restore and hq changes; maintenance windows |
| 9 | Shell, help & shared components | App frame, theme, component library | routing, the sidebar and menus, the help topics, the shared components, the theme, the component gallery and the build |

---

## Domain scopes (files + operations)

### 1. Access, network & remote access
- **Files:** `src/api/client.ts`; `src/api/csrf.ts`; `src/api/session.ts`; `src/api/tokenShare.ts`; `src/auth/AuthContext.tsx`; `src/auth/useConsoleStatus.ts`; `src/auth/useSessionDetails.ts`; `src/pages/SignInPage.tsx`; `src/pages/YourAccountPage.tsx`; `src/pages/fleet-admins/FleetAdminsPage.tsx`; `src/pages/fleet-admins/GiveRoleModal.tsx`; `src/pages/fleet-admins/RemoveRoleModal.tsx`; `src/pages/fleet-admins/useFleetAdmins.ts`; `src/pages/remote-access/AuthenticatorSetupPage.tsx`; `src/pages/remote-access/RemoteAccessPage.tsx`; `src/pages/remote-access/TurnOnModal.tsx`; `src/pages/remote-access/useHqSite.ts`; `src/pages/remote-access/words.ts`; `src/cloud/RemoteSignIn.tsx`; `src/cloud/RemoteAccessTile.tsx`
- **Ops:** screens `/` sign-in, `/account`, `/account/code`, `/fleet-admins`, `/remote-access`, the remote sign-in view; API calls GET `/api/status`, POST/GET/DELETE `/api/session`, `/api/fleet-admins` (list, find, give, remove), `/api/remote-access`, `/api/authenticator` (set up, check, recovery codes)
- **Note:** security-sensitive: the CSRF token lives in the tab's `sessionStorage` and is handed to a new tab over a `BroadcastChannel`; it is never written to `localStorage`, a cookie or an address, and sign-out in one tab drops it in the others.

### 2. Process start, hq link, activity & notices
- **Files:** `src/pages/activity/ActivityPage.tsx`; `src/pages/activity/filters.ts`; `src/pages/activity/useActivity.ts`; `src/pages/activity/words.ts`; `src/shell/NoticesBell.tsx`; `src/shell/NoticesPanel.tsx`; `src/shell/DismissAll.tsx`; `src/shell/notices.ts`; `src/shell/StateDot.tsx`
- **Ops:** screen `/activity`; API calls GET `/api/activity`, GET `/api/notices`, POST `/api/notices/:id/dismiss`; the screen a notice opens (`NoticeTarget`)

### 3. Fleet & signed host commands
- **Files:** `src/api/command.ts`; `src/pages/dashboard/` (DashboardPage.tsx, DisconnectedCard.tsx, FleetView.tsx, HubCard.tsx, Meter.tsx, NeedsYou.tsx, SiteTile.tsx, Tiles.tsx, dashboardWords.ts, overview.ts, types.ts, useFleet.ts, words.ts); `src/pages/site/DisconnectModal.tsx`; `src/pages/site/NotifySetting.tsx`; `src/pages/site/SiteCards.tsx`; `src/pages/site/SitePage.tsx`; `src/pages/site/useHost.ts`; `src/pages/site/words.ts`; `src/pages/hq/AddressPage.tsx`; `src/pages/hq/EraseModal.tsx`; `src/pages/hq/HqCards.tsx`; `src/pages/hq/HqPage.tsx`; `src/pages/hq/HqRoute.tsx`; `src/pages/hq/RelayCard.tsx`; `src/pages/hq/hqWords.ts`; `src/pages/hq/relayWords.ts`; `src/pages/hq/useHostCommand.ts`
- **Ops:** screens `/` (Dashboard), a site's page, the hq page and its address page; API calls GET `/api/fleet`, GET `/api/hosts/:fingerprint`, POST `.../disconnect`, PUT `.../notify`, DELETE `/api/fleet/disconnected/:id`, POST `.../commands`, GET `.../figures`, GET `.../logs`, GET `/api/commands/:id`; commands sent: erase, address.set, start, stop and the other machine commands from the cards
- **Note:** the screens send commands only through the server; none is signed here. The server's checks (domain 3 there) are the contract.

### 4. Joining & adding sites
- **Files:** `src/pages/add/AddSitePage.tsx`; `src/pages/add/JoinParts.tsx`; `src/pages/add/RestorePage.tsx`; `src/pages/add/joinWords.ts`; `src/pages/add/restoreWords.ts`; `src/pages/add/useJoin.ts`
- **Ops:** screens `/fleet/add`, `/fleet/add/restore`; API calls POST `/api/joins`, GET `/api/joins/:joinId`, POST `.../confirm`, POST `.../refuse`, DELETE `/api/joins/:joinId`

### 5. Moves & handover
- **Files:** `src/pages/site/move/MoveFollow.tsx`; `src/pages/site/move/MoveForm.tsx`; `src/pages/site/move/WaitingForMachine.tsx`; `src/pages/site/move/moveWords.ts`; `src/pages/site/move/useMove.ts`; `src/pages/hq/MoveHqFollow.tsx`; `src/pages/hq/MoveHqForm.tsx`; `src/pages/hq/hqMoveWords.ts`; `src/pages/maintenance/MoveFollowPage.tsx`; `src/forms/MoveChange.tsx`
- **Ops:** *Move site…*, *Move HQ…* and their follow screens; API calls POST `/api/hosts/:fingerprint/move`, POST `/api/hq/move`, GET `/api/moves`, GET `/api/moves/:moveId`, DELETE `/api/moves/:moveId`, POST `/api/moves/:moveId/finish`

### 6. Backups, restore & exports
- **Files:** `src/pages/backups/BackupParts.tsx`; `src/pages/backups/BackupsPage.tsx`; `src/pages/backups/ExportPanel.tsx`; `src/pages/backups/NightsCard.tsx`; `src/pages/backups/SiteBackupsPage.tsx`; `src/pages/backups/commands.ts`; `src/pages/backups/download.ts`; `src/pages/backups/nights.ts`; `src/pages/backups/words.ts`; `src/forms/RestoreChange.tsx`
- **Ops:** screen `/backups` and a site's backups; API calls GET `/api/hosts/:fingerprint/backups`, POST `.../restore`, POST `.../exports/:exportId/download`, GET `/api/export-downloads/...`; commands backup.take, backup.export, backup.store

### 7. Cloud & live previews
- **Files:** `src/cloud/CloudConnectionSection.tsx`; `src/cloud/CloudFleetAdmins.tsx`; `src/cloud/CloudGroup.tsx`; `src/cloud/CloudHqHero.tsx`; `src/cloud/CloudMark.tsx`; `src/cloud/CloudOfferLine.tsx`; `src/cloud/CloudSectionStates.tsx`; `src/cloud/CloudSiteCard.tsx`; `src/cloud/CloudSitePage.tsx`; `src/cloud/accountParts.tsx`; `src/cloud/api.ts`; `src/cloud/linkOut.ts`; `src/cloud/platform.ts`; `src/cloud/useCloudFleet.ts`; `src/cloud/words.ts`; `src/pages/site/LivePreviewsSection.tsx`; `src/pages/site/livePreviewsWords.ts`; `src/pages/site/useSiteLivePreviews.ts`
- **Ops:** screens `/fleet/cloud/...`; API calls GET `/api/cloud` and its sign-in, account, sites, fleet-admins, asks and offers routes; GET/PUT/DELETE `/api/sites/:fingerprint/live-previews`
- **Note:** the live preview section is behind the `livePreview` flag at its experimental stage.

### 8. Maintenance & changes
- **Files:** `src/pages/maintenance/ChangeModals.tsx`; `src/pages/maintenance/KindForm.tsx`; `src/pages/maintenance/MaintenancePage.tsx`; `src/pages/maintenance/PlanMaintenancePanel.tsx`; `src/pages/maintenance/UpgradeRun.tsx`; `src/pages/maintenance/panelAddress.ts`; `src/pages/maintenance/routes.tsx`; `src/pages/maintenance/things.ts`; `src/pages/maintenance/useScheduleActions.ts`; `src/pages/maintenance/words.ts`; `src/shell/MaintenancePanelHost.tsx`; `src/forms/CapacityChange.tsx`; `src/forms/HqUpgradeNotice.tsx`; `src/forms/MaintenanceEnding.tsx`; `src/forms/SuspendChange.tsx`; `src/forms/UpgradeChange.tsx`; `src/forms/capacityForm.ts`; `src/forms/drafts.tsx`; `src/forms/hqSuspend.ts`; `src/forms/hqUpgrade.ts`; `src/forms/useChangeCommand.ts`; `src/components/ScheduleWhen.tsx`; `src/components/scheduleChoice.ts`; `src/components/NotifyChoice.tsx`
- **Ops:** screens `/maintenance`, `/changes/new`, redirects from `/scheduled` and `/changes`; commands upgrade, suspend, resume, capacity changes and hq upgrade or suspend, sent through the server's `POST /api/hosts/:fingerprint/commands`
- **Note:** pairs with the server's domain 3, not with a domain of its own.

### 9. Shell, help & shared components
- **Files:** `index.html`; `public/theme-init.js`; `src/main.tsx`; `src/App.tsx`; `src/router.tsx`; `src/theme.ts`; `src/index.css`; `src/features/features.tsx`; `src/pages/ComesLaterPage.tsx`; `src/pages/NotFoundPage.tsx`; `src/pages/help/` (HelpPage.tsx, markdown.ts, renderMarkdown.tsx, topicIds.ts, topics.ts); `src/shell/Brand.tsx`; `src/shell/LocalOnlyFoot.tsx`; `src/shell/MenuEntry.tsx`; `src/shell/OrgSwitcher.tsx`; `src/shell/PersonMenu.tsx`; `src/shell/Shell.tsx`; `src/shell/Sidebar.tsx`; `src/shell/SitesMenu.tsx`; `src/shell/collapse.ts`; `src/shell/menu.ts`; `src/shell/usePopover.ts`; `src/shell/useShellPanel.ts`; `src/components/Card.tsx`; `src/components/CardLink.tsx`; `src/components/ConfirmModal.tsx`; `src/components/DropDown.tsx`; `src/components/FactCard.tsx`; `src/components/Headings.tsx`; `src/components/HowThisWorks.tsx`; `src/components/HqLink.tsx`; `src/components/Notice.tsx`; `src/components/ThemeSwitch.tsx`; `src/components/index.ts`; `src/dev/BackupSamples.tsx`; `src/dev/CloudSamples.tsx`; `src/dev/ComponentsPage.tsx`; `src/dev/HqSamples.tsx`; `src/dev/fleetSamples.ts`; `package.json`; `package-lock.json`; `tsconfig.json`; `tsconfig.node.json`; `vite.config.ts`; `.gitignore`
- **Ops:** the route table (`/account`, `/help`, `/activity`, `/fleet-admins`, `/fleet/add`, `/remote-access`, `/maintenance`, `/backups`, the not-found screen and the "comes later" screens); the Help topics; the light and dark theme switch; the component gallery (development only)
- **Note:** the screens use `@agenthix/ui` tokens, never a hex value in a component.

---

## Excluded from all domains

- Tests and test support: `*.test.ts`, `*.test.tsx`, `src/__tests__/`, `vitest.config.ts`, `vitest.setup.ts`, `vitest.experimental-failures-setup.ts`.
- `node_modules/`, `dist/`, `.agents/`.
- `AGENTS.md` and `CLAUDE.md`.
