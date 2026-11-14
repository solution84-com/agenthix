// @vitest-environment jsdom
/** Providers, Models and the web search page became the AI page: their addresses open its sections and lines. */
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router'
import { MovedToAiPage } from '../pages/MovedToAiPage'
import { AI_ANCHORS, aiPathFor, providerLineUrl, PROVIDERS_URL } from '../aiPage'
import { CAPABILITY_ANCHORS } from '../../capabilities/components/WhatAgentsCanDo'

function Where() {
  const { pathname, hash } = useLocation()
  return <p data-testid="where">{pathname}{hash}</p>
}

const open = (url: string) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/admin/ai" element={<Where />} />
      <Route path="*" element={<MovedToAiPage />} />
    </Routes>
  </MemoryRouter>,
)

afterEach(cleanup)

describe('the old addresses open the AI page @SC-2149', () => {
  it.each([
    ['/admin/providers', '/admin/ai#providers'],
    ['/admin/models', '/admin/ai#which-models-may-run'],
    ['/admin/settings/model-access', '/admin/ai#web-search'],
    ['/admin/providers?provider=p2', '/admin/ai#provider-p2'],
  ])('%s opens %s', (from, to) => {
    open(from)
    expect(screen.getByTestId('where').textContent).toBe(to)
  })

  it('leaves an address that did not move', () => {
    expect(aiPathFor('/admin/people')).toBeNull()
  })
})

describe('links into the AI page @SC-2147', () => {
  it('open Your providers, or one provider\'s line', () => {
    expect(PROVIDERS_URL).toBe('/admin/ai#providers')
    expect(providerLineUrl('p 1')).toBe('/admin/ai#provider-p%201')
  })

  it('name the Web search line by the anchor the list gives it', () => {
    expect(AI_ANCHORS.webSearch).toBe(CAPABILITY_ANCHORS.web_search)
  })
})
