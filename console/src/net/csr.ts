/**
 * The key remote access ends TLS with, made here and never sent anywhere, and the certificate request Cloud has
 * signed for it (pre-release spec B9). ECDSA P-256 with SHA-256: what every browser and Node's TLS accept, where an
 * Ed25519 certificate is still refused by browsers. The request names one DNS name, as its subject and its only
 * subject alternative name.
 */
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { bitString, contextTag, octetString, oid, pem, sequence, set, utf8String, integer } from './der'

const OID = {
  commonName: '2.5.4.3',
  extensionRequest: '1.2.840.113549.1.9.14',
  subjectAltName: '2.5.29.17',
  ecdsaWithSha256: '1.2.840.10045.4.3.2',
}

/** A new P-256 key, as PKCS #8 PEM for the state folder. */
export function makeRemoteKey(): string {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  return privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
}

/** A PKCS #10 request for `name` alone, signed with the key. */
export function certificateRequest(keyPem: string, name: string): string {
  const key: KeyObject = createPrivateKey(keyPem)
  const spki = createPublicKey(key).export({ type: 'spki', format: 'der' })
  const subject = sequence(set(sequence(oid(OID.commonName), utf8String(name))))
  // GeneralNames ::= SEQUENCE OF GeneralName; dNSName is [2] IMPLICIT IA5String.
  const altNames = sequence(contextTag(2, false, Buffer.from(name, 'ascii')))
  const extensions = sequence(sequence(oid(OID.subjectAltName), octetString(altNames)))
  const attributes = contextTag(0, true, sequence(oid(OID.extensionRequest), set(extensions)))
  const info = sequence(integer(0), subject, spki, attributes)
  const signature = sign('sha256', info, { key, dsaEncoding: 'der' })
  return pem('CERTIFICATE REQUEST', sequence(info, sequence(oid(OID.ecdsaWithSha256)), bitString(signature)))
}
