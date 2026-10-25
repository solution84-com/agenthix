/**
 * When masking finds a secret in a run's output, the run is flagged *printed a secret* and the place's administrators
 * are told to rotate it (workflows spec part 2, *Masking*; part 3, S8). The notice names the workflow and the
 * secrets, never a value.
 */
import { prisma } from 'wasp/server'
import { notificationsChanged } from '../server/personEvents'
import { placeAdministrators, type WorkflowPlace } from './placeAccess'

export const PRINTED_SECRET_NOTIFICATION = 'workflow_printed_secret'

async function secretsPageUrl(place: WorkflowPlace): Promise<string> {
  if (place.type === 'user') return '/space/secrets'
  const project = await prisma.project.findUnique({ where: { id: place.id }, select: { key: true, personalSpace: true } })
  if (!project) return '/'
  return project.personalSpace ? '/space/secrets' : `/projects/${project.key}/secrets`
}

export function printedSecretNotice(workflow: string, names: string[]) {
  const which = names.length === 1 ? `the secret ${names[0]}` : `the secrets ${names.join(', ')}`
  return {
    title: `${workflow} printed ${which}`,
    body:
      `Masking hid it in the output, but treat it as seen: get a new value from its issuer, replace it here, and ` +
      `check what ${workflow} prints.`,
  }
}

export async function tellAdministratorsOfPrintedSecret(place: WorkflowPlace, workflow: string, names: string[]): Promise<void> {
  const admins = await placeAdministrators(place)
  if (!admins.length) return
  const { title, body } = printedSecretNotice(workflow, names)
  const actionUrl = await secretsPageUrl(place)
  await prisma.notification.createMany({
    data: admins.map((userId) => ({ userId, type: PRINTED_SECRET_NOTIFICATION, title, body, actionLabel: 'Replace it', actionUrl })),
  })
  notificationsChanged(admins)
}
