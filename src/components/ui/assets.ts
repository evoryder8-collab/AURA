/** Resolves a file in `public/` against the deployment base path (e.g. /AURA/). */
export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`
