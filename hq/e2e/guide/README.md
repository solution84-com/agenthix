# Recipes for the user guide's screenshots

A **recipe** is a short Playwright script that opens one screen of Agenthix, with the sample organisation loaded, and
saves one screenshot. A page in `docs/guide/` shows it by its address in the GitHub Release that holds it,
`https://github.com/solution84-com/agenthix/releases/download/<tag>/<name>.png`; the name is the recipe's file name
(how a new screenshot is linked, and how the tags are pinned at a release: [`docs/guide/README.md`](../../../docs/guide/README.md#images)).

| File | What it is |
|---|---|
| `<name>.recipe.ts` | One recipe, one image: `home.recipe.ts` saves `.captures/home.png` |
| `fresh-<name>.recipe.ts` | A recipe for a screen that exists only before HQ has any people (setup). It saves `<name>`, without the prefix |
| `fresh.ts` | What fresh recipes share: a first-admin link from the running HQ, and making the first administrator |
| `capture.ts` | The helper every recipe calls |
| `console-<name>.recipe.ts` | A recipe for a screen of the Fleet Console. It saves `console-<name>`, and needs no hq, site or Fleet Console running (see below) |
| `consoleCapture.ts`, `consoleSample.ts` | What the Fleet Console recipes share: the helper, and the sample of the Fleet Console's API |
| `sample.json` | The fixed date and timezone, the password, the five sample people and the open invitation |
| `.captures/`, `.report/` | The run's output. Not committed |

The sample organisation is Fernhill & Co, loaded by `../fixtures/seed-guide-data.mjs`: five people (Sam Okafor is
the administrator and the person recipes sign in as unless a page needs another), two teams, three projects
(`WEB` Website relaunch, `RES` Customer research, `QTR` Quarterly report), four agents, finished and failed runs,
one run waiting for approval in `WEB`, a routine in `QTR`, a second site, Sam's own project (`TAX`, Tax return 2026,
which only Sam sees), four providers (Anthropic, OpenRouter, AssemblyAI, Inworld) with default models chosen, two billing
profiles and a month of usage. Nothing in it names the product. Sam is
also a fleet admin, which Logs and diagnostics shows health and the support bundle to. Every date in it follows the
fixed date in `sample.json`, so two runs draw the same pictures; advance that date (to a Monday in summer time) when
the real date catches up with the week after it.

## Write a recipe

```ts
import { expect, test } from '@playwright/test'
import { capture } from './capture'

test('notifications-approval', async ({ page }) => {
  await capture(page, {
    path: '/projects/WEB',                                                     // where to go
    before: (p) => p.getByRole('button', { name: /^Notifications/ }).click(),  // optional: clicks to reach it
    ready: (p) => expect(p.getByText('Needs you').first()).toBeVisible(),      // what the shot is about
  })
})
```

- **One recipe saves one image.** Its name comes from its file name, so a name cannot disagree with the file.
  Use lowercase words joined by hyphens.
- **`ready` is what makes it deterministic.** Wait for the thing the screenshot shows, not for a time. `capture`
  also waits for the network to go quiet, but never relies on it alone.
- **`as`** signs in as another sample person (`priya`, `alex`, `jordan`, `kai`); `as: null` signs in as nobody.
- **Fresh recipes run one at a time, in file-name order**, and each builds on the last, so the names sort in the order
  of setup's steps: `fresh-setup-account` opens a first-admin link that `firstAdminLink()` asks the running HQ for,
  `fresh-setup-ai-add-provider` makes the administrator, and `-ai-key-guide`, `-ai`, `-organisation` and
  `-review` sign in as them. A key is checked with its vendor when saved, which a recipe must not reach, so the key
  form is left unsaved and `-ai` puts the provider in the database (`../fixtures/add-provider.mjs`).
- **Never click anything that changes data** in an ordinary recipe. They run in any order, and a second run
  starts from whatever the first left. Open screens, open dialogs, fill fields; do not save.
- **Text the server writes from its own clock or machine is blanked**: `capture` covers "checked 09:41", "Running
  since", the scheduler's last run and a machine's free disk with a flat box, since the fixed date reaches the
  browser and not the server. A recipe that shows more of the same passes `mask` (a list of locators).
- Every capture has the same 1440 by 900 window at twice the pixel density, hq's default (light) theme, the fixed
  date and timezone in `sample.json`, reduced motion and no text caret. Set in `../../playwright.config.ts`
  (the `guide` and `guide-fresh` projects) and in `capture.ts`; a recipe does not choose them.

## The Fleet Console's screens

The Fleet Console's recipes (`console-*.recipe.ts`) take the same pictures, in the same window, theme and date, of the
Fleet Console's built screens (`console-web/dist`, made with `npm run build` there; `npm run guide:screenshots` builds
it first). Nothing else has to run: `consoleCapture.ts` has Playwright answer every request to the Fleet Console's
address, the files from `dist/` and each `/api` request from `consoleSample.ts`, so the screens draw the same
Fernhill & Co fleet every time, signed in as Sam. A recipe calls `captureConsole`, which takes the options `capture`
does, and `join` for the Add a site screens. The sample is typed with the types the screens read the API with, so
`npm run typecheck:guide` fails when the API changes and the sample does not. The Cloud parts (the connection, remote access, the authenticator code) are answered as the Fleet Console answers them
while the organisation is not connected to Cloud. A request the sample does not answer is a 404 and is named in the
run's output.

