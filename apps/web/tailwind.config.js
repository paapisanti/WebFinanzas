export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#10141F', panel: '#171D2C', raise: '#1E2638', line: '#2A3450',
        mute: '#8A93AA', soft: '#C3C9D9', brass: '#E0B25A', pos: '#6FCF9F', neg: '#EF8A7C',
      },
      fontFamily: { sans: ['Manrope', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
}
