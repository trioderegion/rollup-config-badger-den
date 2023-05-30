/******************
 * Rollup plugin imports
 ******************/
import resolve from "@rollup/plugin-node-resolve"; //resolves imports from node_modules
import copy from "rollup-plugin-copy";
import node_externals from "rollup-plugin-node-externals";

export default [
  {
    input: {
      'plugin': 'src/index.mjs',
    },
    output: {
      dir: "./dist",
      entryFileNames: 'index.mjs',
      format: "es",
    },
    plugins: [
      node_externals(),
      resolve({ preferBuiltins: true }),
      copy({
        targets: [{ src: "src/demo-module/**", dest: "./dist" }],
        flatten: false,
      }),
    ],
  }];
