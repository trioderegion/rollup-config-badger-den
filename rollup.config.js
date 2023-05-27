
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
import commonjs from "@rollup/plugin-commonjs"; 


/******************
 * Pre-configured badger den plugin
 ******************/
import badgerDen from './den.config.mjs';


export default () => {

  /* Some contexts do not forward these 
   * system symbols, define them ourself 
   */
  const _filename = fileURLToPath(import.meta.url);
  const _dirname = path.dirname(_filename);

  // Define environment/build configuration
  dotenv.config({
    example: path.join(_dirname,'env','.env.example'),
    path: path.join(_dirname,'env',process.env.TARGET+'.env'),
    allowEmptyValues: true,
  });

  // Sanity check to make sure parent directory of the module (i.e. DEN_DEPLOY_PATH) exists.
  if (!fs.existsSync(process.env.DEN_DEPLOY_PATH)) {
    throw new Error(
      `DEN_DEPLOY_PATH does not exist: ${process.env.DEN_DEPLOY_PATH}`
    );
  }

  // Minify/obfuscate output
  const compressOutput = process.env.DEN_COMPRESS == 'true';

  // Defines whether source maps are generated / loaded from the .env file.
  const sourceMaps = process.env.DEN_SOURCEMAPS == 'true';

  // if we are cleaning the output dir
  const cleanOutDir = process.env.DEN_CLEAN_OUTDIR == 'true';

  // Shortcuts
  const moduleId = process.env.npm_package_config_id;
  const DEPLOY_PATH = path.join(process.env.DEN_DEPLOY_PATH, moduleId);
  console.log(`Building with environment: ${process.env.TARGET}`);
  console.log('Source: ', _dirname );
  console.log('Target: ', DEPLOY_PATH);
  
  return [
    {
      output: {
        dir: DEPLOY_PATH,
      },
      plugins: [
        badgerDen({
          configPath: path.resolve('package.json'),
          deployPath: DEPLOY_PATH,
          cleanOutDir,
          sourceMaps,
          compressOutput,
        }),
        string({ include: ["**/*.css", "**/*.html"] }),
        resolve({ browser: true, jsnext:true, preferBuiltins: false }), 
        commonjs(), 
      ],
    },
  ];
};
