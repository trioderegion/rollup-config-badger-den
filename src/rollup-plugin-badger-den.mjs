import path from "path";
import { globSync as glob } from "glob";
import merge from "rollup-merge-config";
import del from "rollup-plugin-delete"; //cleaning output directory
import copy from "rollup-plugin-copy-watch"; //watching non-directly referenced files
import resolve from "@rollup/plugin-node-resolve"; //resolves imports from node_modules

import terserPlugin from "./terser.config.mjs";
import postScss from "./scss.config.mjs";

export default ({ config, plugins = { scss: true, compress: true } }) =>
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
        : scss,
  });

function getPlugin({ config, scssPlug, compressPlug } = {}) {
  /* Some contexts do not forward these system
   * symbols, define them ourself
   */
  const _wdir = process.env.INIT_CWD //path.dirname(_filename);

  config.build();

  const api = {
    get meta() {
      return config;
    },
    get cache() {
      return config.cache;
    },

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

      let staticWatch = this.meta.watchMode;
      if (staticWatch) {
        staticWatch = staticInputs.map((e) => e.src);
        console.log("Watching Static:", staticWatch);
      }

      const fvttOpts = {
        input,
        context: "globalThis",
        plugins: [
          scssPlug(),
          copy({
            watch: this.meta.watchMode ? staticInputs.map((e) => e.src) : false,
            targets: staticInputs,
            verbose: true,
          }),
          api.meta.profile.clean
            ? del({
                targets: [api.meta.profile.dest],
                runOnce: false,
                verbose: false,
                force: true,
              })
            : null,
          api.meta.profile.compress ? compressPlug() : null,
          resolve({
            browser: true,
            jsnext: true,
            preferBuiltins: false,
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
        //dir: api.meta.profile.dest,
        format: "es",
        globals: {
          jquery: "$",
        },
        sourcemap: api.meta.profile.sourcemaps,
        sourcemapPathTransform: (
          sourcePath, mapFilePath  //TODO need to revisit
        ) => {
          //const outRel = path.resolve(sourcePath, api.meta.profile.dest);
          //console.log('outRel', outRel);

          const sourceRel = path.relative(api.meta.profile.src, sourcePath);
          //console.log('sourceRel', sourceRel);

          const outAbs = path.join(path.dirname(mapFilePath), sourceRel);
          //console.log('outAbs', outAbs);

          const sourceMapRel = path.relative(mapFilePath, outAbs)
          console.log('sourceMapRel', sourceMapRel);
          return sourceMapRel 
        },
      };
      const merged = merge(opts, output);
      //console.log(opts, output, merged);
      return merged;
    },
    buildStart() {
      /* emit a configured module.json */
      this.emitFile({
        type: "prebuilt-chunk",
        fileName: "module.json",
        code: api.meta.profile.compress
          ? JSON.stringify(api.cache.manifest)
          : JSON.stringify(api.cache.manifest, null, 2),
      });

      if (this.meta.watchMode) {
        /* add styles folder for explicit watching */
        let styles = api.meta.config.entryPoints?.style ?? [];
        if (typeof styles == "string") styles = [styles];
        styles = styles.flatMap((entry) =>
          glob(api.makeInclude(entry), {
            cwd: api.meta.profile.src,
          }).filter((fp) => !!path.extname(fp))
        );
        styles.forEach((fp) => this.addWatchFile(fp));
        console.log("Watching Styles:", styles);
      }
    },
    transform(code) {
      /* replace any usages of %global% with derived value */
      code = api.meta.doReplace(code);
      return { code, map: null };
    },
  });

  return rollupPlug();
};
