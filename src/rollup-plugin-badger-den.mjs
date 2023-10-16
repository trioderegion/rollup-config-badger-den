/** @typedef {import('./Manifest.mjs').default} BDConfig */
/** @typedef {import('rollup').Plugin} RollupPlugin */
/** @typedef {import('rollup').PluginImpl} PluginImpl */

import path from "path";
//import { globSync as glob } from "glob";
import merge from "rollup-merge-config";
import del from "rollup-plugin-delete"; //cleaning output directory
import copy from "rollup-plugin-copy-watch"; //watching non-directly referenced files
import resolve from "@rollup/plugin-node-resolve"; //resolves imports from node_modules

import terserPlugin from "./terser.config.mjs";
import postScss from "./scss.config.mjs";
import {pack as packCompendium} from './pack.mjs';

const posixPath = (winPath) => winPath.split(path.sep).join(path.posix.sep);

/**
 * Get default badger den plugin provided a badger den manifest loader.
 *
 * @param {Object} pluginConfig
 * @param {BDConfig} pluginConf.config
 * @param {Object<string, Boolean|RollupPlugin>} [pluginConf.plugins={scss:true, compress:false}]
 *
 * @returns {PluginImpl}
 */
export default ({ config, plugins = { scss: true, compress: false } }) =>
  getPlugin({
    config,
    scssPlug:
      plugins.scss === false
        ? null
        : plugins.scss === true || plugins.scss == undefined
        ? postScss
        : scss,
    compressPlug:
      plugins.compress === false
        ? null
        : plugins.compress === true || plugins.compress == undefined
        ? terserPlugin
        : compress,
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
function getPlugin({ config, scssPlug, compressPlug } = {}) {
  /* Some contexts do not forward these system
   * symbols, define them ourself
   */
  const _wdir = process.env.INIT_CWD; //path.dirname(_filename);

  config.build();

  const api = {
    get meta() {
      return config;
    },
    get cache() {
      return config.cache;
    },

    ranOnce: false,

    socketDetected: false,
    manifestId: "",

    makeInclude: (projectLocalPath) =>
      config.makeInclude(_wdir, projectLocalPath),

    relToRoot: (workingDir, targetRoot, rootInputPath) =>
      path.relative(workingDir, path.join(targetRoot, rootInputPath)),
  };

  /* custom plugin allowing a watcher
   * on the package.json so we dont ever
   * need to touch the module.json
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
      const staticInputs = [...api.meta.config.static, ...staticLangs].flatMap(
        (entry) => {
          const mapping = {
            src: api.makeInclude(entry),
            dest: path.join(api.meta.profile.dest, path.dirname(entry)),
          };
          return mapping;
        }
      );

      console.log("Input Modules:", input);
      console.log("Input Styles:", config.styleSources);

      let staticWatch = [];
      let styleWatch = [];
      if (this.meta.watchMode) {
        staticWatch = staticInputs.map((e) => e.src);
        console.log("Watching Static:", staticWatch);

        styleWatch = config.styleSources.map( s => api.makeInclude(s) );
      }

      const fvttOpts = {
        input,
        context: "globalThis",
        plugins: [
          api.meta.profile.clean && !api.ranOnce
            ? del({
                targets: [api.meta.profile.dest],
                runOnce: true,
                verbose: false,
                force: true,
              })
            : null,
          api.meta.profile.compress ? compressPlug?.() : null,
          copy({
            hook: 'buildEnd',
            copySync:true,
            chokidar: true,
            watch: this.meta.watchMode && !api.ranOnce ? staticWatch : false,
            targets: staticInputs,
            verbose: true,
          }),
          resolve({
            browser: true,
            jsnext: true,
            preferBuiltins: false,
          }),
          scssPlug?.({watch: this.meta.watchMode ? styleWatch : false}),
        ],
      };
      api.ranOnce |= true;
      if (this.meta.watchMode) {
        fvttOpts.watch = {
          chokidar: true,
          include: [api.makeInclude("/**/*.*js")],
          exclude: ["*.sw*", "*.bd.json"],
          clearScreen: true,
        };

        console.log("Watching Code:", ...fvttOpts.watch.include);
      };
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
        api.meta.config.socket = true;
        api.meta.build(true);
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
      if (api.meta.profile.pack) {
        const packPromises = api.cache.manifest.packs.map( pack => {
          const input = api.makeInclude(pack.path);
          const output = path.join(api.meta.profile.dest, path.dirname(pack.path));
          console.log(`Packing: ${pack.label} ( ${pack.path} | ${pack.type} )`);
          return packCompendium(input, {output});
        });

        await Promise.all(packPromises);
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

      return { code, map: null };
    },
  });

  return rollupPlug();
}
