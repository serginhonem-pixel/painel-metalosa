/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        console: {
          bg: '#0b0f14',
          panel: '#12171d',
          raised: '#171d25',
          border: '#232b34',
          'border-strong': '#323d49',
          ink: '#e7ecf1',
          dim: '#9aa7b4',
          faint: '#66727e',
          accent: '#f2b544',
          'accent-ink': '#1a1206',
          positive: '#33c17a',
          critical: '#e5484d',
          info: '#4fb3e8',
        },
      },
      fontFamily: {
        console: ['"Barlow"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        'console-display': ['"Barlow Condensed"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        'console-mono': ['"Roboto Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
};
