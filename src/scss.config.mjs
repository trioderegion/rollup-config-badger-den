import pscss from "rollup-plugin-scss";
import postcssPresetEnv from "postcss-preset-env";
import merge from 'rollup-merge-config'

const defaultConfig = {
    inject: false, // Don't inject CSS into <HEAD>
    extract: true,
    modules: true,
    plugins: [
      // Postcss plugins to use
      postcssPresetEnv({
        autoprefixer:{}
      }),
    ],
    use: ["sass"], // Use sass / dart-sass
    sourceMap: true,
    outputStyle: 'compressed',
  }

export default ( config = {}, plugin = pscss ) => {
  const finalConfig = merge(defaultConfig, config);
  return plugin(finalConfig);
}
