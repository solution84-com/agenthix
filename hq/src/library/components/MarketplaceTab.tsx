import { BRANDING } from '@agenthix/core'
const EXAMPLES = [
  { mark: 'A', title: 'Agents', what: 'A ready-made agent, with its instructions and skills', example: 'a store-setup specialist; a data analyst; a support agent that answers from your docs' },
  { mark: 'T', title: 'Team templates', what: 'Several agents that work together, with their boards', example: 'a launch crew — a planner, a writer and a designer, with a launch board' },
  { mark: 'B', title: 'Boards', what: 'The columns a kind of work moves through', example: 'a two-week release with QA sign-off; an editorial calendar' },
  { mark: 'S', title: 'Skills', what: 'Know-how you give an agent, for one kind of job', example: 'an SEO audit that writes its fixes as tasks; answering customers in your tone' },
]

const LINK = 'rounded-lg px-4 py-2 text-body font-medium'

/**
 * The Marketplace tab (every screen reviewed spec §3), on every hq: Coming soon until the marketplace opens with
 * Agenthix Cloud. The links go to the website; hq sends nothing. An hq updated to a release with the marketplace shows it here.
 */
export function MarketplaceTab() {
  return (
    <div data-testid="marketplace-coming-soon">
      <div className="px-2 pb-5 pt-8 text-center">
        <span className="rounded-full bg-accent-subtle px-3 py-1 text-small font-medium text-accent">Coming soon</span>
        <h2 className="mb-1.5 mt-3 text-h2 font-semibold text-text-primary">Agents, teams, boards and skills made by others</h2>
        <p className="mx-auto max-w-xl text-body text-text-secondary">
          The marketplace comes with {BRANDING.displayName} Cloud. You will browse what other organisations and {BRANDING.displayName} publish, install a copy into this library, and publish your own.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <a href="https://agenthix.com/marketplace" target="_blank" rel="noopener noreferrer" className={`${LINK} bg-accent text-on-accent hover:bg-accent-hover`}>Get notified on agenthix.com ↗</a>
          <a href="https://agenthix.com" target="_blank" rel="noopener noreferrer" className={`${LINK} border border-border bg-surface-1 text-text-primary hover:bg-surface-hover`}>About {BRANDING.displayName} Cloud ↗</a>
        </div>
      </div>
      <h3 className="mb-2 text-micro font-medium uppercase tracking-wide text-text-muted">Examples of what it will hold</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {EXAMPLES.map(e => (
          <div key={e.title} className="rounded-2xl border border-border-subtle bg-surface-1 p-4 opacity-90">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-small font-semibold text-accent" aria-hidden>{e.mark}</span>
              <div>
                <div className="text-body font-semibold text-text-primary">{e.title}</div>
                <div className="text-small text-text-muted">{e.what}</div>
              </div>
            </div>
            <p className="mt-2 text-small text-text-secondary"><span className="text-text-muted">For example:</span> {e.example}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-small text-text-muted">When your HQ is updated to a release with the marketplace, this tab becomes the marketplace.</p>
    </div>
  )
}
