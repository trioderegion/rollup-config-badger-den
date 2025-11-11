import cssPlugin from "rollup-plugin-postcss";
import postcssPresetEnv from "postcss-preset-env";
import merge from 'rollup-merge-config';
import postcssImport from 'postcss-import';
import postcssReplace from 'postcss-replace';


export default ( config = {}, pluginConfig = {}, plugin = cssPlugin) => {

  const replace = pluginConfig.replace ?? {};

  const defaultConfig = {
    inject: false, // Don't inject CSS into <HEAD>
    extract: true,
    modules: false,
    plugins: [
      // Postcss plugins to use
      postcssReplace(replace),
      postcssImport(),
      postcssPresetEnv({
        autoprefixer:{}
      }),
    ],
    use: ["sass", "less"], // Use sass / dart-sass and less
    sourceMap: true,
    minimize: true,
  }

  const finalConfig = merge(defaultConfig, config);
  return plugin(finalConfig);
}
