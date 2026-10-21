/**
 * Build version info — baked into the server image at build time via Docker build-args.
 * Shows 'dev' defaults when running locally with wasp start.
 */
export const BUILD_INFO = {
  version: process.env.APP_VERSION ?? 'dev',
  commit:  process.env.APP_COMMIT  ?? 'dev',
  built:   process.env.APP_BUILT   ?? new Date().toISOString(),
}
