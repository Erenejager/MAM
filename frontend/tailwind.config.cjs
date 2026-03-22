/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0F0F23',
        panel: '#1E1B4B',
        cta: '#E11D48',
        'cta-hover': '#BE123C',
        text: '#F8FAFC',
        'text-muted': '#94A3B8',
        border: '#2D2A5E',
        'border-hover': '#4C4891',
        'status-pending': '#94A3B8',
        'status-processing': '#F59E0B',
        'status-complete': '#10B981',
        'status-failed': '#E11D48',
      },
      fontFamily: {
        sans: ['Fira Sans', 'sans-serif'],
        mono: ['Fira Code', 'monospace'],
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
        '2xl': '48px',
        '3xl': '64px',
      },
      boxShadow: {
        sm: '0 1px 3px rgba(0,0,0,0.4)',
        md: '0 4px 12px rgba(0,0,0,0.5)',
        lg: '0 8px 24px rgba(0,0,0,0.6)',
        accent: '0 0 12px rgba(225,29,72,0.3)',
      },
      borderRadius: {
        DEFAULT: '8px',
        lg: '12px',
        xl: '16px',
      },
    },
  },
  plugins: [],
};
