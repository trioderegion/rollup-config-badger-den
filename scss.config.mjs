import pscss from 'rollup-plugin-scss';
import autoprefixer     from 'autoprefixer';
import postcssPresetEnv from 'postcss-preset-env';

export default ({
  fileName = 'style.css',
  inject = false,           // Don't inject CSS into <HEAD>
  extract = true,
  extensions = ['.scss'],   // File extensions to process
  modules = true,
  plugins = [               // Postcss plugins to use
    autoprefixer,
    postcssPresetEnv,
  ],            
  use = ['sass'],// Use sass / dart-sass
  sourceMap = true,
  ...rest
} = {}) => (
  pscss({
    fileName,
    inject,
    extract,
    extensions,
    modules,
    plugins,
    use,
    sourceMap,
    ...rest
  })
)
