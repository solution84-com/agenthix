/**
 * The front door's certificate question's live dependencies: the preview pattern, and the apps hq recorded. Only an
 * app's name, or the check name the relay answers itself, is given a certificate.
 */
import { prisma } from 'wasp/server'
import { previewPatternFromEnv, type CertificateAskDeps } from './previewCertificateAsk'

export const certificateAskDeps: CertificateAskDeps = {
  pattern: () => previewPatternFromEnv(),
  appExists: async appId => (await prisma.liveApp.count({ where: { id: appId } })) > 0,
}
