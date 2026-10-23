/**
 * The Cloud protocol's version: what hq and Agenthix Cloud speak on every call between them, as `major.minor`, under
 * the rule every connection follows (`checkProtocolCompatibility`, ../protocol/compatibility.ts): the two sides work
 * together while their majors are at most one apart, and the newer side speaks the older side's major. A minor adds
 * (a new endpoint, error or optional field, which the other side ignores until it knows it); a major breaks.
 *
 * - **hq states its version on every call**, in `CLOUD_PROTOCOL_VERSION_HEADER`, with `User-Agent: hq/<release>`
 *   naming the program and its release (for Cloud's records; nothing is decided on it).
 * - **Cloud answers every call with its own**, in the same header, refusals and 429 included.
 * - **Cloud refuses a call** that states no version, one it cannot read, or one two or more majors from its own, with
 *   `CLOUD_UPGRADE_REQUIRED_STATUS` (426), its own version in the header, and `CloudProtocolRefusal` as the body,
 *   before anything else of the call is read (`checkHqCloudProtocol`).
 * - **hq reads Cloud's version on every answer** (`checkCloudAnswerProtocol`). An answer without the header is read as
 *   the baseline, 1.0. One two or more majors apart, or a 426, stops hq calling Cloud: hq records why, naming the side
 *   that must upgrade, and asks nothing more of Cloud until that can have changed.
 *
 * Signing in sends the person's browser to Cloud's authorize page: that is a visit, not a call of hq's, and carries no
 * version; the code exchange that finishes it is a call, and does.
 */
import { checkProtocolCompatibility, type ProtocolCompatibility } from '../protocol/compatibility.js'

export const CLOUD_PROTOCOL_VERSION = '1.1'
export const CLOUD_PROTOCOL_VERSION_HEADER = 'X-Cloud-Protocol-Version'
/** RFC 9110 §15.5.22, Upgrade Required. */
export const CLOUD_UPGRADE_REQUIRED_STATUS = 426

/** What an answer that states no version is taken to speak: the baseline, so a Cloud built before the header works. */
const ASSUMED_WHEN_ABSENT = '1.0'

/** Cloud's 426 body, in the RFC 6749 error shape its other refusals have. hq reads the status and the header, not this. */
export type CloudProtocolRefusal = { error: 'unsupported_protocol_version'; error_description?: string }

/** Cloud's side: whether to serve a call from hq that stated `stated`. Anything but `ok` is answered 426. */
export function checkHqCloudProtocol(stated: string | null | undefined): ProtocolCompatibility {
  return checkProtocolCompatibility(CLOUD_PROTOCOL_VERSION, stated)
}

/** hq's side: where Cloud's answer stands, read as 1.0 when it states none. */
export function checkCloudAnswerProtocol(stated: string | null | undefined): ProtocolCompatibility {
  return checkProtocolCompatibility(CLOUD_PROTOCOL_VERSION, stated == null || stated.trim() === '' ? ASSUMED_WHEN_ABSENT : stated)
}
