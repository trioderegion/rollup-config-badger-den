/** @typedef {import('./Manifest.mjs').default} BDConfig */
/** @typedef {import('rollup').Plugin} RollupPlugin */
/** @typedef {import('rollup').PluginImpl} PluginImpl */

import path from "path";
import fs from "fs";
import merge from "rollup-merge-config";
import del from "rollup-plugin-delete"; //cleaning output directory
import copy from "rollup-plugin-copy-watch"; //watching non-directly referenced files
import resolve from "@rollup/plugin-node-resolve"; //resolves imports from node_modules

import terserPlugin from "./terser.config.mjs";
import sassPlugin from "./scss.config.mjs";

const posixPath = (winPath) => winPath.split(path.sep).join(path.posix.sep);

/**
 * Get default badger den plugin provided a badger den manifest loader.
 *
 * @param {Object} pluginConfig
 * @param {BDConfig} pluginConf.config
 * @param {Object<string, RollupPlugin>} [pluginConf.plugins]
 *
 * @returns {PluginImpl}
 */
export default ({ config, plugins = { scss: sassPlugin, compress: terserPlugin }, options = {pack: false, unpack: false} }) =>
  getPlugin({
    config,
    options,
    scssPlug: plugins.scss ?? sassPlugin,
    compressPlug: plugins.compress ?? terserPlugin,
  });
/** 
 * @typedef {Object} BDInitOptions
 * @prop {BDConfig} config
 * @prop {RollupPlugin} scssPlug
 * @prop {RollupPlugin} compressPlug
 */

/**
 * Get badgerden plugin with explicit auxilliary plugins
 *
 * @param {BDInitOptions} [init={}]
 * @returns {PluginImpl}
 */
