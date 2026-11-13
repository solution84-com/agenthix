# Feature flags

A feature that is not ready ships behind a flag. Every flag has a **stage**, and one rule in core decides from the
stage, the kind of build and the organisation's switch whether the feature is on. The decision is
[ADR-0172](../adr/adr-0172-a-flag-has-a-stage.md); it replaces the two states of an earlier record, on in development
and off in production.

A **demo** is not a flag. It is a setting of the install, `DEMO_MODE`, written by `agenthix install --demo` and read once at start; a flag is for a feature that is not ready and is switched by an organisation's admin, while being a demo is a property of the machine ([ADR-0186](../adr/adr-0186-a-demo-is-a-setting-of-the-install.md), [deployment](deployment.md#a-demo-installation)).

The list is `FEATURE_FLAGS` in `core/src/shared/featureFlags.ts`. Each entry names the flag, its stage, what it holds
back (`feature`) and when it goes (`removeWhen`).

## The four stages

| Stage | Means | Development | Test run | Production |
|---|---|---|---|---|
| **experimental** | Being tried; may change shape or be dropped | Off, unless a developer switches it on | Off, unless the test's own group switches it on | Off, and cannot be switched on |
| **preview** | Built, waiting on something outside it | On, unless a developer switches it off | Off, as shipped | Off |
| **beta** | Usable, unfinished; an organisation may choose it | On, unless a developer switches it off | Off, as shipped | Off, unless the organisation's admin switches it on |
| **released** | Done | On, unless a developer switches it off | On | On, unless the organisation's admin switches it off |

A **development build** is one whose `NODE_ENV` is `development` or `test`. Anything else, including no value, is
production, so a deployment that forgets to say fails closed. A **test run** (`test`) can switch any flag, as
development can, but starts every flag at its production value, so each test runs as shipped.

In production a switch can do exactly two things: turn a beta on, and turn a released flag off. The switch of an
experimental or preview flag is ignored there, and so is a switch left over for a beta that went back to preview. When
a flag is released, an admin's earlier choice to switch it on is ignored: it is on.

## Moving a flag

Moving a flag to another stage is a commit to the list, and a release decision.

- **Only a minor or major release moves a flag forward.** A patch holds fixes only. It may move a flag back (released to
  beta, for example) when stopping a broken feature reaching everyone is the fix, never forward. Pre-releases
  (`-alpha.N`, `-rc.N`) do not count as releases here.
