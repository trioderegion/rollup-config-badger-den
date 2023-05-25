import fs from 'fs';
import manifest from './fvtt.config.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

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
  let jsonFull = JSON.parse(fs.readFileSync(pkgPath));
  let jsonFlat = flatten(jsonFull);

  // Replacement paths
  const pkgReplacements = () => {
    return Object.keys(jsonFlat).reduce( (acc, path) => {
      acc[`%${pkgName}.${path}%`] = jsonFlat[path];
      return acc;
    },{})
  };

  let replacements = pkgReplacements();

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
    jsonFlat = flatten(jsonFull);
    replacements = pkgReplacements();
    const stringflat = JSON.stringify(jsonFlat);
    const replacedstring = doReplace(stringflat);
    jsonFlat = JSON.parse(replacedstring);
    replacements = pkgReplacements();
  }
  /* custom plugin allowing a watcher
   * on the package.json so we dont ever
   * need to touch the module.json
   */
  const packagewatcher = () => ({
    get raw() { return jsonFull },
    get json() { return jsonFlat },
    doReplace,  
    init,
    name: `${pkgName}-watcher`,
    buildStart() {
      /* latch the current package */
      init()

      /* emit a configured module.json */
      this.emitFile({
        type: 'prebuilt-chunk',
        fileName: 'module.json',
        code: JSON.stringify(manifest(jsonFull.config), null, 2), 
      })

      /* add styles folder for explicit watching */
      const styles = jsonFull.config.directories?.scss;
      if (!!styles) this.addWatchFile(path.resolve(__dirname, styles))
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

  const pw = packagewatcher()
  pw.init(); //TODO using the NPM environment var gives us most of what we need upfront
  return pw;
}
