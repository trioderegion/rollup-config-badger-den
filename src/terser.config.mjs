import terser from "@rollup/plugin-terser"; //minification / mangling

export default () =>
  terser({
    compress: {
      booleans_as_integers: false,
      passes: 2,
    },
    mangle:false,
    format: {
      ecma: 2016,
      indent_level: 2,
      quote_style: 3, //original quotes
      keep_quoted_props: true,
      braces:true,
    },
    module: true,
    nameCache: null,
  });
