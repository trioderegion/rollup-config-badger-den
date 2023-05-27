import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {globSync as glob} from 'glob';
import merge from 'rollup-merge-config';
import del from 'rollup-plugin-delete'; //cleaning output directory
import copy from 'rollup-plugin-copy-watch'; //watching non-directly referenced files
import locale from 'locale-codes';

// Flatten an object to dot notation
const flatten = (obj, roots=[], sep='.') => Object.keys(obj).reduce((memo, prop) => Object.assign({}, memo, Object.prototype.toString.call(obj[prop]) === '[object Object]' ? flatten(obj[prop], roots.concat([prop]), sep) : {[roots.concat([prop]).join(sep)]: obj[prop]}), {})

// Replacement paths for simple search/replace
// TODO split paths and lookup recursively
const pkgReplacements = (pkg, prefix) => {
  const flat = flatten(pkg)
  return Object.keys(flat).reduce( (acc, path) => {
    acc[`%${prefix}.${path}%`] = flat[path];
    return acc;
  },{})
};

//TODO grab by /%((?\w+).?))+%/g
const doReplace = (targetString, replacements) => {
  //console.log('replacements', replacements);
  Object.entries(replacements).forEach( ([key, val]) => {
    const regex = new RegExp(key, 'g');
    targetString = targetString.replace(regex, () => val)
  })
  return targetString;
}

const makeEntryPointFields = (entryPoints) => {
  /* ES Modules */
  let esmodules = entryPoints.main ?? [];
  if(typeof esmodules == 'string') esmodules = [esmodules];
  esmodules = esmodules.flatMap( entry => glob(entry)
    .filter( fp => !!path.extname(fp) )
    .map( fp => path.relative('src/', fp)));

  /* Externals */
  let externals = entryPoints.external ?? [];
  if(typeof externals == 'string') externals = [externals];
  externals = externals.flatMap( entry => glob(entry)
    .filter( fp => !!path.extname(fp) )
    .map( fp => path.relative('src/', fp)));

  /* Compiled Styles */
  let styles = entryPoints.style ?? [];
  if(typeof styles == 'string') styles = [styles];
  styles = styles.flatMap( entry => glob(entry)
    .filter( fp => !!path.extname(fp) && path.parse(fp).base[0] != '_' )
    .map( fp => path.join('static',path.format({
      name: path.parse(fp).name, 
      ext: '.css'
    }))));
  
  /* Discovered Languages */
  let languages = entryPoints.lang ?? [];
  if(typeof languages == 'string') languages = [languages];
  languages = languages.flatMap( entry => {
    const files = glob(entry).filter( fp => !!path.extname(fp) );
    return files.map( filename => {
      if(path.extname(filename) == `.json`) {
        const lang = path.basename(filename, '.json');
        const name = locale.getByTag(lang).name;
        return {lang, name, path: path.relative('src/', filename)};
      }
      return null;
    }).filter( lang => !!lang );
  })

  console.log('Entry Points:', {esmodules, externals});
  console.log('Root Styles:', styles);
  console.log('Languages:', languages);
  console.log('Externals:', externals);

  return {esmodules, styles, languages, externals};
}

const compat = ([min, curr, max]) => {
  const data = {};
  !!min ? data.minimum = min : null;
  !!curr ? data.verified = curr : null;
  !!max ? data.maximum = max : null;
  return data;
}

const makeDep = (deps) => Object.entries(deps).map( ([id, versions]) => ({id, compatibility: compat(versions)}) );

/**
 * Generate manifest data
 *
 * @param {PackageConfig} config
 * @returns 
 */
const buildManifest = (config) => {

    config.entryPoints ??= {}
    config.dependencies ??= {};
    config.dependencies.core ??= [];
    config.dependencies.systems ??= {};
    config.dependencies.modules ??= {};
    return {
      "title": config.title,
      "id": config.id,
      ...makeEntryPointFields(config.entryPoints),
      "compatibility": compat(config.dependencies.core),
      "relationships": {
        "systems": makeDep(config.dependencies.systems),
        "modules": makeDep(config.dependencies.modules),
      },
      "description": config.description,
      "version": config.version,
      "authors": config.authors,
      "url": config.projectUrl,
      "manifest": "",
      "download": ""
    }
};

