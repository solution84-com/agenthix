import type { Request, Response } from 'express'

/** A route's handler, as `main.ts` mounts it: Express 5 awaits a returned promise and routes its rejection to the error handler. */
export type ApiHandler = (req: Request, res: Response) => unknown
