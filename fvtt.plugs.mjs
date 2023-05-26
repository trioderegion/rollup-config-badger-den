import fs from 'fs';
import buildManifest from './fvtt.config.mjs';
import path from 'path';
import { fileURLToPath } from 'url';
import {globSync as glob} from 'glob';
import merge from 'rollup-merge-config';

import pscssPlug from './scss.config.mjs';

// Helper functions for module building
const flatten = (obj, roots=[], sep='.') => Object.keys(obj).reduce((memo, prop) => Object.assign({}, memo, Object.prototype.toString.call(obj[prop]) === '[object Object]' ? flatten(obj[prop], roots.concat([prop]), sep) : {[roots.concat([prop]).join(sep)]: obj[prop]}), {})

export function packageWatcher(jsonPath = 'package.json', name = 'package') {
  /* Some contexts do not forward these system symbols, define them ourself */
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  
  //reference data in the package.json and module.json for populating the manifest
  let pkgName = name ?? jsonPath.split('.').at(-2);
  if (!name) pkgName = pkgName.split('/').at(-1);
  const pkgPath = path.resolve(__dirname, jsonPath);

  let jsonFull = {}//JSON.parse(fs.readFileSync(pkgPath));
  let jsonFlat = {}//flatten(jsonFull);
  let builtManifest = {}//buildManifest(jsonFull.config);
  let replacements = {}//pkgReplacements();
  
  // Replacement paths
  const pkgReplacements = () => {
    return Object.keys(jsonFlat).reduce( (acc, path) => {
      acc[`%${pkgName}.${path}%`] = jsonFlat[path];
      return acc;
    },{})
  };


  const doReplace = (targetString) => {
    //console.log('replacements', replacements);
    Object.entries(replacements).forEach( ([key, val]) => {
      const regex = new RegExp(key, 'g');
      targetString = targetString.replace(regex, () => val)
    })
    return targetString;
  }

  const init = () => {
    jsonFull = JSON.parse(fs.readFileSync(pkgPath));
    builtManifest = buildManifest(jsonFull.config);
    jsonFlat = flatten(jsonFull);
    replacements = pkgReplacements();
  }
  /* custom plugin allowing a watcher
   * on the package.json so we dont ever
   * need to touch the module.json
   */
  const packagewatcher = () => ({
    name: `${pkgName}-watcher`,
    options(opts) {
      init();
      const fvttOpts = {
        input: [...builtManifest.esmodules, ...builtManifest.externals].
          reduce( (acc, output) => {acc[output] = `src${path.sep}${output}`; return acc;},{}),
        context: 'globalThis',
        watch: {
          include: ['src/**'],
          exclude: ['**/*.sw*'],
          clearScreen: true,
        },
        external: [
          '$lib'
        ],
        plugins: [
          pscssPlug()
        ]
      }
      return merge(opts, fvttOpts);
    },
    buildStart() {
      /* emit a configured module.json */
      this.emitFile({
        type: 'prebuilt-chunk',
        fileName: 'module.json',
        code: JSON.stringify(builtManifest, null, 2), 
      })
      /* add styles folder for explicit watching */
      /* Compiled Styles */
      let styles = jsonFull.config.entryPoints?.style ?? [];
      if(typeof styles == 'string') styles = [styles];

      styles = styles.flatMap( entry => glob(entry)
        .filter( fp => !!path.extname(fp) ));
      console.log('Watching Styles:', styles);
      styles.forEach(fp => this.addWatchFile(path.resolve(__dirname, fp)));
    },
    transform(code) {
      /* add the package.json to the watch list
       * for all sources in this bundle, so
       * %package.path% shortcuts can be used.
       */
      this.addWatchFile(pkgPath);
      code = doReplace(code);
      return {code, map: null};
    },
  });

  return packagewatcher();
}
