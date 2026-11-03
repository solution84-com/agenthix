import { describe, it, expect } from 'vitest'
import { splitShellCommand, shellWords } from '../shellCommands'

const words = (cmd: string) => splitShellCommand(cmd)?.map(c => c.words.join(' '))

describe('splitShellCommand', () => {
  it('splits on every list and pipeline operator, and on new lines', () => {
    expect(words('cd x && git commit -m hi || echo no; ls | wc -l & sleep 1\nrm -rf y')).toEqual([
      'cd x', 'git commit -m hi', 'echo no', 'ls', 'wc -l', 'sleep 1', 'rm -rf y',
    ])
    expect(words('a |& b')).toEqual(['a', 'b'])
  })

  it('takes the commands inside $(…), back-quotes, ( … ), process substitution and arithmetic out as their own', () => {
    expect(words('echo $(rm -rf a) `rm b` (rm c) <(rm d) $(( $(rm e) + 1 ))')).toEqual(
      expect.arrayContaining(['rm -rf a', 'rm b', 'rm c', 'rm d', 'rm e']),
    )
    expect(words('echo "x $(rm f) y"')).toEqual(expect.arrayContaining(['rm f']))
    expect(words('echo ${X:-$(rm g)}')).toEqual(expect.arrayContaining(['rm g']))
  })

  it('removes quotes and escapes, as the shell does before running a word', () => {
    expect(words(`"rm" -rf 'a b' r\\m`)).toEqual(['rm -rf a b rm'])
    expect(words(`echo 'a && b' "c; d"`)).toEqual(['echo a && b c; d'])
  })

  it('leaves redirections out, and does not split on one that names a file descriptor', () => {
    expect(words('make 2>&1 >| out &> all')).toEqual(['make'])
    expect(words('>out rm x')).toEqual(['rm x'])
  })

  it('reads an unquoted here-document\'s substitutions, and nothing else of its body', () => {
    expect(words("cat <<EOF > f\ndon't $(rm a)\nEOF\nls")).toEqual(['cat', 'rm a', 'ls'])
    expect(words("cat <<'EOF'\n$(rm a)\nEOF")).toEqual(['cat'])
  })

  it('marks a brace expansion in a command name, but not the test command', () => {
    expect(splitShellCommand('{rm,-rf,x}')![0]!.dynamic).toBe(true)
    expect(splitShellCommand('[ -f x ]')![0]!.dynamic).toBe(false)
  })

  it('leaves out reserved words, so the command after them is judged', () => {
    expect(words('if true; then rm x; fi')).toEqual(['true', 'rm x'])
    expect(words('{ rm y; }')).toEqual(['rm y'])
    expect(words('! time rm z')).toEqual(['rm z'])
    expect(words('for f in a b; do rm $f; done')).toEqual(['rm $f'])
  })

  it('ignores a comment, and only one that starts a word', () => {
    expect(words('ls # ; rm x')).toEqual(['ls'])
    expect(words('echo a#b')).toEqual(['echo a#b'])
  })

  it('marks a command whose name is worked out when it runs', () => {
    const [cmd] = splitShellCommand('$X -rf /')!
    expect(cmd!.dynamic).toBe(true)
    expect(splitShellCommand('FOO=$(pwd) ls $HOME')![1]!.dynamic).toBe(false)
    expect(splitShellCommand('r* -rf /')![0]!.dynamic).toBe(true)
  })

  it('separates the leading variable assignments from the command', () => {
    const cmd = splitShellCommand('GIT_SSH_COMMAND="ssh -i k" git push')!.find(c => c.words[0] !== 'pwd')!
    expect(cmd.words).toEqual(['GIT_SSH_COMMAND=ssh -i k', 'git', 'push'])
    expect(cmd.assignments).toBe(1)
  })

  it('answers null for what it cannot read', () => {
    expect(splitShellCommand('echo "open')).toBeNull()
    expect(splitShellCommand('echo )')).toBeNull()
    expect(splitShellCommand('echo $(ls')).toBeNull()
    expect(splitShellCommand('case x in a) rm;; esac')).toBeNull()
  })
})

describe('shellWords', () => {
  it('is a pattern\'s words, its trailing space ignored', () => {
    expect(shellWords('npm run ')).toEqual(['npm', 'run'])
    expect(shellWords('git')).toEqual(['git'])
    expect(shellWords('a && b')).toBeNull()
  })
})
