/** The link a client's GitHub owner opens to install the App, and the note to send with it (spec part 4, *A client connects*). */
import { HttpError } from 'wasp/server'
import { getApp } from './githubApp'

export type InstallLink = { url: string; note: string }

export function installLinkFor(slug: string, orgName: string): InstallLink {
  const url = `https://github.com/apps/${encodeURIComponent(slug)}/installations/new`
  const note = [
    `Hello,`,
    ``,
    `${orgName} would like to work on your code through our team's HQ. To allow that, an owner of your GitHub organisation opens this link:`,
    ``,
    url,
    ``,
    `GitHub shows the app and what it may do, and you choose all repositories or only some. You need no account with us, and we never need your password.`,
    ``,
    `You stay in control: you can change what the app reaches, or remove it, in your own GitHub settings, and our access stops at once.`,
  ].join('\n')
  return { url, note }
}

export async function installLink(orgName: string): Promise<InstallLink> {
  const app = await getApp()
  if (!app) throw new HttpError(409, 'No GitHub App is registered yet. Register it under Manage organisation › Settings › GitHub first. Nothing was changed.')
  return installLinkFor(app.slug, orgName)
}
