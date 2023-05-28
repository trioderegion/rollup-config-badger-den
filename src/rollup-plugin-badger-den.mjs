import { fileURLToPath } from "url";
import path from "path";
import { globSync as glob } from "glob";
import merge from "rollup-merge-config";
import del from "rollup-plugin-delete"; //cleaning output directory
import copy from "rollup-plugin-copy-watch"; //watching non-directly referenced files
import locale from "locale-codes";
import resolve from "@rollup/plugin-node-resolve"; //resolves imports from node_modules

// Flatten an object to dot notation
const flatten = (obj, roots = [], sep = ".") =>
  Object.keys(obj).reduce(
    (memo, prop) =>
      Object.assign(
        {},
        memo,
        Object.prototype.toString.call(obj[prop]) === "[object Object]"
          ? flatten(obj[prop], roots.concat([prop]), sep)
          : { [roots.concat([prop]).join(sep)]: obj[prop] }
      ),
    {}
  );

// Replacement paths for simple search/replace
// TODO split paths and lookup recursively
const pkgReplacements = (pkg, prefix) => {
  const flat = flatten(pkg);
  return Object.keys(flat).reduce((acc, path) => {
    acc[`%${prefix}.${path}%`] = flat[path];
    return acc;
  }, {});
};

//TODO grab by /%((?\w+).?))+%/g
const doReplace = (targetString, replacements) => {
  //console.log('replacements', replacements);
  Object.entries(replacements).forEach(([key, val]) => {
    const regex = new RegExp(key, "g");
    targetString = targetString.replace(regex, () => val);
  });
  return targetString;
};

const makeEntryPointFields = (entryPoints, profile) => {
  /* ES Modules */
  let esmodules = entryPoints.main ?? [];
  if (typeof esmodules == "string") esmodules = [esmodules];
  esmodules = esmodules.flatMap((entry) =>
    glob(entry, { cwd: profile.src }).filter((fp) => !!path.extname(fp))
  );

  /* Externals */
  let externals = entryPoints.external ?? [];
  if (typeof externals == "string") externals = [externals];
  externals = externals.flatMap((entry) =>
    glob(entry, { cwd: profile.src }).filter((fp) => !!path.extname(fp))
  );

  /* Compiled Styles */
  let styles = entryPoints.style ?? [];
  if (typeof styles == "string") styles = [styles];
  styles = styles.flatMap((entry) =>
    glob(entry, { cwd: profile.src })
      .filter((fp) => !!path.extname(fp) && path.parse(fp).base[0] != "_")
      .map((fp) =>
        path.relative(
          profile.src,
          path.join(
            profile.src,
            "static",
            path.format({
              name: path.parse(fp).name,
              ext: ".css",
            })
          )
        )
      )
  );

  /* Discovered Languages */
  let languages = entryPoints.lang ?? [];
  if (typeof languages == "string") languages = [languages];
  languages = languages.flatMap((entry) => {
    const files = glob(entry, { cwd: profile.src }).filter(
      (fp) => !!path.extname(fp)
    );
    return files
      .map((filename) => {
        if (path.extname(filename) == `.json`) {
          const lang = path.basename(filename, ".json");
          const name = locale.getByTag(lang).name;
          return {
            lang,
            name,
            path: path.relative(profile.src, path.join(profile.src, filename)),
          };
        }
        return null;
      })
      .filter((lang) => !!lang);
  });

  console.log("Entry Points:", { esmodules, externals });
  console.log("Root Styles:", styles);
  console.log("Languages:", languages);

  return { esmodules, styles, languages, externals };
};

const compat = ([min, curr, max]) => {
  const data = {};
  !!min ? (data.minimum = min) : null;
  !!curr ? (data.verified = curr) : null;
  !!max ? (data.maximum = max) : null;
  return data;
};

const makeDep = (deps) =>
  Object.entries(deps).map(([id, versions]) => ({
    id,
    compatibility: compat(versions),
  }));

/**
 * Generate manifest data
 *
 * @param {PackageConfig} config
 * @returns
 */
