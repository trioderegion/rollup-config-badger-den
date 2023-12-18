import locale from "locale-codes";
import { globSync as glob } from "glob";
import path from "path";
import fs from "fs";
import deepmerge from "deepmerge";

/** 
 * A string, or string array, of "glob" paths describing files/folders.
 *
 * Excerpt from {@link https://github.com/mrmlnc/fast-glob/blob/master/README.md | fast-glob's} documentation, which is the library used to resolve file paths for all fields of this type:
 *
 * #### Basic syntax
 *
 *   * An asterisk (`*`) — matches everything except slashes (path separators), hidden files (names starting with `.`).
 *   * A double star or globstar (`**`) — matches zero or more directories.
 *   * Question mark (`?`) – matches any single character except slashes (path separators).
 *   * Sequence (`[seq]`) — matches any character in sequence.
 * 
 * @example 
`src/** /*.js` //matches all files in the `src` directory (any level of nesting) that have the `.js` extension. (space after `/**` due to formatting only, should not be included) 
`src/*.??` //matches all files in the `src` directory (only first level of nesting) that have a two-character extension.
`file-[01].js` //matches files: `file-0.js`, `file-1.js`.
 *
 * @typedef {string|string[]} globstring
 */

/**
 * Definitions for module-included compendium databases. If `string` forms are used, values will apply to all discovered compendiums. If `object` fields are used, values should be `string:string` pairs keyed by the compendium's containing folder, which is used as its ID.
 *
 * @typedef {Object} CompendiaJSON
 * @prop {globstring} path Defines root folders for general, or specific database discovery
 * @prop {string|object} type FoundryVTT Document type for discovered databases
 * @prop {string|object} label Displayed name of compendium in FoundryVTT
 * @prop {string|object} [banner] Asset path for compendium banner
 * @prop {string|object} [system] associated system (if any) for compendiums
 * @prop {{label:string, color:?string}} [folder] Top level folder definition, color fields use hex-strings of the form `"#RRGGBB"`.
 */

/**
 * Top level definition of this module's root files, or entry points. Language files should follow the country code naming convention, e.g. `en.json` or `ja.json`, for proper detection.
 *
 * @typedef {Object} EntryPointJSON
 * @prop {globstring} main paths for top level module files (e.g. `init.mjs` or `[module name].mjs`)
 * @prop {globstring} [lang] paths for language files with `[country code].json` format (e.g. `en.json`), which are treated as static files during bundling
 * @prop {CompendiaJSON} [compendia] folder paths containing leveldb source files, with equivalent relative paths used as location for profile's built package databases
 */

/** 
 * @typedef {Object} DenProfileJSON
 * @prop {string} dest output directory for resulting build, relative to this bd config file
 * @prop {boolean} [compress] compress resulting json, (m)js, and css files (extremely conservative, but do confirm proper operation)
 * @prop {boolean} [sourcemaps] generate sourcemaps for resulting (m)js and css files.
 * @prop {boolean} [clean] clear contents of target `dest` directory before build (does not clean on watch)
 * @prop {boolean} [hmr] enable hot reload functionality for html, css, hbs, and json files (overrides `clean` to false)
 * @prop {object} [entryPoints] merged with top level `entryPoints` field; see {@link DenConfigJSON.entryPoints}
 * @prop {globstring} [static] merged with top level `static` field; see {@link DenConfigJSON.static}
 * @prop {object} [flags] merged with top level `flags` field; see {@link DenConfigJSON.flags}
 */

/**
 * @typedef {Object} DenConfigJSON
 * @prop {string} [id] top level identifier for module (default taken from bd file name, as `[id].bd.json`)
 * @prop {string} version directly added to resulting manifest
 * @prop {string} title directly added to resulting manifeste
 * @prop {string} description directly added to resulting manifest 
 * @prop {string} [projectUrl]
 * @prop {EntryPointJSON} entryPoints
 * @prop {globstring} [static] file/folder paths to be directly copied to built package
 * @prop {Object.<string, DenProfileJSON>} profile list of profile objects keyed by its name, such as 'release' or 'dev'
 * @prop {object} [dependencies] inner string arrays are treated as `[min, verified, max]` versions
 * @prop {string[]} [dependencies.core=[]]
 * @prop {Object.<string,string[]>} [dependencies.modules={}] module id to version array
 * @prop {Object.<string,string[]>} [dependencies.systems={}] system id to version array
 * @prop {object|object[]} [authors] directly added to resulting manifest
 * @prop {object} [flags] directy added to resulting manifest
 * @prop {boolean} [socket=false] directly added to resulting manifest -- automatically detected by presense of 'game.socket' in bundled code.
 * @prop {boolean} [storage=false] directly added to resulting manifest as "persistentStorage" -- automatically detected by presense of 'uploadPersistent' in bundled code.
 */