- **A flag leaves experimental only with all its tests passing** ([Tests](#tests)).
- **A released flag lives for one minor release.** Its entry records the minor it went live in, `releasedIn: '0.2'`
  (the type requires it exactly when the stage is released). The flag is removed by the next minor release, with the
  feature left on: its gates, its switch and its tests of the off path go with it. The compiler lists what to remove,
  because flag names are typed from the list and every `withFeature` and every hidden-while-off test names its flag.
- **A release is refused while a flag is overdue.** `flagsOverdue(version)` (`core/src/shared/featureFlagReleases.ts`)
  names the released flags whose `releasedIn` is an earlier minor or major line than the version. Two places call it
  through `scripts/release/flags-overdue.mjs`: the workflow that publishes a tag (`publish-images.yml`) and the
  release rehearsal (`scripts/release/prove.sh`, when `RELEASE_VERSION` names the version to be tagged). Patches of the
  same line and pre-releases of it do not count; a pre-release of a later minor does.

## The *Features* screen

One screen, *Features* in the organisation's settings (`/admin/settings/features`), manages the switches. They are stored
on the organisation's own record in hq (`Org.featureSwitches`, one per hq), each with who changed it and when.

- **In production** it lists the flags in beta and those released in this minor release, to organisation admins. Each
  has a title, a *Beta* or *New in this release* label, one line saying what it is, and a switch. Switching one applies
  to the whole organisation. Switching a feature off hides it and makes it refuse again; what it stored is kept, and
  switching it back on finds it. With none listed, the screen says there is nothing to try.
- **In a development build** it lists every flag grouped by stage, explains all four stages, and lets a developer
  switch any of them. The choices live in that developer's own hq database.

`getFeatures` (a query, answering every signed-in person, so screens can ask) and `setFeature` (an action, admin only)
are in `hq/src/features/operations.ts`. `setFeature` refuses a flag that cannot be switched in this build, and every
refusal ends "Nothing was changed.". The words for each flag and stage are in `hq/src/shared/features.ts`, typed from the
list, so adding a flag without words does not compile.

## How each program checks a flag

**There is one rule**, `isFeatureOn(flag, { env, switches })` in core: a pure function of the flag's stage, the kind of
build and the organisation's switches. No program decides on its own, and nothing reads `NODE_ENV` to decide a flag
except through it.

| Program | The check | Where the switches come from |
|---|---|---|
| **hq's server** | `requireFeature(flag)` first in each of the feature's operations, routes and socket handlers. Off, it answers 404, *not available*, and does nothing | The organisation's record, cached for a few seconds |
| **hq's screens** | `useFeature(flag)`, from the `getFeatures` query. A convenience only; the server is the protection | hq's server |
| **Agents** | When hq mints or renews a run's capability, the tools of every flagged feature that is off are added to its never-allowed list; the instructions of a feature are written only while it is on | The organisation's record |
| **The site** | `requireFeature` or `featureMethod` before each of the feature's methods and the relay's doors | hq's word, below |
| **The Fleet Console** | Shows a feature's section, and answers its routes, only while hq says the feature is on | hq, through the console link's `features.on`; none are on while the link is down |
| **The host service and its command line** | `isFeatureOn` with the container's own `NODE_ENV` and no switches (`cloudFeatureOn` in `host/src/cloud/flag.ts`), so only a flag's stage and the kind of build decide: a preview or experimental flag is off on every image | None: it takes no switches |

### The site takes hq's word for two things only

hq sends the organisation's switches with each instruction on the control channel (`features` on the request, site
protocol 1.12; [versioning](versioning.md)). The site reads them through `parseFeatureSwitches`, which keeps only a
listed flag's own boolean, and applies the same rule with its own `NODE_ENV`. So on a production site hq's word can turn
on a beta or turn off a released feature, and nothing else: it cannot turn on an experimental or preview flag. An agent
cannot reach the switches; they arrive only on hq's channel.

The switches of the request being answered are the ones in force while it is answered, so two requests at once stay
apart. A run keeps the switches it was started with, and the model relay and the relay's doors use those, not later
ones; a door that no request opened uses the latest received.

A site's refusal is a channel error that says the feature is not available and ends "Nothing was changed.". hq has
usually refused first.

## Tests

**Every test runs as shipped**: each flag at its production value, no beta switched on. **A feature's own tests switch
its flag on** with one helper, `withFeature(flag, () => { … })` around a group of tests, never globally. Inside the
group the flag is on; outside it, off.

| Suite | Where the helper is | What it does before each test, and undoes after |
|---|---|---|
| Unit tests (core, hq, site) | `@agenthix/core/testing` | Hands `isFeatureOn` the switch in memory; counted, so groups nest |
| hq integration | `hq/src/test/withFeature.ts` | The in-memory switch, plus the switch on every organisation record, as the screen sets it |
| hq end-to-end | `hq/e2e/fixtures/withFeature.ts` | Switches through `set-feature` as the e2e admin, and restores the value it found |
| Cross-app | `tests/cross-app/harness/features.ts` | The same, through hq; the site follows hq |

Three kinds of test, and none is written twice:

- **Tests of anything else** run with the feature off, as shipped, and catch it leaking into what ships.
- **Tests that the feature is hidden while off** (no button, operations refusing, agents not given its tools) sit outside
  `withFeature`, one per entry point. In the end-to-end and cross-app suites, which the full regression also runs with
  every flag on, they sit inside `withFeatureOff(flag, …)`, which switches the flag off for the group whatever the
  run's default, so they hold in that run too and always block.
- **Tests of the feature working** sit inside `withFeature`.

**An end-to-end spec that uses `withFeature` runs its group in one worker, in order** (`test.describe.configure({ mode:
'default' })`), because the switch is on the organisation's record and so applies to a spec running in another worker at
the same moment. See `hq/e2e/README.md`.

**What blocks.** A failing test blocks a merge, except one inside `withFeature` for a flag at **experimental**. That
failure is recorded, the test is reported as skipped with the error, and the run's summary lists it under *Experimental
failures* with the flag's name. A developer whose change breaks an experiment they do not know is not stuck; a
maintainer fixes an experiment's failures in a batch. From preview on, a feature's tests block like any other, which is
why a flag leaves experimental only with all of them passing. The summary is printed by a global setup in each module's
test configuration (`experimentalFailuresGlobalSetup` from `@agenthix/core/testing`).

**The all-on run.** The full regression adds one run of the end-to-end and cross-app suites with every flag on, to catch
features that clash: set `TEST_ALL_FEATURES=1`, which only the test seed and the cross-app setup read. Without it, the
seed writes production's values for every flag.

## Development builds

`wasp start` and the tests set `NODE_ENV` for hq. The site's `npm run dev` sets `NODE_ENV` to `development` unless it is
already set, so a flag a developer switches on in hq is not refused by a site that counts itself as production. The
image keeps `NODE_ENV=production`. The cross-app suite starts the site with `npm run dev`, and before each file sets
every flag through hq to its shipped value.

## What a new flagged feature does

1. Add the flag to the list with its stage, and words for it in `hq/src/shared/features.ts`.
2. Check `requireFeature` first in every server entry point: hq's operations, routes and socket handlers, the site's
   methods and the relay's doors. Use `useFeature` to hide its screens, and the flag's gate where hq assembles a run.
3. Write its tests inside `withFeature`, and one test per entry point, outside it, that the feature refuses while off.
