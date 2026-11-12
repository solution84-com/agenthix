/**
 * Uploads in the demo (live demo spec: "capped at a small size and served only as downloads, so the demo cannot host
 * files for others"). A file reaches hq as base64 in an operation's JSON body, a third larger than the file, so the
 * body's cap is the file's plus that third and a little room for the rest of the arguments.
 */
import type { RequestHandler } from 'express'
import express from 'express'

export const DEMO_UPLOAD_MAX_BYTES = 2 * 1024 * 1024
export const DEMO_UPLOAD_BODY_MAX_BYTES = Math.ceil(DEMO_UPLOAD_MAX_BYTES * 4 / 3) + 64 * 1024

export const DEMO_UPLOAD_TOO_LARGE = 'The demo takes files up to 2 MB. Nothing was uploaded.'

const demoUploadJson = express.json({ limit: DEMO_UPLOAD_BODY_MAX_BYTES })

/**
 * An upload operation's body in demo mode: refused at once, with the sentence, when it says it is larger than the cap;
 * otherwise read with the cap as its limit, so a body that does not say its length is cut there.
 */
export const demoUploadBody: RequestHandler = (req, res, next) => {
  const length = Number(req.headers['content-length'])
  if (Number.isFinite(length) && length > DEMO_UPLOAD_BODY_MAX_BYTES) {
    res.status(413).json({ message: DEMO_UPLOAD_TOO_LARGE })
    return
  }
  demoUploadJson(req, res, (err?: unknown) => {
    if ((err as { type?: string } | undefined)?.type === 'entity.too.large') {
      res.status(413).json({ message: DEMO_UPLOAD_TOO_LARGE })
      return
    }
    next(err)
  })
}
