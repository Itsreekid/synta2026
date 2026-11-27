/**
 * Student interface stylesheet (public/css/student-ui.css), built by `npm run build:css`.
 *
 * Tailwind 3.4 on purpose: Tailwind 4 needs Safari 16.4+ / Chrome 111+ (native cascade layers,
 * @property, color-mix), which would drop the whole stylesheet on iOS 15 student phones.
 * Preline 2.7 is the last Preline line built for Tailwind 3.
 *
 * Isolation while legacy CSS still exists:
 * - every utility is prefixed `tw-` so it never collides with legacy class names (.btn, .card…);
 * - Preflight is off: legacy pages rely on their own resets, Video.js, CodeMirror and markdown;
 * - shared primitives are plain `sa-*` component classes (see styles/student-ui.css).
 */
module.exports = {
  prefix: 'tw-',
  corePlugins: { preflight: false },
  content: [
    // Student pages, partials and every script that renders student markup at runtime.
    './views/**/*.ejs',
    './public/js/**/*.js',
  ],
  // Classes composed at runtime from data (status tones) that a scanner cannot see.
  safelist: [
    { pattern: /^sa-(badge|alert)--(navy|orange|teal|success|warning|danger|neutral)$/ },
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#eef5f9', 100: '#d6e7f0', 200: '#aecfe0', 300: '#7eb0c9', 400: '#4a88a8',
          500: '#24688b', 600: '#0d4f70', 700: '#013f5c', 800: '#013047', 900: '#012437', 950: '#00182a',
        },
        brand: {
          50: '#fff6ed', 100: '#feead5', 200: '#fdd1aa', 300: '#fbb174', 400: '#f8953f',
          500: '#f6851f', 600: '#e06a0c', 700: '#b9520c', 800: '#934112', 900: '#773712',
        },
        teal: {
          50: '#ecf8fb', 100: '#d0eef5', 200: '#a6dceb', 300: '#6fc4dc', 400: '#3fabc9',
          500: '#219ebc', 600: '#1a7f99', 700: '#19667c', 800: '#1b5466', 900: '#1b4656',
        },
      },
      fontFamily: {
        sans: ['Tajawal', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: { card: '16px', control: '10px' },
      boxShadow: {
        card: '0 1px 2px rgba(1, 48, 71, 0.04), 0 2px 8px rgba(1, 48, 71, 0.05)',
        raised: '0 2px 4px rgba(1, 48, 71, 0.05), 0 10px 24px rgba(1, 48, 71, 0.08)',
        pop: '0 12px 32px rgba(1, 48, 71, 0.14)',
      },
      transitionTimingFunction: { out: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    },
  },
  plugins: [require('preline/plugin')],
};
