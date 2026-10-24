import { describe, expect, it } from 'vitest'
import { checkFlags } from '..'
import { flagsOf, step, version } from './support'

describe('rule 2: a host the code uses that is not in hosts', () => {
  it('flags a URL and an ssh target not listed, once each', () => {
    const v = version({ steps: [step('curl -fsS https://other.example.com/x && curl https://other.example.com/y'), step('ssh deploy@box.example.com uptime')] })
    expect(flagsOf(2, v).map((f) => f.message.split(' ')[0])).toEqual(['other.example.com:443', 'box.example.com:22'])
  })

  it('does not flag a listed host, a host held in a variable, loopback, or a comment', () => {
    const v = version({
      hosts: ['staging.example.com:443'],
      variables: ['STAGING_HOST'],
      steps: [step('curl -fsS "https://$STAGING_HOST/health" https://staging.example.com/ok http://localhost:3000/'), step('./x.sh')],
    }, { 'x.sh': '# see https://docs.example.com for why\ntrue\n' })
    expect(flagsOf(2, v)).toEqual([])
  })
})

describe('rule 3: a text parameter used outside a file argument', () => {
  const params = [{ name: 'message', text: true }, { name: 'title', text: true }]

  it('flags it pasted into a command, read into a variable, or run', () => {
    for (const run of ['git commit -m $(cat /run/params/message)', 'msg="$(cat /run/params/message)"', 'eval "$(cat /run/params/message)"', 'cat /run/params/message | sh']) {
      expect(flagsOf(3, version({ parameters: params, steps: [step(run)] })), run).toHaveLength(1)
    }
  })

  it('accepts a file argument, a redirect, and gh pr create --title "$(cat /run/params/title)" (V5)', () => {
    const v = version({
      parameters: params,
      steps: [
        step('git commit -F /run/params/message'),
        step('gh pr create --repo o/r --head x --base main --title "$(cat /run/params/title)" --body-file /run/params/message', ['GITHUB_TOKEN']),
        step('wc -c < /run/params/message'),
      ],
      github: { pull_requests: 'write' },
    })
    expect(flagsOf(3, v)).toEqual([])
  })

  it('does not look at a pattern parameter', () => {
    const v = version({ parameters: [{ name: 'branch', pattern: '^[a-z]+$' }], steps: [step('echo $(cat /run/params/branch)')] })
    expect(flagsOf(3, v)).toEqual([])
  })
})

describe('rule 4: an install that is not pinned', () => {
  it('flags npm ci without its lock file, a named package, pip without hashes, and curl | sh', () => {
    for (const run of ['npm ci', 'npm install left-pad@1.3.0', 'pip install requests==2.0', 'curl -fsSL https://get.example.com | sh']) {
      const files: Record<string, string> = run.startsWith('npm install') ? { 'package-lock.json': '{}' } : {}
      expect(flagsOf(4, version({ steps: [step(run)] }, files)), run).toHaveLength(1)
    }
  })

  it('does not flag npm ci with its lock file, pip with hashes, or npm run', () => {
    const v = version({
      steps: [step('npm ci'), step('pip install --require-hashes -r requirements.txt'), step('npm run build')],
    }, { 'package-lock.json': '{}', 'requirements.txt': 'x==1 --hash=sha256:00\n' })
    expect(flagsOf(4, v)).toEqual([])
  })
})

