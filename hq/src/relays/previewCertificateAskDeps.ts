/**
 * The front door's certificate question's live dependencies: the preview pattern, and the apps hq recorded. Only an
 * app's name, or the check name the relay answers itself, is given a certificate.
 */
import { prisma } from 'wasp/server'
import { isOrgFeatureOn } from '../features/switches'
import { previewPatternFromEnv, type CertificateAskDeps } from './previewCertificateAsk'

export const certificateAskDeps: CertificateAskDeps = {
  pattern: () => previewPatternFromEnv(),
  // While the live preview's flag is off no app is given a certificate; the check name still is (the install's own).
  appExists: async appId => (await isOrgFeatureOn('livePreview')) && (await prisma.liveApp.count({ where: { id: appId } })) > 0,
}
