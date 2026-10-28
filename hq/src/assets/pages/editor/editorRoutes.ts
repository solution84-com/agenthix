/** Where the editor lives. Other screens link here: the asset's page (Edit), the Library, a place's Skills page. */
export const assetEditPath = (assetId: string) => `/library/${encodeURIComponent(assetId)}/edit`
export const placeSkillEditPath = (placeSkillId: string) => `/library/place-skills/${encodeURIComponent(placeSkillId)}`
export const NEW_SKILL_PATH = '/library/new-skill'