export default ({
  configPath,
  deployPath,
  sourceMaps,
  cleanOutDir,
  compressOutput,
  scssPlug,
  compressPlug,
}={}) => {

  /* Some contexts do not forward these system 
   * symbols, define them ourself
   */
  const _filename = fileURLToPath(import.meta.url);
  const _dirname = path.dirname(_filename);
  
  const _cache = {
    pkg: null,
    manifest: null,
    replacements: null
  };

  const api = {
    get cache(){ return _cache },
    _init: (force = false) => {

      if (force) Reflect.ownKeys(_cache)
        .forEach( k => _cache[k] = null);

      _cache.pkg ??= JSON.parse(fs.readFileSync(configPath));
      _cache.manifest ??= buildManifest(_cache.pkg.config);
      _cache.replacements = pkgReplacements(_cache.pkg, path.basename(configPath).split('.').at(-2));
    }
  }
  
  /* custom plugin allowing a watcher
   * on the package.json so we dont ever
   * need to touch the module.json
   */
  const rollupPlug = () => ({
    name: 'badger-den',
    api, 
    options(opts) {
      api._init();

      const fvttOpts = {
        input: [...api.cache.manifest.esmodules, ...api.cache.manifest.externals].
          reduce( (acc, output) => {acc[output] = `src${path.sep}${output}`; return acc;},{}),
        context: 'globalThis',
        watch: {
          include: ['src/**'],
          exclude: ['**/*.sw*'],
          clearScreen: true,
        },
        external: [
          '$lib', ...api.cache.manifest.externals
        ],
        plugins: [
          scssPlug(),
          copy({
            watch: this.meta.watchMode ? api.cache.pkg.config.static : false,
            targets: api.cache.pkg.config.static.map( sp => ({src: sp, dest: deployPath}))
          }),
          cleanOutDir ? del({
            targets: [deployPath],
            runOnce: false,
            verbose: false,
            force: true,
          }) : null,
        ],
      };

      return merge(opts, fvttOpts);
    },
    outputOptions(opts) {
      const output = {
        dir: deployPath,
        entryFileNames: '[name]',
        format: "es",
        plugins: compressOutput ? [compressPlug] : [],
        paths: {
          '$lib': './lib',
          ...api.cache.pkg.config.alias, //TODO dont think this is working well
        },
        globals: {
          jquery: '$',
        },
        sourcemap: sourceMaps,
        //sourcemapPathTransform: (sourcePath) => //TODO need to revisit
        //sourcePath.replace(deployPath, '.'),
      }
      return merge(opts,output);
    },
    buildStart() {
      /* emit a configured module.json */
      this.emitFile({
        type: 'prebuilt-chunk',
        fileName: 'module.json',
        code: JSON.stringify(api.cache.manifest, null, 2), 
      })

      if (this.meta.watchMode) {
        /* add styles folder for explicit watching */
        /* Compiled Styles */
        let styles = api.cache.pkg.config.entryPoints?.style ?? [];
        if(typeof styles == 'string') styles = [styles];

        styles = styles.flatMap( entry => glob(entry)
          .filter( fp => !!path.extname(fp) ));
        console.log('Watching Styles:', styles);
        styles.forEach(fp => this.addWatchFile(path.resolve(_dirname, fp)));
      }
    },
    transform(code) {
      /* add the package.json to the watch list
       * for all sources in this bundle, so
       * %package.path% shortcuts can be used.
       */
      if (this.meta.watcHMode) this.addWatchFile(configPath);
      code = doReplace(code, api.cache.replacements);
      return {code, map: null};
    },
  });

  return rollupPlug();
}
