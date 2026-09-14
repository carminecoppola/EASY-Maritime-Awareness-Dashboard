// Adapted from https://ui.aceternity.com/components/loader (LoaderOne).
// CSS motion keeps this small loading state out of Motion's runtime bundle.

export function LoaderOne() {
  return (
    <div className="flex items-center gap-2" role="status" aria-label="Loading">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          aria-hidden="true"
          className="easy-loader-dot size-2 rounded-full"
          style={{ background: 'var(--accent-interactive)', animationDelay: `${index * 0.2}s` }}
        />
      ))}
    </div>
  )
}
