/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0D0D11',
        card: '#16161C',
        card2: '#1D1D25',
        line: '#23232C',
        line2: '#2A2A35',
        ink: '#F2F2F7',
        muted: '#9A9AAD',
        dim: '#6B6B7D',
        pend: '#3A3A48',
        violet: { DEFAULT: '#8B5CF6', text: '#A78BFA', soft: 'rgba(139,92,246,0.14)' },
        blue: { DEFAULT: '#4F8CFF', text: '#8DB4FF', soft: 'rgba(79,140,255,0.14)' },
        night: { bg: '#1A1530', line: '#3A2F66', text: '#CFC5F5' },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        card: '18px',
      },
      keyframes: {
        pop: { '0%': { transform: 'scale(0.85)' }, '60%': { transform: 'scale(1.08)' }, '100%': { transform: 'scale(1)' } },
        fadeUp: { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'none' } },
      },
      animation: {
        pop: 'pop 220ms ease-out',
        fadeUp: 'fadeUp 240ms ease-out both',
      },
    },
  },
  plugins: [],
};
