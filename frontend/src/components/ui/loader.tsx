/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Three-dot loading indicator.
 *
 * Third-party origin: adapted from the Aceternity UI loader (LoaderOne,
 * https://ui.aceternity.com/components/loader); see THIRD_PARTY_NOTICES.md.
 */

// Adapted from https://ui.aceternity.com/components/loader (LoaderOne).
// CSS motion keeps this small loading state out of Motion's runtime bundle.

/** Pulsing dots animated with CSS only. */
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
