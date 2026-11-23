/** Pain colours and words; a score is always shown with its number as well. */
export function painColor(score: number) {
  if (score <= 0) return 'var(--pain-0)'
  if (score <= 3) return 'var(--pain-low)'
  if (score <= 6) return 'var(--pain-mid)'
  if (score <= 8) return 'var(--pain-high)'
  return 'var(--pain-max)'
}

export const painWord = (score: number) =>
  score <= 0 ? 'No pain' : score <= 3 ? 'Mild' : score <= 6 ? 'Moderate' : score <= 8 ? 'Strong' : 'Severe'
