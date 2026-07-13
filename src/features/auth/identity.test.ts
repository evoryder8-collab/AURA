import { getIdentityAge } from './identity'

describe('getIdentityAge', () => {
  it('uses a supplied age and derives a date-of-birth age at the birthday boundary', () => {
    expect(getIdentityAge({ id: 'age', name: 'Age Candidate', age: 41 })).toBe(41)
    expect(
      getIdentityAge(
        { id: 'dob', name: 'Birthday Candidate', dateOfBirth: '1992-09-08' },
        new Date(2026, 8, 7),
      ),
    ).toBe(33)
    expect(
      getIdentityAge(
        { id: 'dob', name: 'Birthday Candidate', dateOfBirth: '1992-09-08' },
        new Date(2026, 8, 8),
      ),
    ).toBe(34)
  })
})
