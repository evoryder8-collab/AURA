import type { DemoTherapist } from '@/data/demo/model'

type TherapistPortraitProps = {
  therapist: Pick<DemoTherapist, 'displayName' | 'portraitScale' | 'portraitUrl' | 'preferredName'>
  className?: string
}

export function TherapistPortrait({ therapist, className = '' }: TherapistPortraitProps) {
  const initials = therapist.displayName
    .split(' —')[0]
    ?.split(' ')
    .map((part) => part[0])
    .join('')

  return (
    <span className={`therapist-portrait ${className}`.trim()} aria-hidden="true">
      <span>{initials || therapist.preferredName[0]}</span>
      {therapist.portraitUrl ? (
        <img
          src={therapist.portraitUrl}
          alt=""
          style={{ transform: `scale(${therapist.portraitScale ?? 1})` }}
          onError={(event) => {
            event.currentTarget.style.display = 'none'
          }}
        />
      ) : null}
    </span>
  )
}
