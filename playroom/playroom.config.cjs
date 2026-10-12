// Dev-only component playground. Shares design tokens, Tailwind theme and fixtures with the web app.
const path = require('node:path')

module.exports = {
  components: './src/components.ts',
  snippets: './src/snippets.ts',
  frameComponent: './src/frame.tsx',
  themes: './src/themes.ts',
  outputPath: './dist',
  title: 'Domino Wire UI',
  widths: [375, 768, 1440],
  port: 9000,
  openBrowser: false,
  typeScriptFiles: ['../packages/ui/src/**/*.{ts,tsx}', '!**/node_modules'],
  webpackConfig: () => ({
    resolve: { extensions: ['.ts', '.tsx', '.js', '.mjs'] },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          include: [path.resolve(__dirname, 'src'), path.resolve(__dirname, '../packages')],
          use: {
            loader: require.resolve('babel-loader'),
            options: {
              presets: [
                require.resolve('@babel/preset-typescript'),
                [require.resolve('@babel/preset-react'), { runtime: 'automatic' }],
              ],
            },
          },
        },
        {
          test: /\.css$/,
          include: path.resolve(__dirname, 'src'),
          use: [
            require.resolve('style-loader'),
            require.resolve('css-loader'),
            {
              loader: require.resolve('postcss-loader'),
              options: { postcssOptions: { plugins: [require('@tailwindcss/postcss')()] } },
            },
          ],
        },
        { test: /\.(woff2?)$/, include: /@fontsource/, type: 'asset/resource' },
      ],
    },
  }),
}
