/** The mocks every Knowledge screen test starts with; imported for its side effects, before the screens. */
import { vi } from 'vitest'
import React from 'react'

const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/projects')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return {
    ...(await importOriginal<object>()), File: icon, FileImage: icon, Folder: icon, Search: icon, ChevronDown: icon,
    ChevronLeft: icon, ChevronRight: icon, MoreHorizontal: icon, Plus: icon,
  }
})

const navigate = vi.hoisted(() => vi.fn())
vi.mock('react-router', async () => {
  const react = await import('react')
  const { address } = await import('./kit')
  return {
    useSearchParams: () => {
      const [, tick] = react.useReducer((n: number) => n + 1, 0)
      react.useEffect(() => { address.listeners.add(tick); return () => { address.listeners.delete(tick) } }, [])
      const set = (change: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams)) => {
        address.params = typeof change === 'function' ? change(address.params) : change
        address.listeners.forEach(l => l())
      }
      return [address.params, set]
    },
    useNavigate: () => navigate,
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => react.createElement('a', { href: to, ...rest }, children),
  }
})
vi.mock('../knowledgeData', async () => (await import('./kit')).data)
vi.mock('../history/useKnowledgeHistory', async () => (await import('./kit')).history)
