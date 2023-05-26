
/******************
 * Node imports
 ******************/
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import dotenv from "dotenv-safe"; 

/******************
 * Rollup plugin imports
 ******************/
import { string } from "rollup-plugin-string"; //allows loading strings as ES6 modules
import resolve from "@rollup/plugin-node-resolve"; //resolves imports from node_modules
import del from 'rollup-plugin-delete'; //cleaning output directory
import copy from 'rollup-plugin-copy-watch'; //watching non-directly referenced files
import commonjs from "@rollup/plugin-commonjs"; 


/******************
 * Pre-configured badger den plugins
 ******************/
import {packageWatcher} from './fvtt.plugs.mjs';
import terserPlugin from './terser.config.mjs';


export default () => {

  /* Some contexts do not forward these system symbols, define them ourself */
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // process.env.TARGET is defined in package.json NPM scripts using the `cross-env` NPM module passing it into running this script. It defines which .env file to use below.
  dotenv.config({
    example: `${__dirname}${path.sep}env${path.sep}.env.example`,
    path: `${__dirname}${path.sep}env${path.sep}${process.env.TARGET}.env`,
    allowEmptyValues: true,
  });

  // Sanity check to make sure parent directory of FVTTDEV_DEPLOY_PATH exists.
  if (!fs.existsSync(path.dirname(process.env.FVTTDEV_DEPLOY_PATH))) {
    throw Error(
      `FVTTDEV_DEPLOY_PATH does not exist: ${process.env.FVTTDEV_DEPLOY_PATH}`
    );
  }

  // Reverse relative path from the deploy path to local directory; used to replace source maps path.
  const relativePath = path.relative(process.env.FVTTDEV_DEPLOY_PATH, ".");

  // Output plugins to use conditionally.
  const outputPlugins = [];
  if (process.env.FVTTDEV_COMPRESS === "true") {
    outputPlugins.push(terserPlugin);
  }

  // Defines whether source maps are generated / loaded from the .env file.
  const addSourceMaps = process.env.FVTTDEV_SOURCEMAPS === "true";

  // if we are cleaning the output dir
  const cleanOutDir = process.env.FVTTDEV_CLEAN_OUTDIR === 'true';

  // Shortcuts
  const moduleId = process.env.npm_package_config_id;
  const DEPLOY_PATH = path.join(process.env.FVTTDEV_DEPLOY_PATH, moduleId);
  const STATIC_PATH = process.env.npm_package_config_static;
  console.log(`Building with environment: ${process.env.TARGET}`);
  console.log('Source: ', __dirname );
  console.log('Target: ', DEPLOY_PATH);
  
  return [
    {
      output: {
        dir: DEPLOY_PATH,
        entryFileNames: '[name]',
        format: "es",
        plugins: outputPlugins,
        paths: {
          '$lib': './lib/index.js'
        },
        globals: {
          jquery: '$',
        },
        sourcemap: addSourceMaps,
        sourcemapPathTransform: (sourcePath) =>
          sourcePath.replace(relativePath, `.`),
      },
      plugins: [
        cleanOutDir ? del({
          targets: [DEPLOY_PATH],
          runOnce: false,
          verbose: false,
          force: true,
        }) : null,
        packageWatcher(),
        copy({
          watch: process.env.ROLLUP_WATCH == 'true' ? [
            STATIC_PATH
          ] : false,
          targets: [
            { src: STATIC_PATH, dest: DEPLOY_PATH },
          ],
        }),
        string({ include: ["**/*.css", "**/*.html"] }),
        resolve({ browser: true, jsnext:true, preferBuiltins: false }), 
        commonjs(), 
      ],
    },
  ];
};
