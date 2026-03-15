/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './lib/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Your primary background token
        background: '#020205',
        // Your high-fidelity surface tokens
        surface: 'rgba(255, 255, 255, 0.03)',
        card: 'rgba(255, 255, 255, 0.05)',
        cardBorder: 'rgba(255, 255, 255, 0.1)',
        // Unified Neon System
        neon: {
          cyan: '#00F0FF',
          pink: '#FF007F',
          purple: '#8A2BE2',
          orange: '#FF4500',
          lime: '#32FF00',
        },
        // Legacy support for flat neon strings
        'neon-cyan': '#00F0FF',
        'neon-purple': '#8A2BE2',
        'neon-pink': '#FF007F',
        'neon-lime': '#32FF00',
        // Your text hierarchy
        text: {
          primary: '#FFFFFF',
          secondary: '#A1A1AA',
          muted: '#71717A',
        },
      },
      // Your high-intensity blur tokens
      blur: {
        '3xl': '64px',
        '4xl': '100px',
      },
      fontFamily: {
        mono: ['Space Mono', 'monospace'],
      },
      // Neural Animation Nodes
      animation: {
        'pulse-slow': 'pulse 6s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'neural-flow': 'neural-flow 10s linear infinite',
      },
      keyframes: {
        'neural-flow': {
          '0%': { transform: 'translateX(-100%) translateY(-100%)' },
          '100%': { transform: 'translateX(100%) translateY(100%)' },
        },
      },
      letterSpacing: {
        'ultra-wide': '0.5em',
      },
    },
  },
  plugins: [],
};
