import { readFile, readdir } from 'node:fs/promises'
import { demoDataDir, loadDemoScripts, type DemoScripts } from '@agenthix/core'

let loaded: Promise<DemoScripts> | null = null

/** The demo's scripts, read once from the image's data folder; a failed read is tried again at the next run. */
export function demoScriptsOnSite(): Promise<DemoScripts> {
  loaded ??= loadDemoScripts(demoDataDir(process.env), {
    list: dir => readdir(dir),
    read: file => readFile(file, 'utf8'),
  }).catch(err => {
    loaded = null
    throw err
  })
  return loaded
}

export function resetDemoScriptsForTests(): void {
  loaded = null
}
