// @vitest-environment jsdom
/** Mention reaches the message box of the conversation open beside the tool (spec §3, *The Files tools*). */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

// ui resolves its own copy of lucide-react (see tasksToolViews.test.tsx); the sessions module draws icons we do not look at.
const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/sessions')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, () => {
  const icon = () => null
  return {
    AlertTriangle: icon, Archive: icon, ArrowLeft: icon, ArrowRight: icon, ArrowUp: icon, Ban: icon,
    BookOpen: icon, Bot: icon, Box: icon, Camera: icon, Check: icon, CheckCircle: icon,
    CheckCircle2: icon, ChevronDown: icon, ChevronLeft: icon, ChevronRight: icon, ClipboardList: icon, Clock: icon,
    Copy: icon, Download: icon, ExternalLink: icon, File: icon, FileImage: icon, Flame: icon,
    Folder: icon, FolderKanban: icon, Library: icon, FolderOpen: icon, Inbox: icon, Kanban: icon, LayoutList: icon,
    Leaf: icon, ListTodo: icon, Loader2: icon, Lock: icon, Maximize2: icon, MessageSquare: icon,
    MessageSquarePlus: icon, Mic: icon, MicOff: icon, Minimize2: icon, MoreHorizontal: icon, Pause: icon,
    Pencil: icon, Play: icon, Plus: icon, Radio: icon, RefreshCw: icon, Repeat: icon,
    Search: icon, Send: icon, Settings2: icon, ShieldAlert: icon, ShieldCheck: icon, SlidersHorizontal: icon,
    Sparkles: icon, Square: icon, Terminal: icon, Trash2: icon, TrendingUp: icon, User: icon,
    UserPlus: icon, X: icon, XCircle: icon,
  }
})
import { mentionInMessage, useMentionTarget } from '@agenthix/ui/sessions'

function Box({ insert }: { insert: (text: string) => void }) {
  useMentionTarget(insert)
  return null
}

describe('mentioning a file', () => {
  it('reaches a message box that is drawn, and says it was taken', () => {
    const insert = vi.fn()
    render(<Box insert={insert} />)
    expect(mentionInMessage('files/ROADMAP.md')).toBe(true)
    expect(insert).toHaveBeenCalledWith('files/ROADMAP.md')
  })

  it('says nobody took it when no message box is drawn', () => {
    cleanup()
    expect(mentionInMessage('files/ROADMAP.md')).toBe(false)
  })
})
