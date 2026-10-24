/** The spec's worked example (part 1, *What a workflow is*), as a YAML reader leaves it. */
export const DEPLOY_STAGING = {
  name: 'deploy-staging',
  description: 'Build, upload and restart the app on staging',
  hosts: ['registry.npmjs.org:443', 'staging.example.com:22'],
  variables: ['STAGING_HOST', 'NODE_ENV'],
  timeout: '10m',
  parameters: [{ name: 'ref', pattern: '^[A-Za-z0-9_][A-Za-z0-9._/-]{0,99}$' }],
  steps: [
    { name: 'Build', run: 'npm ci && npm run build' },
    { name: 'Upload', secrets: ['STAGING_DEPLOY_KEY'], run: './deploy/upload.sh' },
    { name: 'Restart the app', secrets: ['STAGING_DEPLOY_KEY'], run: './deploy/restart.sh' },
    { name: 'Check it answers', run: 'curl -fsS "https://$STAGING_HOST/health"' },
  ],
}
