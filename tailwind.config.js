/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#eef2ff', 100: '#e0e7ff', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 900: '#1e1b4b' }
      },
      animation: {
        'mesh-1': 'floatOrb1 18s ease-in-out infinite alternate',
        'mesh-2': 'floatOrb2 22s ease-in-out infinite alternate',
        'mesh-3': 'floatOrb3 15s ease-in-out infinite alternate',
        'fade-in': 'fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards'
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0', transform: 'translateY(12px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        floatOrb1: { '0%': { transform: 'translate(0px, 0px) scale(1)' }, '50%': { transform: 'translate(100px, 70px) scale(1.15)' }, '100%': { transform: 'translate(-70px, 120px) scale(0.9)' } },
        floatOrb2: { '0%': { transform: 'translate(0px, 0px) scale(1.1)' }, '50%': { transform: 'translate(-120px, -50px) scale(0.95)' }, '100%': { transform: 'translate(80px, 90px) scale(1.2)' } },
        floatOrb3: { '0%': { transform: 'translate(0px, 0px) scale(0.9)' }, '50%': { transform: 'translate(80px, -100px) scale(1.1)' }, '100%': { transform: 'translate(-90px, 40px) scale(1.05)' } }
      }
    }
  },
  plugins: []
};