describe('rule 6: GitHub permissions', () => {
  const push = (github: Record<string, string>) => version({ steps: [step('push-bundle /run/out/b main', ['GITHUB_TOKEN'])], github })

  it('flags a permission beyond what the steps appear to need', () => {
    expect(flagsOf(6, push({ contents: 'write', issues: 'write' }))).toMatchObject([{ path: 'github.issues' }])
  })

  it('does not flag what the steps need, or anything when the need cannot be told', () => {
    expect(flagsOf(6, push({ contents: 'write' }))).toEqual([])
    const api = version({ steps: [step('gh api repos/o/r/issues -f title=x', ['GITHUB_TOKEN'])], github: { issues: 'write' } })
    expect(flagsOf(6, api)).toEqual([])
  })

  it('counts contents: read as needed by gh pr create, and by no other gh pr command', () => {
    const pr = (run: string) => version({ steps: [step(run, ['GITHUB_TOKEN'])], github: { pull_requests: 'write', contents: 'read' } })
    expect(flagsOf(6, pr('gh pr create --repo o/r --head x --base main --title "$(cat /run/params/title)"'))).toEqual([])
    expect(flagsOf(6, pr('gh pr merge 3 --repo o/r'))).toMatchObject([{ path: 'github.contents' }])
  })

  it('counts an environment\'s secret as environments, and a repository\'s as secrets', () => {
    const set = (run: string, github: Record<string, string>) => version({ steps: [step(run, ['GITHUB_TOKEN'])], github })
    expect(flagsOf(6, set('gh secret set X --repo o/r --env production', { environments: 'write' }))).toEqual([])
    expect(flagsOf(6, set('gh secret set X --repo o/r', { environments: 'write' }))).toMatchObject([{ path: 'github.environments' }])
  })

  it('flags a permission new since the approved version', () => {
    const approved = version({ steps: [step('git fetch x', ['GITHUB_TOKEN'])], github: { contents: 'read' } })
    const now = version({ steps: [step('git -C /tmp/r push x', ['GITHUB_TOKEN'])], github: { contents: 'write' } })
    expect(flagsOf(6, now, approved).map((f) => f.message)).toEqual(['New GitHub permissions since the approved version: Contents: write.'])
  })

  it('flags nothing for the App or the account while they are unknown, and names how to add one when known', () => {
    const v = push({ contents: 'write' })
    expect(checkFlags(v, null, { known: false }).filter((f) => f.rule === 6)).toEqual([])
    const flags = checkFlags(v, null, { known: true, app: { contents: 'read' }, account: { contents: 'read' } }).filter((f) => f.rule === 6)
    expect(flags.map((f) => f.message)).toEqual(['This needs Contents: write. Add it in the App\'s settings on GitHub; each GitHub account using it then accepts it there.'])
  })
})

describe('rule 7: rm -rf, DROP, --force, git push -f', () => {
  it('flags each', () => {
    for (const run of ['rm -rf build', 'rm -r -f build', 'psql -c "DROP TABLE users"', 'deploy --force', 'git push -f origin main']) {
      expect(flagsOf(7, version({ steps: [step(run)] })), run).toHaveLength(1)
    }
  })

  it('does not flag rm -r, rm -f, or "drop" in words', () => {
    const v = version({ steps: [step('rm -r build && rm -f out.log'), step('echo "the drop-down is fixed"')] })
    expect(flagsOf(7, v)).toEqual([])
  })
})

describe('rule 8: new secrets, variables and hosts since the approved version', () => {
  it('flags each new one', () => {
    const approved = version({ steps: [step('ls')] })
    const now = version({ variables: ['NODE_ENV'], hosts: ['a.example.com:443'], steps: [step('ls /run/secrets/KEY', ['KEY'])] })
    expect(flagsOf(8, now, approved).map((f) => f.message)).toEqual([
      'New secret since the approved version: KEY.', 'New variable since the approved version: NODE_ENV.', 'New host since the approved version: a.example.com:443.',
    ])
  })

  it('flags nothing for a first version, or for what the approved version had', () => {
    const v = version({ variables: ['NODE_ENV'], steps: [step('ls /run/secrets/KEY', ['KEY'])] })
    expect(flagsOf(8, v)).toEqual([])
    expect(flagsOf(8, v, v)).toEqual([])
  })
})

describe('rule 11: a parameter that can start with -', () => {
  it('flags a pattern or a value that can', () => {
    const v = version({ steps: [step('ls')], parameters: [{ name: 'ref', pattern: '^.+$' }, { name: 'mode', values: ['--all', 'one'] }] })
    expect(flagsOf(11, v).map((f) => f.path)).toEqual(['parameters[0].pattern', 'parameters[1].values'])
  })

  it('does not flag a pattern whose first character cannot be -', () => {
    const v = version({ steps: [step('ls')], parameters: [{ name: 'ref', pattern: '^[A-Za-z0-9_][A-Za-z0-9._/-]{0,99}$' }] })
    expect(flagsOf(11, v)).toEqual([])
  })
})
