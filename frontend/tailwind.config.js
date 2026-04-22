/**
 * WrapVisualizer — Tailwind configuration
 *
 * Mirrors the inline `tailwind.config = {...}` block that used to live
 * in each HTML file alongside the Tailwind Play CDN. The Play CDN is
 * not for production (and blocks a strict CSP); this config feeds the
 * Tailwind CLI build that produces `frontend/assets/css/tailwind.css`.
 *
 * Build:  npm run build:css
 * Watch:  npm run watch:css
 *
 * Keep color names and shape identical to the original inline config so
 * existing class names in the HTML (bg-primary-container, text-on-surface,
 * etc.) continue to resolve.
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
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
  ],
};
