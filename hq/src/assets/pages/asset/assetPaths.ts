import { libraryAssetPath } from '../../../library/components/libraryRoutes'

/** The editor opened on an asset's draft (the editor's own screen); the asset's page links here. */
export const libraryEditPath = (assetId: string) => `${libraryAssetPath(assetId)}/edit`

/** A skill's page at one of its versions; null for the version in use. */
export const skillVersionPath = (assetId: string, versionId: string | null) =>
  versionId ? `${libraryAssetPath(assetId)}?version=${encodeURIComponent(versionId)}` : libraryAssetPath(assetId)
