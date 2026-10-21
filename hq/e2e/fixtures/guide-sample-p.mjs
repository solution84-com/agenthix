// What the people and projects pages need that the sample organisation lacks: two workspaces in Website
// relaunch, one with a GitHub repository and one without, so the Workspaces tool has cards to show.
// Rows only: they are the site's own rows and hq's record of where they live. No files are written.
// Wired into seed-guide-data.mjs as seedP.

export async function seedP({ hq, site, ago, projects }) {
  const config = await site.siteConfig.findFirst()
  const defaultSite = await hq.executionSite.findFirst({ where: { isDefault: true } })
  if (!config || !defaultSite) throw new Error('[seed-guide-data] the site has no SiteConfig or hq has no default site: start both once first.')

  const DAY = 24 * 60
  const workspaces = [
    { name: 'website-code', repoUrl: 'https://github.com/fernhill-co/website', minutesAgo: 30 * DAY },
    { name: 'case-study-drafts', repoUrl: null, minutesAgo: 9 * DAY },
  ]
  for (const { name, repoUrl, minutesAgo } of workspaces) {
    const workspace = await site.workspace.create({
      data: { name, ownerType: 'project', ownerId: projects.WEB.id, siteId: config.siteId, createdAt: ago(minutesAgo) },
    })
    if (repoUrl) {
      await site.repoAttachment.create({
        data: { ownerType: 'project', ownerId: projects.WEB.id, workspaceId: workspace.id, repoUrl, createdAt: ago(minutesAgo) },
      })
    }
    await hq.workspacePlacement.create({ data: { workspaceId: workspace.id, siteId: defaultSite.id } })
  }
}