const posixPath = (winPath) => winPath.split(path.sep).join(path.posix.sep);

const combineEntryPoints = (a = {}, b = {}) => {
  const ensureArray = (val) => (val instanceof Array ? val : [val]);
  const ensureArrayValues = (obj) =>
    Object.keys(obj).forEach((key) => {
      if (key == "compendia") obj[key]["path"] = ensureArray(obj[key]["path"]);
      else obj[key] = ensureArray(obj[key]);
    });
  [a, b].forEach(ensureArrayValues);
  return deepmerge(a, b);
};

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

/**
 * Class which represents the data contained within a specific Badger Den config file. E.g. './rollup-config-badger-den.bd.json'.
 */
class BDConfig {
  #cache = { manifest: null, replacements: null };

  /* Selecte build profile within the config file */
  profile = null;

  /* Full config file */
  config = null;

  /* Replacement namespace */
  namespace = null;

  /**
   * Generate manifest data
   *
   * @constructor
   * @param {string} profileURI
   * @param {string} [namespace='config'] Top level namespace for which all fields inside the declared den config file are available in source code as '%namespace.path.to.field%'.
   */
  constructor(profileURI, namespace = "config") {
    profileURI = path.isAbsolute(profileURI)
      ? profileURI
      : path.join(process.env.INIT_CWD, profileURI);

    const { profile, config } = this.load(profileURI);
    this.config = config;
    this.profile = profile;
    this.namespace = namespace;
  }

  // Replacement paths for simple search/replace
  // TODO split paths and lookup recursively
  pkgReplacements = (pkg = this.config, prefix = this.namespace) => {
    const flat = flatten(pkg);
    return Object.keys(flat).reduce((acc, path) => {
      acc[`%${prefix}.${path}%`] = flat[path];
      return acc;
    }, {});
  };

  //TODO grab by /%((?\w+).?))+%/g
  doReplace = (targetString, replacements = this.#cache.replacements) => {
    //console.log('replacements', replacements);
    Object.entries(replacements).forEach(([key, val]) => {
      const regex = new RegExp(key, "g");
      targetString = targetString.replace(regex, () => val);
    });
    return targetString;
  };

  enumerateStatics(config = {}, profile = {}) {
    config.static ??= [];
    profile.static ??=[];

    if (typeof config.static == "string") config.static = [config.static];
    if (typeof profile.static == "string") profile.static = [profile.static];

    const globs = config.static.concat(profile.static).map( path => posixPath(path) );

    const staticFiles = glob(globs, { cwd: profile.src, onlyFiles: true, unique: true, matchBase: true, posix: true, ignore: ['*.scss', '*.sw*', '*.tmp'] });
    return staticFiles;
  }

