/**
 * `@agenthix/core/testing`: for test suites only, never a server or a page. A feature's own tests switch its flag on
 * with `withFeature`, and a suite records and summarises an experimental feature's failures (adr-0172). Node-only.
 * What it switches on is read only in a test run (`NODE_ENV` exactly `test`), so a production build ignores it.
 */
export { withFeature } from './withFeature.js'
export * from './experimentalFailures.js'
