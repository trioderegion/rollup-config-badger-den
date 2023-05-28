/******************
 * Node imports
 ******************/

/******************
 * Rollup plugin imports
 ******************/
import resolve from "@rollup/plugin-node-resolve"; //resolves imports from node_modules
import node_externals from "@yelo/rollup-node-external";

export default {
  input: "./src/den.config.mjs",
  external: node_externals(),
  plugins: [
    resolve({preferBuiltins:true}),
  ],
  output: {
    file: "./dist/index.js",
    format: "cjs",
  },
};
