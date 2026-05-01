/**
 * WrapVisualizer — Tailwind configuration
 *
 * UI Phase A modernization layers a small, semantic design-system on top of
 * the existing Material-3-derived palette. The new vocabulary lives next
 * to the legacy names so HTML can migrate gradually without breaking 46
 * passing Playwright tests.
 *
 * NEW (UI Phase A):
 *   - brand / brand-deep / brand-soft           wrap-shop signature orange
 *   - ink / ink-1 / ink-2 / ink-3 / ink-4       surface stack
 *   - text / text-muted / text-faint            semantic text (text-faint
 *                                               is /55 — clears 4.5:1 vs ink)
 *   - success / success-deep / warning / danger
 *   - mono                                      JetBrains Mono for phone +
 *                                               hex captions (added Slice 8)
 *
 * LEGACY (kept as @deprecated aliases for back-compat — same hex values):
 *   primary-container, on-surface-variant, surface-container-{lowest..highest},
 *   secondary-container, etc. HTML migrates post-launch.
 *
 * Build:  npm run build:css
 * Watch:  npm run watch:css
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './frontend/*.html',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── New semantic vocabulary (UI Phase A) ───────────────────────────
        brand: '#FF6B00',
        'brand-deep': '#7A3000',
        'brand-soft': '#FFDBCC',
        ink: '#131313',
        'ink-1': '#1c1b1b',
        'ink-2': '#201f1f',
        'ink-3': '#2a2a2a',
        'ink-4': '#353534',
        'ink-edge': 'rgba(255,255,255,0.06)',
        'ink-edge-hot': 'rgba(255,107,0,0.30)',
        text: '#e5e2e1',
        'text-muted': '#e2bfb0',
        'text-faint': 'rgba(229,226,225,0.55)', // bumped from /50 → /55 for 4.5:1
        success: '#41e575',
        'success-deep': '#06c85d',
        warning: '#ffb693',
        danger: '#ffb4ab',

        // ── Legacy Material-3 names (kept as aliases for back-compat) ──────
        // @deprecated: prefer the semantic names above.
        'inverse-primary': '#a04100',
        'on-surface-variant': '#e2bfb0',
        'on-secondary-fixed': '#002109',
        outline: '#a98a7d',
        'outline-variant': '#5a4136',
        'surface-tint': '#ffb693',
        'primary-container': '#ff6b00',
        primary: '#ffb693',
        'surface-variant': '#353534',
        'inverse-on-surface': '#313030',
        surface: '#131313',
        'on-tertiary-fixed': '#1a1c1c',
        'on-tertiary-container': '#2f3132',
        'surface-dim': '#131313',
        'inverse-surface': '#e5e2e1',
        'tertiary-fixed': '#e2e2e2',
        'secondary-container': '#06c85d',
        'surface-container-high': '#2a2a2a',
        'tertiary-container': '#989999',
        'on-primary-fixed-variant': '#7a3000',
        'surface-container': '#201f1f',
        'primary-fixed-dim': '#ffb693',
        'on-tertiary-fixed-variant': '#454747',
        'secondary-fixed': '#66ff8e',
        'on-tertiary': '#2f3131',
        'surface-container-low': '#1c1b1b',
        'on-error-container': '#ffdad6',
        'surface-container-lowest': '#0e0e0e',
        'on-secondary': '#003915',
        'on-error': '#690005',
        error: '#ffb4ab',
        background: '#131313',
        'on-primary': '#561f00',
        'error-container': '#93000a',
        tertiary: '#c6c6c7',
        'surface-bright': '#3a3939',
        'surface-container-highest': '#353534',
        'on-primary-container': '#572000',
        'on-secondary-fixed-variant': '#005322',
        'on-secondary-container': '#004d1f',
        secondary: '#41e575',
        'secondary-fixed-dim': '#3de273',
        'on-background': '#e5e2e1',
        'on-surface': '#e5e2e1',
        'primary-fixed': '#ffdbcc',
        'tertiary-fixed-dim': '#c6c6c7',
        'on-primary-fixed': '#351000',
      },
      borderRadius: {
        DEFAULT: '0.125rem',
        lg: '0.25rem',
        xl: '0.5rem',
        full: '0.75rem',
      },
      fontFamily: {
        headline: ['Space Grotesk'],
        body: ['Manrope'],
        label: ['Manrope'],
        // Slice 8 adds JetBrains Mono. Defined here so the class
        // `font-mono` resolves once the @import is added to input.css.
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      transitionTimingFunction: {
        // Material 3 emphasized motion for primary state changes.
        // https://m3.material.io/styles/motion/easing-and-duration/tokens-specs
        emphasis: 'cubic-bezier(0.2, 0, 0, 1)',
        // Tactile spring for button-press / swatch-select feedback.
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      transitionDuration: {
        // Token names — keep aligned with the doc in §3.4.
        instant: '80ms',
        fast: '180ms',
        base: '260ms',
        slow: '420ms',
        pageload: '600ms',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
  ],
};