const buildManifest = (config, profile) => {
  config.entryPoints ??= {};
  config.dependencies ??= {};
  config.dependencies.core ??= [];
  config.dependencies.systems ??= {};
  config.dependencies.modules ??= {};
  return {
    title: config.title,
    id: config.id,
    ...makeEntryPointFields(config.entryPoints, profile),
    compatibility: compat(config.dependencies.core),
    relationships: {
      systems: makeDep(config.dependencies.systems),
      modules: makeDep(config.dependencies.modules),
    },
    description: config.description,
    version: config.version,
    authors: config.authors,
    url: config.projectUrl,
    manifest: "",
    download: "",
  };
};

export default ({ config, profile, scssPlug, compressPlug } = {}) => {
  /* Some contexts do not forward these system
   * symbols, define them ourself
   */
  const _filename = fileURLToPath(import.meta.url);
  const _wdir = path.dirname(_filename);

  const _cache = {
    manifest: null,
    replacements: null,
  };

  const api = {
    get cache() {
      return _cache;
    },
    makeInclude: (absoluteSource, projectLocalPath) =>
      path
        .join(path.relative(_wdir, absoluteSource), projectLocalPath)
        .replace(/\\/g, "/"),

    relToRoot: (workingDir, targetRoot, rootInputPath) =>
      path.relative(workingDir, path.join(targetRoot, rootInputPath)),

    _init: (force = false) => {
      if (force) Reflect.ownKeys(_cache).forEach((k) => (_cache[k] = null));

      _cache.replacements = pkgReplacements(config, "config");
      _cache.manifest = buildManifest(config, profile);
    },
  };

  /* custom plugin allowing a watcher
   * on the package.json so we dont ever
   * need to touch the module.json
   */
  const rollupPlug = () => ({
    name: "badger-den",
    api,
    options(opts) {
      api._init();

      const input = [
        ...api.cache.manifest.esmodules,
        ...api.cache.manifest.externals,
      ].reduce((acc, curr) => {
        acc[curr] = api.relToRoot(_wdir, profile.src, curr);
        return acc;
      }, {});

      const staticLangs = api.cache.manifest.languages.map((lang) => lang.path);
      const staticInputs = [...config.static, ...staticLangs].flatMap(
        (entry) => {
          const mapping = {
            src: api.makeInclude(profile.src, entry),
            dest: path.join(profile.dest, path.dirname(entry)),
          };
          //console.log('Static Watch', mapping);
          return mapping;
        }
      );

      console.log("Input Modules:", input);

      const fvttOpts = {
        input,
        context: "globalThis",
        watch: {
          include: [api.makeInclude(profile.src, "/**")],
          exclude: ["*.sw*", "*.bd.json"],
          clearScreen: true,
        },
        plugins: [
          scssPlug(),
          copy({
            watch: this.meta.watchMode ? staticInputs.map((e) => e.src) : false,
            targets: staticInputs,
            verbose: true,
          }),
          profile.clean
            ? del({
                targets: [profile.dest],
                runOnce: false,
                verbose: false,
                force: true,
              })
            : null,
          profile.compress ? compressPlug() : null,
          resolve({
            browser: true,
            jsnext: true,
            preferBuiltins: false,
            modulePaths: [path.join(profile.src)],
          }),
        ],
      };
      return merge(opts, fvttOpts);
    },
    outputOptions(opts) {
      const output = {
        entryFileNames: "[name]",
        format: "es",
        globals: {
          jquery: "$",
        },
        sourcemap: profile.sourcemaps,
        sourcemapPathTransform: (
          sourcePath //TODO need to revisit
        ) => sourcePath.replace(_wdir, "."),
      };
      return merge(opts, output);
    },
    buildStart() {
      /* emit a configured module.json */
      this.emitFile({
        type: "prebuilt-chunk",
        fileName: "module.json",
        code: profile.compress
          ? JSON.stringify(api.cache.manifest)
          : JSON.stringify(api.cache.manifest, null, 2),
      });

      if (this.meta.watchMode) {
        /* add styles folder for explicit watching */
        let styles = config.entryPoints?.style ?? [];
        if (typeof styles == "string") styles = [styles];
        styles = styles.flatMap((entry) =>
          glob(api.makeInclude(profile.src, entry), {
            cwd: process.src,
          }).filter((fp) => !!path.extname(fp))
        );
        styles.forEach((fp) => this.addWatchFile(fp));
        console.log("Watching Styles", styles);
      }
    },
    transform(code) {
      /* replace any usages of %global% with derived value */
      code = doReplace(code, api.cache.replacements);
      return { code, map: null };
    },
  });

  return rollupPlug();
};
