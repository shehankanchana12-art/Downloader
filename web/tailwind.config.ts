import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#070709',
          900: '#0b0b0f',
          850: '#101016',
          800: '#15151d',
          700: '#1d1d27'
        },
        accent: {
          300: '#aeb9ff',
          400: '#8f9dff',
          500: '#6d7cff',
          600: '#5563f0'
        }
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif'
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace']
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(255,255,255,0.06), 0 24px 60px -24px rgba(109,124,255,0.45)',
        card: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 24px 48px -32px rgba(0,0,0,0.9)'
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' }
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' }
        }
      },
      animation: {
        'fade-up': 'fade-up 0.35s cubic-bezier(0.16, 1, 0.3, 1) both',
        shimmer: 'shimmer 1.6s infinite',
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite'
      }
    }
  },
  plugins: []
}

export default config
