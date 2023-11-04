import cssPlugin from "rollup-plugin-postcss";
import postcssPresetEnv from "postcss-preset-env";
import merge from 'rollup-merge-config';
import postcssImport from 'postcss-import';

const defaultConfig = {
    inject: false, // Don't inject CSS into <HEAD>
    extract: true,
    modules: true,
    plugins: [
      // Postcss plugins to use
      postcssImport(),
      postcssPresetEnv({
        autoprefixer:{}
      }),
    ],
    use: ["sass"], // Use sass / dart-sass
    sourceMap: true,
    outputStyle: 'compressed',
  }

export default ( config = {}, plugin = cssPlugin) => {
  const finalConfig = merge(defaultConfig, config);
  return plugin(finalConfig);
}
