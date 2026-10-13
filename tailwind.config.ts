import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        paper: {
          50: '#fcfbf9',
          100: '#f7f5f0',
          200: '#eeeae1',
          300: '#ded8cb',
          400: '#c5bbae',
          800: '#2b2926',
          900: '#1a1917',
          950: '#0f0e0d',
        },
        editorial: {
          ink: '#111111',
          subtle: '#666660',
          rule: '#dcd8ce',
          darkrule: '#3a3834',
          accent: '#8b4513',
          sage: '#475d4e',
          amber: '#b46327',
        }
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        serif: ['Georgia', 'Cambria', '"Times New Roman"', 'serif'],
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
