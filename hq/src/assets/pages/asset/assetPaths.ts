import { libraryAssetPath } from '../../../library/components/libraryRoutes'

/** The editor opened on an asset's draft (the editor's own screen); the asset's page links here. */
export const libraryEditPath = (assetId: string) => `${libraryAssetPath(assetId)}/edit`
