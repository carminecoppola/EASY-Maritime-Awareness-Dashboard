import { useRef, type KeyboardEvent } from 'react'

export interface TabOption<T extends string> {
  id: T
  label: string
}

interface TabFilterProps<T extends string> {
  options: TabOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Nome accessibile del gruppo. */
  label: string
  /** id del pannello controllato, per aria-controls. */
  panelId: string
  className?: string
}

/**
 * Gruppo di tab con roving tabindex e navigazione da tastiera: senza di essa
 * i tab erano tutti in tab order e le frecce non facevano nulla, cioè il
 * contrario di quello che il ruolo "tab" promette a uno screen reader.
 */
export function TabFilter<T extends string>({
  options,
  value,
  onChange,
  label,
  panelId,
  className = 'easy-tabs',
}: TabFilterProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const focusIndex = (index: number) => {
    const next = (index + options.length) % options.length
    onChange(options[next].id)
    refs.current[next]?.focus()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault()
        focusIndex(index + 1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault()
        focusIndex(index - 1)
        break
      case 'Home':
        event.preventDefault()
        focusIndex(0)
        break
      case 'End':
        event.preventDefault()
        focusIndex(options.length - 1)
        break
      default:
        break
    }
  }

  return (
    <div className={className} role="tablist" aria-label={label}>
      {options.map((option, index) => {
        const selected = option.id === value
        return (
          <button
            key={option.id}
            ref={(node) => {
              refs.current[index] = node
            }}
            type="button"
            role="tab"
            id={`${panelId}-tab-${option.id}`}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            className="easy-tab"
            onClick={() => onChange(option.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
