import type { ApiHandler } from './http/apiHandler'

export const healthHandler: ApiHandler = (_req, res) => {
  res.status(200).json({ status: 'ok' })
}