  makeEntryPointFields = (entryPoints, profile = this.profile) => {
    /* ES Modules */
    let esmodules = entryPoints.main ?? [];
    if (typeof esmodules == "string") esmodules = [esmodules];
    esmodules = esmodules.flatMap((entry) =>
      glob(entry, { cwd: profile.src })
        .filter((fp) => !!path.extname(fp))
        .map(posixPath)
    );

    /* Externals */
    let externals = entryPoints.external ?? [];
    if (typeof externals == "string") externals = [externals];
    externals = externals.flatMap((entry) =>
      glob(entry, { cwd: profile.src, onlyFiles: true })
        .map(posixPath)
    );

    /* Compiled Styles */
    this.config.styleSources = glob("**/*.{scss,css}", {cwd: profile.src, onlyFiles: true, unique: true, gitignore:true}).map(posixPath);
    const styles = this.config.styleSources.length > 0 ? [this.config.id + '.css'] : [];

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
              path: posixPath(
                path.relative(profile.src, path.join(profile.src, filename))
              ),
            };
          }
          return null;
        })
        .filter((lang) => !!lang);
    });

    /* Discovered document types */
    const defFiles = glob("**/*.bdt.json", { cwd: profile.src });
    const documentTypes = defFiles.reduce((acc, file) => {
      const fullPath = path.join(profile.src, file);
      const { type, ...def } = JSON.parse(fs.readFileSync(fullPath));

      const { base } = path.parse(fullPath);
      const id = base.split(".").at(0);
      acc[type] ??= {};
      acc[type][id] = def;

      return acc;
    }, {});

    /* Discovered compendium source folders */
    /* 1) Enumerate folders of provided paths
     * 3) Construct object of 'name' to {entry data}
     * 4) Grab all other keys inside 'compendia' root to insert into each entry value
     * 5) return as array of values in 'packs' field
     */
    const paths = entryPoints.compendia?.path ?? [];
    const packFolders = paths.flatMap((p) => {
      if (p.at(-1) != "/") p += "/";
      return glob(p, { cwd: profile.src });
    });

    const getPackValue = (name, property) => {
      const val = entryPoints.compendia[property];
      if (!val) return null;
      if (typeof val == "string") return val;

      return val[name];
    };

    const compendiumFields = Reflect.ownKeys(entryPoints.compendia ?? {}).filter(
      (key) => !key.includes("path")
    );

    const packs = packFolders.map((folder) => {
      const folderPath = posixPath(folder);
      const parsed = path.parse(folderPath);
      const { name } = parsed;

      parsed.base = parsed.name = name;
      const packPath = posixPath(path.format(parsed));

      //console.log(folderPath, parsed, packPath, type, name);

      const entry = { name, path: packPath };
      compendiumFields.forEach((opt) => {
        const val = getPackValue(name, opt);
        if (!!val) entry[opt] = val;
      });

      /* adjust path for images (CSS is a pain) */
      if ("banner" in entry) {
        entry["banner"] = `modules/${this.config.id}/${entry["banner"]}`;
      }

      return entry;
    });

    const folder = entryPoints.compendia?.folder ?? {};
    const packFolderEntries = [];
    if ('label' in folder) {
      packFolderEntries.push({name: folder.label, color: folder.color ?? '#000000', packs: packs.map( p => p.name )});
    }

    console.log("Entry Points:", [...esmodules, ...externals]);
    if (styles.length > 0 ) console.log("Discovered Styles:", this.config.styleSources);
    if (languages.length > 0) console.log("Discovered Languages:", languages.map( lang => `${lang.name} (${lang.path})`));
    if (defFiles.length > 0)
      console.log(
        "Discovered Sub-Types:",
        Reflect.ownKeys(documentTypes).map(
          (type) => `${type}[${Reflect.ownKeys(documentTypes[type]).join(".")}]`
        )
      );
    if (packs.length > 0) console.log("Discovered Compendia:", packs.map( p => p.path ));
    if (packFolderEntries.length > 0) console.log("Compendium Folders:", packFolderEntries.map( e => `${e.name}: ${e.packs.join(', ')}` ));
    if (this.config.static.length > 0) console.log("Static Files:", this.config.static);

    return { esmodules, styles, languages, packs, packFolders: packFolderEntries, documentTypes, externals };
  };

  compat = ([min, curr, max]) => {
    const data = {};
    !!min ? (data.minimum = min) : null;
    !!curr ? (data.verified = curr) : null;
    !!max ? (data.maximum = max) : null;
    return data;
  };

  makeDep = (deps) =>
    Object.entries(deps).map(([id, versions]) => ({
      id,
      compatibility: this.compat(versions),
    }));

  get cache() {
    return this.#cache;
  }

  /**
   * Parses the loaded bd config, constructing and caching the module
   * manifest data, as well as the namespace replacements.
   *
   * @param {boolean} [force=false]
   * @returns Object
   * @memberof BDConfig
   */
  build(force = false) {
    if (force) this.#cache = { manifest: null, replacements: null };

    /** @type ManifestJSON */
    this.#cache.manifest ??= {
      title: this.config.title,
      id: this.config.id,
      ...this.makeEntryPointFields(this.config.entryPoints),
      compatibility: this.compat(this.config.dependencies.core),
      relationships: {
        systems: this.makeDep(this.config.dependencies.systems),
        modules: this.makeDep(this.config.dependencies.modules),
      },
      description: this.config.description,
      version: this.config.version,
      authors: this.config.authors,
      url: this.config.projectUrl,
      persistentStorage: !!this.config.storage,
      socket: !!this.config.socket,
      manifest: "",
      download: "",
      flags: this.config.flags,
    };

    if (this.profile.premium) {
      delete this.#cache.manifest.download
      this.#cache.manifest.manifest = `https://foundryvtt.s3.us-west-2.amazonaws.com/modules/${this.config.id}/module.json`;
      this.#cache.manifest.protected = true;
    }

    this.#cache.replacements ??= this.pkgReplacements();

    return this.#cache;
  }

  modifyManifest(key, value) {
    if (!this.#cache.manifest) {
      throw new Error('Cannot modify unbuilt manifest. Run "build()" first.');
    }

    return this.#cache.manifest[key] = value;
  }

  makeFlags(config, profile) {
    /* grab any direct flags defined */
    const global = config.flags ?? {};
    let local = profile.flags ?? {};

    /* grab predefined profile switches */
    if (!!profile.hmr) {
      const predef = {
        hotReload: {
          extensions: ["css", "html", "hbs", "json"],
        },
      };
      local = deepmerge(local, predef);
      profile.clean = false;
    }

    return deepmerge(global, local);
  }

  /**
   * Reads declared config file and preparing neccessary data
   * for module building operations.
   *
   * @param {string} profileURI
   * @returns {{profile: Object, config: Object}}
   * @memberof BDConfig
   */
  load(profileURI) {
    const configRel = path.dirname(profileURI);
    const nameProfile = path.basename(profileURI);
    const [configName = null, profileName = null] = nameProfile.split(":");

    if (!(configRel && configName && profileName)) {
      throw new Error(
        `${profileURI} den config cannot be parsed as "[path]/[config]:[profile]", received: ${configRel}/${configName}:${profileName}`
      );
    }

    /* load package config */
    const configPath = path.join(configRel, configName + ".bd.json");

    if (!fs.existsSync(configPath)) {
      throw new Error(
        `Could not locate den config file. Provided URI = "${profileURI}". Localized to "${configPath}" from "${
          import.meta.url
        }".`
      );
    }

    /** @type DenConfigJSON */
    const config = JSON.parse(fs.readFileSync(configPath));
    config.name = configName;
    if (!("id" in config)) {
      config.id = configName;
    }

    /* latch desired profile */
    if (!(profileName in config.profile ?? {})) {
      throw new Error(
        `Could not locate den config field "profile.${profileName}" in "${configPath}"`
      );
    }

    const profile = config.profile[profileName];
    const moduleRoot = path.dirname(configPath);
    profile.src = moduleRoot;
    profile.name = profileName;
    profile.flags ??= {};

    if (!profile.dest) {
      throw new Error(
        `No destination ("dest") found for profile ${profileName}`
      );
    }

    if (!path.isAbsolute(profile.dest))
      profile.dest = path.resolve(path.join(configRel, profile.dest));

    // Sanity check to make sure parent directory of the module (i.e. profile.dest) exists.
    if (!fs.existsSync(profile.dest)) {
      fs.mkdirSync(profile.dest, {recursive:true});
    }

    /* Final resting place is defined 'destination' + packageID */
    profile.dest = path.join(profile.dest, config.id);

    config.entryPoints = combineEntryPoints(
      config.entryPoints,
      profile.entryPoints
    );
    config.dependencies ??= {};
    config.dependencies.core ??= [];
    config.dependencies.systems ??= {};
    config.dependencies.modules ??= {};
    config.static = this.enumerateStatics(config, profile);
    config.authors ??= [];
    config.flags = this.makeFlags(config, profile);

    /* merge profile-based overrides into config */
    this.config = config;
    this.profile = profile;

    return { profile, config };
  }

  get styleSources() {
    return this.config.styleSources.map( source => this.makeInclude(this.profile.src, source) );
  }

  makeInclude(root, target) {
    return posixPath(path.join(path.relative(root, this.profile.src), target));
  }
}

export default BDConfig;
