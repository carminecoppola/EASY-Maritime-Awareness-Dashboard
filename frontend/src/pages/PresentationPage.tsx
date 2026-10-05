/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Static "Presentation Preview" view.
 *
 * No API calls and no polling: meant for demos and papers when the hardware is not
 * available. The content is fixed and explicitly does not represent a simultaneous
 * live acquisition.
 */

/** Illustrative page built from two repository sample images. */
export function PresentationPage() {
  return (
    <>
      <section className="easy-headline">
        <div>
          <div className="easy-eyebrow">Static demonstration</div>
          <h1>Presentation Preview</h1>
          <p>A deterministic view for demos and publication material.</p>
        </div>
        <div className="easy-updated">
          No polling · <b>no hardware actions</b>
        </div>
      </section>

      <div className="easy-provenance">
        <b>Recorded-source provenance</b>
        This page uses fixed samples and does not represent simultaneous live sensor acquisition.
        <span className="easy-tag" style={{ color: 'var(--accent-info)' }}>
          PRESENTATION MODE
        </span>
      </div>

      <section className="easy-previewgrid">
        <article className="easy-surface easy-prevfeed large">
          <img src="/paper-assets/rgb-left" alt="Recorded RGB sample from the SeaShips dataset" />
          <div className="easy-prevfeed-scrim" aria-hidden />
          <div className="easy-feedhead">
            <b>RGB Left sample</b>
            <span className="easy-tag">SEASHIPS · RECORDED</span>
          </div>
          <div className="easy-feedmeta">
            <b>Maritime scene · port approach</b>
            <small>SeaShips dataset · illustrative inference overlay</small>
          </div>
        </article>

        <article className="easy-surface easy-prevfeed">
          <img src="/paper-assets/rgb-right" alt="Second recorded RGB sample from the SeaShips dataset" />
          <div className="easy-prevfeed-scrim" aria-hidden />
          <div className="easy-feedhead">
            <b>RGB Right sample</b>
            <span className="easy-tag">SEASHIPS · RECORDED</span>
          </div>
          <div className="easy-feedmeta">
            <b>Secondary perspective</b>
            <small>Independent recorded RGB image</small>
          </div>
        </article>

        <article className="easy-surface easy-thermalfeed">
          <div className="easy-prevfeed" style={{ minHeight: 200 }}>
            <img src="/presentation-thermal.svg" alt="Illustrative thermal reference, not a live measurement" />
            <div className="easy-prevfeed-scrim" aria-hidden />
            <div className="easy-feedhead">
              <b>Thermal reference</b>
            </div>
          </div>
          <div className="easy-thermcopy">
            <span className="easy-tag" style={{ color: 'var(--accent-warn)' }}>
              ILLUSTRATIVE
            </span>
            <h3>Thermal context</h3>
            <p>
              Visual reference only. This image is not a live thermal measurement and must keep its provenance label
              in exported figures.
            </p>
          </div>
        </article>
      </section>

      <p className="easy-empty">
        RGB samples from the SeaShips dataset (Shao et al., 2018). The thermal reference is illustrative.
      </p>
    </>
  )
}