## Run them

**The whole capture is one command**, from the repository's root: `node scripts/guide/capture.mjs`. It builds hq,
starts hq and a site on free ports against empty guide databases, runs `npm run guide:screenshots` and stops both; the
release build, the release rehearsal and the regression all run it. The steps below run the parts by hand, to work on
one recipe.

Run these from `hq/`. They use the guide databases (`agenthix_guide` for hq, `agenthix_site_guide` for the site),
never the development ones. `scripts/guide/with-guide-db.mjs` points a command at them and creates and migrates
them if missing.

1. Start the site and hq on the guide databases, each in its own terminal. Each command waits in the foreground.
   Your `.env.server` files supply everything else, as for a normal start; the wrapper also gives hq an `HQ_STORAGE_ROOT`
   (a directory under the temporary one, or your own if you set it), as an installed HQ has, so Infrastructure
   reads the same as it does there.
   ```bash
   node scripts/guide/with-guide-db.mjs bash -c 'cd ../site && DATABASE_URL="$GUIDE_SITE_DATABASE_URL" npm run dev'
   node scripts/guide/with-guide-db.mjs npx wasp start
   ```
2. Load the sample organisation (it empties the guide databases first). Knowledge pages are files on the site's disk, so
   the sample writes them under `SITE_ROOT`: set it to the same directory for the site and for this command, or the pages
   are skipped and the Knowledge recipes fail:
   ```bash
   node scripts/guide/with-guide-db.mjs node e2e/fixtures/seed-guide-data.mjs
   ```
3. Run the recipes:
   ```bash
   npx playwright test --project guide                    # every recipe
   npx playwright test --project=guide home              # one recipe
   ```

The fresh recipes need hq with no organisation yet. Stop both servers, run
`node scripts/guide/with-guide-db.mjs --reset true` (it recreates both guide databases empty), start them again,
then `npx playwright test --project guide-fresh --workers 1`. After that, load the sample organisation as above and run the
`guide` project.

`npm run guide:screenshots` does the rest in order once the servers are running on empty guide databases — the
name check, the fresh recipes, the sample organisation, then the other recipes — and `npm run guide:compare` compares the captures with
the pictures the pages link (set `GH_TOKEN` to read the releases while the repository is private:
`GH_TOKEN="$(gh auth token)" npm run guide:compare`). `npm run guide:pin -- --tag <tag>` is the step run while
preparing a release.
