import badgerDen from './rollup-plugin-badger-den.mjs'

import terserPlugin from './terser.config.mjs';
import postScss from './scss.config.mjs'

export default (config) => badgerDen({
  configPath: 'package.json',
  deployPath: './build',
  sourceMaps: true,
  cleanOutDir: false,
  compressOutput: false,
  scssPlug: postScss,
  compressPlug: terserPlugin,
  ...config
})
