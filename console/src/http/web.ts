/**
 * The screens: the built web app (`console-web/`, copied into the image), served from a directory of files. Every
 * request has passed the guards in guards.ts before it reaches here. The hashed files under `assets/` may be
 * cached; everything else, `index.html` first, keeps the guards' `no-store`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express, { type Router } from 'express'

/**
 * `CONSOLE_WEB_DIR`, or `web/` beside the bundle's folder: `/app/web` in the image, where `/app/dist/console.js`
 * runs. Without a build there (a development checkout), the server answers the API alone.
 */
export function defaultWebRoot(): string {
  return process.env.CONSOLE_WEB_DIR || fileURLToPath(new URL('../web/', import.meta.url))
}

const IMMUTABLE = 'public, max-age=31536000, immutable'

export function webRoutes(root: string): Router {
  const router = express.Router()
  const index = path.join(root, 'index.html')
  if (!fs.existsSync(index)) return router

  const files = { index: false, redirect: false, dotfiles: 'ignore' } as const
  router.use('/assets', express.static(path.join(root, 'assets'), {
    ...files, setHeaders: res => { res.setHeader('Cache-Control', IMMUTABLE) },
  }))
  router.use(express.static(root, files))
  // A route of the app (no file extension, not under /assets) gets the app, which draws it.
  router.use((req, res, next) => {
    const isAppRoute = (req.method === 'GET' || req.method === 'HEAD')
      && !req.path.startsWith('/assets') && path.extname(req.path) === ''
    if (isAppRoute) res.sendFile(index)
    else next()
  })
  return router
}
