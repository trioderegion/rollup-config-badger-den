import badgerDen from './rollup-plugin-badger-den.mjs'

import terserPlugin from './terser.config.mjs';
import postScss from './scss.config.mjs'

export default ({config, profile, plugs}) => badgerDen({
  config,
  profile,
  scssPlug: plugs?.scss ?? postScss,
  compressPlug: plugs?.compress ?? terserPlugin,
})
