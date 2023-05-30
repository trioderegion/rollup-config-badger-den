import badgerDen from "./rollup-plugin-badger-den.mjs";

import terserPlugin from "./terser.config.mjs";
import postScss from "./scss.config.mjs";

export default ({ config, plugins = { scss: true, compress: true } }) =>
  badgerDen({
    config,
    scssPlug:
      plugins.scss === false
        ? null
        : plugins.scss === true || plugins.scss == undefined
        ? postScss
        : scss,
    compressPlug:
      plugins.compress === false
        ? null
        : plugins.compress === true || plugins.compress == undefined
        ? terserPlugin
        : scss,
  });
