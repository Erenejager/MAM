/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ['class'],
    content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
  	spacing: {
  		'0': '0px',
  		px: '1px',
  		xs: '4px',
  		sm: '8px',
  		md: '16px',
  		lg: '24px',
  		xl: '32px',
  		'2xl': '48px',
  		'3xl': '64px'
  	},
  	extend: {
  		colors: {
  			background: '#0c0c12',
  			'background-deep': '#09090e',
  			panel: '#141419',
  			'panel-light': '#1a1a22',
  			cta: '#E11D48',
  			'cta-hover': '#BE123C',
  			text: '#e4e4e7',
  			'text-muted': '#a1a1aa',
  			'text-dim': '#52525b',
  			border: 'rgba(255, 255, 255, 0.06)',
  			'border-hover': 'rgba(255, 255, 255, 0.12)',
  			'status-pending': '#94A3B8',
  			'status-processing': '#F59E0B',
  			'status-complete': '#10B981',
  			'status-failed': '#E11D48',
  			glass: 'rgba(255,255,255,0.03)',
  			'glass-border': 'rgba(255,255,255,0.07)',
  			'glass-hover': 'rgba(255,255,255,0.06)',
  			'glass-strong': 'rgba(255,255,255,0.05)',
  			foreground: 'var(--foreground)',
  			card: {
  				DEFAULT: 'var(--card)',
  				foreground: 'var(--card-foreground)'
  			},
  			popover: {
  				DEFAULT: 'var(--popover)',
  				foreground: 'var(--popover-foreground)'
  			},
  			primary: {
  				DEFAULT: 'var(--primary)',
  				foreground: 'var(--primary-foreground)'
  			},
  			secondary: {
  				DEFAULT: 'var(--secondary)',
  				foreground: 'var(--secondary-foreground)'
  			},
  			muted: {
  				DEFAULT: 'var(--muted)',
  				foreground: 'var(--muted-foreground)'
  			},
  			accent: {
  				DEFAULT: 'var(--accent)',
  				foreground: 'var(--accent-foreground)'
  			},
  			destructive: {
  				DEFAULT: 'var(--destructive)'
  			},
  			input: 'var(--input)',
  			ring: 'var(--ring)',
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		fontFamily: {
  			sans: [
  				'Fira Sans',
  				'sans-serif'
  			],
  			mono: [
  				'Fira Code',
  				'monospace'
  			]
  		},
  		boxShadow: {
  			sm: '0 1px 3px rgba(0,0,0,0.4)',
  			md: '0 4px 12px rgba(0,0,0,0.5)',
  			lg: '0 8px 24px rgba(0,0,0,0.6)',
  			accent: '0 0 12px rgba(225,29,72,0.3)',
  			'accent-lg': '0 0 24px rgba(225,29,72,0.2)',
  			'card-hover': '0 8px 32px rgba(0,0,0,0.4)'
  		},
  		borderRadius: {
  			DEFAULT: '8px',
  			lg: '12px',
  			xl: '16px',
  			sm: 'calc(var(--radius) - 4px)',
  			md: 'calc(var(--radius) - 2px)'
  		}
  	}
  },
  plugins: [
    function({ addUtilities }) {
      addUtilities({
        '.glass-blur-sm': { 'backdrop-filter': 'blur(8px)', '-webkit-backdrop-filter': 'blur(8px)' },
        '.glass-blur': { 'backdrop-filter': 'blur(12px)', '-webkit-backdrop-filter': 'blur(12px)' },
        '.glass-blur-lg': { 'backdrop-filter': 'blur(20px)', '-webkit-backdrop-filter': 'blur(20px)' },
        '.glass-blur-xl': { 'backdrop-filter': 'blur(24px)', '-webkit-backdrop-filter': 'blur(24px)' },
        '.glow-cta-sm': { 'box-shadow': '0 0 8px rgba(225,29,72,0.2)' },
        '.glow-cta': { 'box-shadow': '0 0 12px rgba(225,29,72,0.25)' },
        '.glow-cta-lg': { 'box-shadow': '0 0 24px rgba(225,29,72,0.3)' },
      });
    },
  ],
};
