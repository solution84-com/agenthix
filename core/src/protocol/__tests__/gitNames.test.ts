import { describe, expect, it } from 'vitest'
import {
  branchNameFromWork, isCommitId, isCommitMessage, isCopyId, isGitBranchName, isGitEmail, isGitPersonName, isRepoPath,
  isWorkBranchName, WORK_BRANCH_NAME_MAX,
} from '../gitNames.js'

describe('the names hq gives a branch', () => {
  it('takes lowercase words joined by hyphens, at most 50 characters', () => {
    for (const name of ['add-login-page', 'fix', 'v2-api', 'add-login-page-2']) expect(isWorkBranchName(name), name).toBe(true)
    for (const name of ['Add-login', 'add--login', '-add', 'add-', 'feature/login', 'add_login', '', 'a'.repeat(51)]) {
      expect(isWorkBranchName(name), name).toBe(false)
    }
  })

  it('is made from the work, without filler words', () => {
    expect(branchNameFromWork('Add a login page', () => false)).toBe('add-login-page')
    expect(branchNameFromWork('Réparer l’accès', () => false)).toBe('reparer-l-acces')
    expect(branchNameFromWork('!!!', () => false)).toBe('work')
  })

  it('is cut at a word to 50 characters, and takes -2, -3 when the name is taken', () => {
    const long = branchNameFromWork('one two three four five six seven eight nine ten eleven twelve', () => false)
    expect(long.length).toBeLessThanOrEqual(WORK_BRANCH_NAME_MAX)
    expect(long.endsWith('-')).toBe(false)
    expect(isWorkBranchName(long)).toBe(true)

    const taken = new Set(['add-login-page', 'add-login-page-2'])
    expect(branchNameFromWork('Add login page', n => taken.has(n))).toBe('add-login-page-3')

    const full = 'x'.repeat(50)
    const next = branchNameFromWork(full, n => n === full)
    expect(next).toBe(`${'x'.repeat(48)}-2`)
    expect(isWorkBranchName(next)).toBe(true)
  })
})

describe('any branch a method may name', () => {
  it('takes what Git takes, an agent\'s backups and GitHub\'s branches included', () => {
    for (const name of ['main', 'backup/login-page-2026-11-01', 'feature/Login_Form', 'release/1.0.1', 'a.b']) {
      expect(isGitBranchName(name), name).toBe(true)
    }
  })

  it('refuses what check-ref-format refuses, and a leading -, HEAD and anything not printable ASCII', () => {
    for (const name of [
      '', '-x', '--upload-pack=x', 'HEAD', '@', 'a..b', 'a@{1}', 'a//b', '/a', 'a/', 'a.', '.a', 'a/.b', 'a.lock',
      'a/b.lock/c', 'a b', 'a~1', 'a^', 'a:b', 'a?', 'a*', 'a[b', 'a\\b', 'a\x7f', 'a\nb', 'é', 'x'.repeat(201),
    ]) expect(isGitBranchName(name), JSON.stringify(name)).toBe(false)
  })

  it('refuses what is not a string', () => {
    expect(isGitBranchName(undefined)).toBe(false)
    expect(isGitBranchName(['main'])).toBe(false)
  })
})

describe('commits, copies and paths', () => {
  it('takes only a full lowercase commit id', () => {
    expect(isCommitId('a'.repeat(40))).toBe(true)
    expect(isCommitId('b'.repeat(64))).toBe(true)
    for (const id of ['a'.repeat(7), 'A'.repeat(40), 'HEAD', 'main', `${'a'.repeat(40)}~1`, 'g'.repeat(40)]) {
      expect(isCommitId(id), id).toBe(false)
    }
  })

  it('takes only a lowercase uuid as a copy id, so it is always a plain folder name', () => {
    expect(isCopyId('3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d')).toBe(true)
    for (const id of ['../x', '3F2B1C4D-5E6F-4A7B-8C9D-0E1F2A3B4C5D', 'x', '']) expect(isCopyId(id), id).toBe(false)
  })

  it('takes a path from the repository\'s root and nothing that leaves it or reaches .git', () => {
    for (const p of ['src/app.ts', 'README.md', '.github/workflows/ci.yml', 'a/b c/d.txt', '.gitignore']) {
      expect(isRepoPath(p), p).toBe(true)
    }
    for (const p of [
      '', '/etc/passwd', '../x', 'a/../b', 'a/./b', './a', 'a//b', 'a/', '.git/config', 'a/.GIT/hooks', '-x',
      'a/--output=x', 'a\\b', 'a\0b', 'a\nb', 'x'.repeat(256),
    ]) expect(isRepoPath(p), JSON.stringify(p)).toBe(false)
  })
})

describe('who and what a commit says', () => {
  it('takes a name and address Git can write between its brackets', () => {
    expect(isGitPersonName('Mia Chen')).toBe(true)
    expect(isGitEmail('mia@example.org')).toBe(true)
    for (const n of ['', '  ', 'Mia <x@y>', 'Mia\nEvil']) expect(isGitPersonName(n), n).toBe(false)
    for (const e of ['mia', 'mia@', 'a b@c', '<mia@x>', 'mia@x\n', 'a@b@c']) expect(isGitEmail(e), e).toBe(false)
  })

  it('takes a message with lines and tabs, and nothing blank or with other control characters', () => {
    expect(isCommitMessage('Add login\n\n\tWith a form')).toBe(true)
    for (const m of ['', '   \n', 'a\0b', 'a\x1bb', 'x'.repeat(10_001)]) expect(isCommitMessage(m), JSON.stringify(m)).toBe(false)
  })
})
