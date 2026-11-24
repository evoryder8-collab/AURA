/** Resolves a file in `public/` against the deployment base path (e.g. /AURA/). */
export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`

const MONOGRAMS = [
  'linear-gradient(150deg, #7af7df, #3f7fd8)',
  'linear-gradient(150deg, #ffb07a, #d9537a)',
  'linear-gradient(150deg, #a48bff, #4b3fb3)',
  'linear-gradient(150deg, #6fa8ff, #2f4fb8)',
  'linear-gradient(150deg, #ffd98a, #e08a3c)',
  'linear-gradient(150deg, #ff8ba7, #8a4fd1)',
]

/** A gradient that belongs to a person's name, so monograms are recognisable at a glance. */
export function monogramGradient(name: string) {
  let hash = 0
  for (const character of name) hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0
  return MONOGRAMS[hash % MONOGRAMS.length] as string
}
