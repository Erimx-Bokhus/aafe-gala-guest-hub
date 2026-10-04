// Shared design tokens. Neutral colors are CSS variables so light/dark mode flips them (see theme.css).
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // AAFE orange as used on aafe.org (#C64C28). Fixed in both themes.
        brand: { 50: v('brand-50'), 100: v('brand-100'), 200: '#F0C3AD', 400: '#DB7A55', 500: '#C64C28', 600: '#A93D1D', 700: '#8A3118' },
        ink: { DEFAULT: v('ink'), 2: v('ink2') },  // dark surfaces (staff sidebar); warm charcoal in the guest portal
        surface: v('surface'),
        cream: { 50: v('page'), 100: v('muted'), 200: v('line') },
        navy: { 50: v('n50'), 100: v('n100'), 300: v('n300'), 500: v('n500'), 600: v('n600'), 700: v('n700'), 800: v('n800'), 900: v('n900') },
      },
      fontFamily: {
        sans: ['"Poppins"', 'system-ui', 'sans-serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
        serif: ['"Fraunces"', 'Georgia', 'serif'],
        zh: ['"Noto Sans TC"', '"Poppins"', 'sans-serif'],
      },
    },
  },
}
