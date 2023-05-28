import terser from "@rollup/plugin-terser"; //minification / mangling

export default () =>
  terser({
    compress: {
      booleans_as_integers: false,
      passes: 3,
      unsafe: {
        compress: true,
      },
    },
    mangle: {
      toplevel: true,
      properties: false,
    },
    ecma: 2020,
    module: true,
    nameCache: {},
  });
