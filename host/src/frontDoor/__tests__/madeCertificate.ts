/** A throwaway self-signed certificate and key, made with the openssl command when a test needs one; nothing is kept. */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export function madeCertificate(names: string[]): { certificate: string; privateKey: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'made-certificate-'))
  try {
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '36500',
      '-subj', '/CN=test only', '-addext', `subjectAltName=${names.map(n => `DNS:${n}`).join(',')}`,
      '-keyout', path.join(dir, 'key.pem'), '-out', path.join(dir, 'cert.pem'),
    ], { stdio: 'ignore' })
    return { certificate: fs.readFileSync(path.join(dir, 'cert.pem'), 'utf8'), privateKey: fs.readFileSync(path.join(dir, 'key.pem'), 'utf8') }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
