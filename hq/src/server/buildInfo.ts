/**
 * Version info. The version is given to the server in its environment when it starts (the host service writes it);
 * nothing in the image carries it. Shows 'dev' when running locally with wasp start.
 */
export const BUILD_INFO = {
  version: process.env.APP_VERSION ?? 'dev',
  built:   process.env.APP_BUILT   ?? new Date().toISOString(),
}
