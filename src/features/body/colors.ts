/** Pain colours for the figure; the score is always printed beside them. */
export function painHex(score: number) {
  if (score <= 0) return '#8fdcc6'
  if (score <= 3) return '#e8d58c'
  if (score <= 6) return '#f3a35f'
  if (score <= 8) return '#f0705d'
  return '#e2476d'
}
