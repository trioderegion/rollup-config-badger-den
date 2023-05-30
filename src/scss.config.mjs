import pscss from "rollup-plugin-scss";
import autoprefixer from "autoprefixer";
import postcssPresetEnv from "postcss-preset-env";
import merge from 'rollup-merge-config'

const defaultConfig = {
    fileName: "static/style.css",
    inject: false, // Don't inject CSS into <HEAD>
    extract: true,
    extensions: [".scss"], // File extensions to process
    modules: true,
    plugins: [
      // Postcss plugins to use
      autoprefixer,
      postcssPresetEnv,
    ],
    use: ["sass"], // Use sass / dart-sass
    sourceMap: true,
  }

export default ( config = {}, plugin = pscss ) => {
  const finalConfig = merge(defaultConfig, config);
  return plugin(finalConfig);
}
