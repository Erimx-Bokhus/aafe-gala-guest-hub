// Shared design tokens. Neutral colors are CSS variables so light/dark mode flips them (see theme.css).
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`
module.exports = {
  // Hover styles only on devices with a mouse, so a tapped button on the iPad doesn't stay in its hover look.
  future: { hoverOnlyWhenSupported: true },
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // AAFE orange as used on aafe.org (#C64C28). Fixed in both themes.
        brand: { 50: v('brand-50'), 100: v('brand-100'), 200: '#F0C3AD', 400: '#DB7A55', 500: '#C64C28', 600: '#BA4926', 700: '#8A3118' },
        ink: { DEFAULT: v('ink'), 2: v('ink2') },  // dark surfaces (staff sidebar); warm charcoal in the guest portal
        surface: v('surface'),
        // Class names kept for history: `cream-*` and `navy-*` now resolve to AAFE's cool grays (theme.css). No cream, no navy.
        cream: { 50: v('page'), 100: v('muted'), 200: v('line') },
        navy: { 50: v('n50'), 100: v('n100'), 300: v('n300'), 500: v('n500'), 600: v('n600'), 700: v('n700'), 800: v('n800'), 900: v('n900') },
      },
      fontFamily: {
        sans: ['"Poppins"', 'system-ui', 'sans-serif'],
        body: ['"Poppins"', 'system-ui', 'sans-serif'],
        serif: ['"Fraunces"', 'Georgia', 'serif'], // guest portal only; the staff app no longer uses it
        zh: ['"Noto Sans TC"', '"Poppins"', 'sans-serif'],
        ko: ['"Noto Sans KR"', '"Poppins"', 'sans-serif'],
      },
      // Square containers, matching aafe.org (docs/design.md v2.6): cards, panels, dialogs, inputs and notes have
      // no rounded corners in every app. Buttons keep the pill (rounded-[50px]); status pills, avatars, progress
      // bars and the round seating tables keep rounded-full.
      borderRadius: { sm: '0px', DEFAULT: '0px', md: '0px', lg: '0px', xl: '0px', '2xl': '0px', '3xl': '0px' },
    },
  },
}
