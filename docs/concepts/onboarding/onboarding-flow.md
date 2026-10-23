# Onboarding

Onboarding happens for every invited person, an admin included. It is the organisation's, not Agenthix's: every
screen carries the organisation's identity (the cover banner and picture of the sign-in page, one column on top)
and "Powered by Agenthix" at the foot, never Agenthix's own header. The first admin of a fresh HQ goes through
[setup](../setup/setup-flow.md) instead and is never sent here.

## Entry

An invitation link is `/invite/<code>`, built from HQ's configured address (see
[invitations](../auth/invite-auth.md)). The same address opens setup for the first admin's link and onboarding for
every other. The code leaves the address bar once read. A link that no longer works shows a problem screen naming who to
ask. There is no `/accept-invite`.

## The steps

The step is in the address (`/onboarding?step=join|you|review`), so a refresh keeps it and Back and Forward
move between steps. The step indicator counts the steps the person has to do; the last look is not counted.

1. **Join**, on `/invite/<code>`. The invitation in words ("Avery invited you to join Acme Corp as a Member, and to
   Website Redesign and Merchant app", with its label and when it closes), then name, username, password and
   **Join Acme Corp**. Beside the form, a few people already in the organisation and the projects they are joining
   with how many people each has: names only, nothing from inside a project. Making the account signs the person in.
   Coming back to it (`/onboarding?step=join`) shows the account to review: the name editable, the username fixed,
   the password as set.
2. **You**: a picture (uploaded and shown, with Change and Remove) and a time zone filled in from the browser and
   changeable. Beside it, how they will appear to others. These are the same operations Settings › Profile and
   Settings use.
3. **A last look**: them and what they are joining, each with **Edit**, which returns to the last look. **Start
   working** lands them in the first project the invitation names, with its message box ready and a one-time welcome line, every project the invitation added
   pinned; with no project named, on Home.

Onboarding has no step for models: they are the organisation's, supplied by its admins from setup on
([providers](../providers/providers.md), [models](../models/models.md)). A person brings no key. If they have a Claude
subscription of their own, they can sign in with it later in **Settings**, for work in their own place only. If the
organisation's models stop working, Home says agents cannot answer yet and tells an admin where to fix it.

Onboarding keeps nothing of its own: the person is a member from the moment the account exists, and a person who
leaves midway simply lands on Home the next time they sign in.

## Where the code is

| File | Role |
|---|---|
| `hq/src/auth/pages/InvitePage.tsx` | The invitation link's page: reads it, makes the account, hands on to setup or onboarding |
| `hq/src/onboarding/pages/OnboardingPage.tsx` | The page after Join and its step state |
| `hq/src/onboarding/pages/steps/` | One component per step, the frame and the people-and-projects aside |
| `hq/src/onboarding/onboardingFlow.ts` | The steps, which are counted, what comes before and after |
| `hq/src/onboarding/queries.ts` | `getOnboardingData`: the organisation, the person, what the invitation made them part of |
| `hq/src/auth/inviteGlimpse.ts` | The people and projects shown beside Join |
