export type IdentityCandidate = {
  id: string
  name: string
  age?: number
  dateOfBirth?: string | Date
  portraitUrl?: string
  portraitScale?: number
  subtitle?: string
}

function ageOnDate(dateOfBirth: string | Date, referenceDate: Date) {
  let year: number
  let month: number
  let day: number

  if (dateOfBirth instanceof Date) {
    if (Number.isNaN(dateOfBirth.getTime())) return null
    year = dateOfBirth.getFullYear()
    month = dateOfBirth.getMonth() + 1
    day = dateOfBirth.getDate()
  } else {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOfBirth)
    if (!match) return null
    year = Number(match[1])
    month = Number(match[2])
    day = Number(match[3])
  }

  let age = referenceDate.getFullYear() - year
  const birthdayHasPassed =
    referenceDate.getMonth() + 1 > month ||
    (referenceDate.getMonth() + 1 === month && referenceDate.getDate() >= day)

  if (!birthdayHasPassed) age -= 1
  return age >= 0 ? age : null
}

export function getIdentityAge(candidate: IdentityCandidate, referenceDate = new Date()) {
  if (typeof candidate.age === 'number') return candidate.age
  if (candidate.dateOfBirth) return ageOnDate(candidate.dateOfBirth, referenceDate)
  return null
}