function getPlugin({ config, scssPlug, compressPlug, options } = {}) {
  /* Some contexts do not forward these system
   * symbols, define them ourself
   */
  const _wdir = path.dirname(process.env.npm_package_json)
  
  const api = {
    get meta() {
      return config;
    },
    get cache() {
      return config.cache;
    },
    get shouldClean() {
      return this.meta.profile.clean && !this.ranOnce
    },
    options: options ?? {},
    ranOnce: false,
    watchEcho: true,
    loadEcho: false,

    socketDetected: false,
    storageDetected: false,
    manifestId: "",

    makeInclude: (projectLocalPath) =>
      config.makeInclude(_wdir, projectLocalPath),

    relToRoot: (workingDir, targetRoot, rootInputPath) =>
      path.relative(workingDir, path.join(targetRoot, rootInputPath)),
  };

  /** 
   * custom plugin with watching support
   */
  const rollupPlug = () => ({
    name: "rollup-plugin-badger-den",
    api,
    options(opts) {
      const input = [
        ...api.cache.manifest.esmodules,
        ...api.cache.externals,
      ].reduce((acc, curr) => {
        acc[curr] = path.join(api.meta.profile.src, curr);
        return acc;
      }, {});

      const makeStaticEntry = (entry) => {
          const mapping = {
            src: api.makeInclude(entry),
            dest: path.join(api.meta.profile.dest, path.dirname(entry)),
          };
          return mapping;
        };

      const staticLangs = api.cache.manifest.languages
        .map(lang => makeStaticEntry(lang.path));

      const staticTemplates = api.cache.templates.map(makeStaticEntry);
      const staticInputs = api.cache.statics.map(makeStaticEntry);

      const copyOpts = {
        hook: 'generateBundle',
        verbose: false,
        chokidar:true,
        runOnce: true,
        copySync: false,
      }

      const subplugs = [];

      /* Can we safely clean the output directory if requested? */
      //const dbOp = opts.plugins.find(p => p.name === 'rollup-plugin-badger-foundry');
      if (api.shouldClean) {
        subplugs.push(
          del({
            hook: 'buildEnd',
            targets: [api.meta.profile.dest],
            runOnce: true,
            verbose: false,
            force: false,
          }))
      }

      if (scssPlug) {
        subplugs.push(
          scssPlug({
            extract: api.meta.config.id + ".css",
            to: api.meta.profile.src
          }))
      }

      if (api.meta.profile.compress && compressPlug) subplugs.push(compressPlug())

      if (staticInputs.length > 0) {
        subplugs.push(
          copy({
            ...copyOpts,
            targets: staticInputs,
            watch: false,
          }))
      }

      if (staticLangs.length > 0) {
        subplugs.push(
          copy({
            ...copyOpts,
            targets: staticLangs,
          }))
      }

      if (staticTemplates.length > 0) {
        subplugs.push(
          copy({
            ...copyOpts,
            targets: staticTemplates,
          }))
      }

      /* Resolve node module paths */
      subplugs.push(
        resolve({
          browser: true,
          jsnext: true,
          preferBuiltins: false,
        }));

      const fvttOpts = {
        input,
        context: "globalThis",
      };
      
      if (this.meta.watchMode) {
        fvttOpts.watch = {
          chokidar: true,
          include: [api.makeInclude("/**/*.*js")],
          exclude: ["*.sw*", "*.bd.json"],
        };
      };

      api.ranOnce = true;
      opts.plugins.push(...subplugs);
      opts = merge(opts, fvttOpts);
      return opts
    },
    outputOptions(opts) {
      const output = {
        entryFileNames: "[name]",
        format: "es",
        globals: {
          jquery: "$",
        },
        sourcemap: api.meta.profile.sourcemaps,
        sourcemapPathTransform: (sourcePath, mapFilePath) => {
          sourcePath = posixPath(
            path.resolve(path.join(path.dirname(mapFilePath), sourcePath))
          );
          mapFilePath = posixPath(mapFilePath);
          const stripModule = new RegExp(`(.*${api.meta.config.id}\/)`);
          const sourceLocal = posixPath(path.resolve(sourcePath)).replace(
            stripModule,
            ""
          );

          const mapLocal = mapFilePath.replace(stripModule, "");

          const sourceMapRel = path.relative(
            path.dirname(mapLocal),
            sourceLocal
          );
          return sourceMapRel;
        },
      };
      const merged = merge(opts, output);
      return merged;
    },
    load(id){
      if (api.loadEcho) console.log('Loading:', id);
      if (this.meta.watchMode) {
        const watch = (path) => {
          const file = api.makeInclude(path);
          this.addWatchFile(file);
          return file;
        };

        const styleWatch = config.styleSources.map(watch);
        const langWatch = api.cache.manifest.languages.map( l => l.path ).map(watch);
        const templateWatch = api.cache.templates.map(watch);
        if (api.watchEcho) {
          console.log("Watching Styles:", styleWatch);
          console.log("Watching Languages:", langWatch);
          console.log("Watching Templates:", templateWatch);
          api.watchEcho = false;
        }
      }
    },
    buildEnd() {
      /* were sockets detected? */
      if (api.socketDetected) {
        api.meta.modifyManifest('socket', true);
      }

      /* Was module storage detected automatically? */
      if (api.storageDetected) {
        api.meta.modifyManifest('persistentStorage', true);
      }

      /* emit a configured module.json */
      api.manifestId = this.emitFile({
        type: "prebuilt-chunk",
        fileName: "module.json",
        code: JSON.stringify(api.cache.manifest, null, 2),
      });
    },
    async closeBundle() {
      /* If using module storage */
      if (api.meta.cache.manifest.persistentStorage && !fs.existsSync(path.join(api.meta.profile.dest, 'storage'))) {
        fs.mkdirSync(path.join(api.meta.profile.dest, 'storage'), {recursive: true}) 
      }

      if (api.meta.config.package.create)
      {
        const { zip } = await import('zip-a-folder');
        await zip(api.meta.profile.dest, path.join(path.resolve(api.meta.profile.dest, '../'), `${api.meta.config.package.name}.zip`), {destPath: api.meta.config.id});
      }

    },
    transform(code) {
      /* replace any usages of %global% with derived value */
      code = api.meta.makeSubstitutions(code);

      /* if we can find any instance of 'game.socket' set the
       * manifest flag post-creation */
      if (code.includes("game.socket")) {
        api.socketDetected |= true;
      }

      /* if we can find any instance of 'uploadPersistent'
       * set the manifest flag as well */
      if (code.includes("uploadPersistent")) {
        api.storageDetected |= true;
      }

      return { code, map: null };
    },
  });

  return rollupPlug();
}
