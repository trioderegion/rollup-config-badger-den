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
import {pack, unpack} from './pack.mjs';

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
  
  config.build();

  const api = {
    get meta() {
      return config;
    },
    get cache() {
      return config.cache;
    },
    options: options ?? {},
    ranOnce: false,

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
        ...api.cache.manifest.externals,
      ].reduce((acc, curr) => {
        acc[curr] = path.join(api.meta.profile.src, curr);
        return acc;
      }, {});

      const staticLangs = api.cache.manifest.languages.map((lang) => lang.path);
      const staticInputs = [...staticLangs, ...api.meta.config.static].flatMap(
        (entry) => {
          const mapping = {
            src: api.makeInclude(entry),
            dest: path.join(api.meta.profile.dest, path.dirname(entry)),
          };
          return mapping;
        }
      );

      const copyOpts = {
        hook: 'buildEnd',
        verbose: true,
        chokidar:true,
        copySync: true,
        targets: staticInputs,
      }

      if (this.meta.watchMode) {
        copyOpts.watch = staticInputs.map((e) => e.src);
        console.log("Watching Static:", copyOpts.watch);
      }

      const fvttOpts = {
        input,
        context: "globalThis",
        plugins: [
          (api.meta.profile.clean && !api.ranOnce && !api.options.unpack && !api.meta.profile.hmr)
            ? del({
                targets: [api.meta.profile.dest],
                runOnce: true,
                verbose: false,
                force: false,
              })
            : null,
          scssPlug?.({extract: api.meta.config.id + ".css", to: api.meta.profile.src}),
          api.meta.profile.compress ? compressPlug?.() : null,
          !api.ranOnce ? copy(copyOpts) : null,
          resolve({
            browser: true,
            jsnext: true,
            preferBuiltins: false,
          }),
        ],
      };
      
      if (this.meta.watchMode) {
        console.log('current watch opts:', opts.watch)
        fvttOpts.watch = {
          chokidar: true,
          include: [api.makeInclude("/**/*.*js")],
          exclude: ["*.sw*", "*.bd.json"],
        };
      };

      api.ranOnce = true;
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
    buildStart(){
      if (this.meta.watchMode) {
        const styleWatch = config.styleSources.map( s => {
          const file = api.makeInclude(s);
          this.addWatchFile(file)
          return file;
        })
        console.log("Watching Styles:", styleWatch);
      }
    },
    async buildEnd() {
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
        code: api.meta.profile.compress
          ? JSON.stringify(api.cache.manifest)
          : JSON.stringify(api.cache.manifest, null, 2),
      });

      /* should we pack compendiums? */
      if (api.options.pack || api.options.unpack) {

        for (let packInfo of api.cache.manifest.packs) {
          const input = path.join(api.meta.profile.src, packInfo.path);
          const output = path.join(api.meta.profile.dest, packInfo.path);

          if (api.options.unpack) {
            console.log(`Unpacking: ${packInfo.label} (${packInfo.path})`);
            await unpack(output, input);
          }
          
          if (api.options.pack) {
            console.log(`Packing: ${packInfo.label} (${packInfo.path})`);
            await pack(input, output);
          }
        }

      }

      /* If using module storage */
      if (api.meta.cache.manifest.persistentStorage) {
        fs.mkdirSync(path.join(api.meta.profile.dest, 'storage'), {recursive: true}) 
      }

    },
    transform(code) {
      /* replace any usages of %global% with derived value */
      code = api.meta.doReplace(code);

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
