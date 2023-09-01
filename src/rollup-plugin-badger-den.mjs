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

      let staticWatch = [];
      let styleWatch = config.styleSources;
      if (this.meta.watchMode) {
        staticWatch = staticInputs.map((e) => e.src);
        console.log("Watching Static:", staticWatch);
        styleWatch = styleWatch.map((s) => api.makeInclude(s));
        console.log("Watching Styles:", styleWatch);
      }

      console.log("SCSS Files:", config.styleSources);

      const fvttOpts = {
        input,
        context: "globalThis",
        plugins: [
          api.meta.profile.clean
            ? del({
                targets: [api.meta.profile.dest],
                runOnce: false,
                verbose: false,
                force: true,
              })
            : null,
          scssPlug?.({
            watch: this.meta.watchMode ? styleWatch : false,
          }),
          api.meta.profile.compress ? compressPlug?.() : null,
          resolve({
            browser: true,
            jsnext: true,
            preferBuiltins: false,
          }),
          copy({
            watch: this.meta.watchMode ? staticInputs.map((e) => e.src) : false,
            targets: staticInputs,
            verbose: true,
          }),
        ],
      };

      if (this.meta.watchMode) {
        fvttOpts.watch = {
          include: [api.makeInclude("/**")],
          exclude: ["*.sw*", "*.bd.json"],
          clearScreen: true,
        };

        console.log("Watching Code:", ...fvttOpts.watch.include);
      }

      return merge(opts, fvttOpts);
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
          //console.log('profile source', api.meta.profile.src);
          //console.log('profile dest', api.meta.profile.dest);
          sourcePath = posixPath(
            path.resolve(path.join(path.dirname(mapFilePath), sourcePath))
          );
          mapFilePath = posixPath(mapFilePath);
          //console.log('sourcePath', sourcePath, 'mapFilePath', mapFilePath);
          const stripModule = new RegExp(`(.*${api.meta.config.id}\/)`);
          const sourceLocal = posixPath(path.resolve(sourcePath)).replace(
            stripModule,
            ""
          );
          //console.log('sourceLocal', sourceLocal);

          const mapLocal = mapFilePath.replace(stripModule, "");
          //console.log('mapLocal', mapLocal);

          const sourceMapRel = path.relative(
            path.dirname(mapLocal),
            sourceLocal
          );
          //console.log('sourceMapRel', sourceMapRel, '\n');
          return sourceMapRel;
        },
      };
      const merged = merge(opts, output);
      //console.log(opts, output, merged);
      return merged;
    },
    buildEnd() {
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
