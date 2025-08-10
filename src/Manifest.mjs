import locale from "locale-codes";
import { globSync as glob } from "glob";
import path from "path";
import fs from "fs";
import deepmerge from "deepmerge";
import JSON5 from "json5";

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
 * @typedef {String|Array<String>} globstring
 */

/**
 * Definitions for module-included compendium databases. If `String` forms are used, values will apply to all discovered compendiums. If `Object` fields are used, values should be `String:String` pairs keyed by the compendium's containing folder, which is used as its ID.
 *
 * @typedef {Object} CompendiaJSON
 * @prop {globstring} path Defines root folders for general, or specific database discovery
 * @prop {String|Object} type FoundryVTT Document type for discovered databases
 * @prop {String|Object} label Displayed name of compendium in FoundryVTT
 * @prop {Object} ownership User permissions for compendiums
 * @prop {String|Object} [banner] Asset path for compendium banner
 * @prop {String|Object} [system] associated system (if any) for compendiums
 * @prop {{label:String, color:?String}} [folder] Top level folder definition, color fields use hex-strings of the form `"#RRGGBB"`.
 */

/**
 * Top level definition of this module's root files, or entry points. Language files should follow the country code naming convention, e.g. `en.json` or `ja.json`, for proper detection.
 * All files/globstrings listed in this section, _except_ for compendia, will be watched for changes and trigger rebundles. Compendium entries are unpacked (if requested) prior to any cleaning operation of the output folder, and packed _after_ said cleaning operation.
 *
 * @typedef {Object} EntryPointJSON
 * @prop {globstring} main paths for top level module files (e.g. `init.mjs` or `[module name].mjs`)
 * @prop {globstring} [lang] paths for language files with `[country code].json` format (e.g. `en.json`)
 * @prop {globstring} [templates] paths for handlebars template files (.hbs or .html)
 * @prop {CompendiaJSON} [compendia] folder paths containing leveldb source files, with equivalent relative paths used as location for profile's built package databases
 */

/**
 * Defines if and how the resulting bundle should be packaged as a .zip file for distribution. Resulting archive is placed as a sibling of the profile's destination path.
 *
 * @typedef {Object} PackageJSON
 * @prop {Boolean} [create=false] Should the resulting bundle be zipped for distribution
 * @prop {String} [name] Base name of the resulting zip file, e.g. "cool-mod" -> "cool-mod.zip". Defaults to "[id]-[version]".
 * @prop {Boolean} [protected=false] Controls packing for premium modules and has the following side effects:
 *                                      - `manifest`: defaults to Foundry's premium content server unless specified otherwise
 *                                      - `download`: removes this field (if provided) as it is served from Foundry after DRM validation
 * @prop {String} [manifest=""] URL pointing to the most recent release's manifest file
 * @prop {String} [download=""] URL pointing to this specific release's distribution package (.zip file)
 */

/**
 * @typedef {Object} DenProfileJSON
 * @prop {String} [dest] output directory for resulting build, relative to this bd config file (overrides {@link DenConfigJSON.dest})
 * @prop {String} [id] top level identifier for module (overrides {@link DenConfigJSON.id})
 * @prop {String} [version] directly added to resulting manifest (overrides {@link DenConfigJSON.version})
 * @prop {Boolean} [compress] compress resulting json, (m)js, and css files (extremely conservative, but do confirm proper operation)
 * @prop {Boolean} [sourcemaps] generate sourcemaps for resulting (m)js and css files.
 * @prop {Boolean} [clean] clear contents of target `dest` directory before build (does not clean on watch)
 * @prop {Boolean} [hmr] enable hot reload functionality for html, css, hbs, and json files (overrides `clean` to false)
 * @prop {EntryPointJSON} [entryPoints] merged with top level `entryPoints` field; see {@link DenConfigJSON.entryPoints}
 * @prop {globstring} [static] merged with top level `static` field; see {@link DenConfigJSON.static}
 * @prop {PackageJSON} [package] Profile-specific packaging instructions, merged with top-level field.
 * @prop {Object} [flags] merged with top level `flags` field; see {@link DenConfigJSON.flags}
 */

/**
 * @typedef {Object} DenConfigJSON
 * @prop {String} [id] Top level identifier for module (default is BD file name, as `[id].bd.json`)
 * @prop {String} version Directly added to resulting manifest
 * @prop {String} title Directly added to resulting manifeste
 * @prop {String} description Directly added to resulting manifest
 * @prop {String} [projectUrl]
 * @prop {PackageJSON} [package] Global packaging instructions for all profiles. Overridden by profile entries.
 * @prop {EntryPointJSON} entryPoints
 * @prop {String} dest Output directory for resulting build, relative to this bd config file
 * @prop {globstring} [static] File/folder paths to be directly copied to built package _once_ upon initial bundle only (not 
 *                             re-copied on watch trigger)
 * @prop {Record<String, DenProfileJSON>} profile List of profile objects keyed by its name, such as 'release' or 'dev'
 * @prop {Object} [dependencies] Inner String arrays are treated as `[min, verified, max]` versions
 * @prop {Array<String>} [dependencies.core=[]]
 * @prop {Record<String,Array<String>>} [dependencies.modules={}] Module id to version array
 * @prop {Record<String,Array<String>>} [dependencies.systems={}] System id to version array
 * @prop {Object|Array<Object>} [authors] Directly added to resulting manifest
 * @prop {Object} [flags] Directy added to resulting manifest
 * @prop {Boolean} [socket=false] Directly added to resulting manifest -- automatically detected by presense
 *                                of 'game.socket' in bundled code.
 * @prop {Boolean} [storage=false] Directly added to resulting manifest as "persistentStorage" -- automatically
 *                                 detected by presense of 'uploadPersistent' in bundled code.
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
    this.templates = [];
    this.externals = [];
    this.namespace = namespace;
  }

  // Replacement paths for simple search/replace
  // TODO split paths and lookup recursively
  configReplacements = (prefix = this.namespace) => {
    const flat = flatten(this.config);
    const replacements = Object.keys(flat).reduce((acc, path) => {
      acc[`%${prefix}.${path}%`] = flat[path];
      return acc;
    }, {});

    const sConfig = JSON.stringify(this.config);
    this.config = JSON.parse(this.doReplace(sConfig, replacements));
    return replacements;
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
    profile.static ??= [];

    if (typeof config.static == "string") config.static = [config.static];
    if (typeof profile.static == "string") profile.static = [profile.static];

    const globs = config.static
      .concat(profile.static)
      .map((path) => posixPath(path));

    const staticFiles = glob(globs, {
      cwd: profile.src,
      onlyFiles: true,
      unique: true,
      matchBase: true,
      posix: true,
      ignore: ["*.scss", "*.sw*", "*.tmp", "*.orig"],
    });
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
      glob(entry, { cwd: profile.src, onlyFiles: true }).map(posixPath)
    );

    /* Templates */
    let templates = entryPoints.templates ?? [];
    if (typeof templates == "string") templates = [templates];
    templates = templates.flatMap((entry) =>
      glob(entry, { cwd: profile.src, onlyFiles: true }).map(posixPath)
    );

    /* Compiled Styles */
    this.config.styleSources = glob("**/*.{scss,less,css}", {
      cwd: profile.src,
      onlyFiles: true,
      unique: true,
      gitignore: true,
    }).map(posixPath);
    const styles =
      this.config.styleSources.length > 0 ? [this.config.id + ".css"] : [];

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

    const compendiumFields = Reflect.ownKeys(
      entryPoints.compendia ?? {}
    ).filter((key) => !key.includes("path"));

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
    if ("label" in folder) {
      packFolderEntries.push({
        name: folder.label,
        color: folder.color ?? "#000000",
        packs: packs.map((p) => p.name),
      });
    }

    const statics = this.enumerateStatics(this.config, this.profile);

    console.log("Entry Points:", [...esmodules, ...externals]);
    if (styles.length > 0)
      console.log("Discovered Styles:", this.config.styleSources);
    if (languages.length > 0)
      console.log(
        "Discovered Languages:",
        languages.map((lang) => `${lang.name} (${lang.path})`)
      );
    if (templates.length > 0) console.log("Discovered Templates:", templates);
    if (defFiles.length > 0)
      console.log(
        "Discovered Sub-Types:",
        Reflect.ownKeys(documentTypes).map(
          (type) => `${type}[${Reflect.ownKeys(documentTypes[type]).join(".")}]`
        )
      );
    if (packs.length > 0)
      console.log(
        "Discovered Compendia:",
        packs.map((p) => p.path)
      );
    if (packFolderEntries.length > 0)
      console.log(
        "Compendium Folders:",
        packFolderEntries.map((e) => `${e.name}: ${e.packs.join(", ")}`)
      );
    if (statics.length > 0) console.log("Static Files:", statics);

    return {
      esmodules,
      styles,
      languages,
      templates,
      packs,
      packFolders: packFolderEntries,
      documentTypes,
      externals,
      statics,
    };
  };

  compat = ([min, curr, max]) => {
    const data = {};
    !!min ? (data.minimum = min) : null;
    !!curr ? (data.verified = curr) : null;
    !!max ? (data.maximum = max) : null;
    return data;
  };

  makeDep = (deps, type = 'module') =>
    Object.entries(deps).map(([id, versions]) => ({
      id,
      type,
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
    if (force)
      this.#cache = {
        manifest: null,
        replacements: null,
        statics: null,
        templates: null,
        externals: null,
      };
    else {
      this.#cache ??= {};
      this.#cache.manifest ??= null;
      this.#cache.replacements ??= null;
      this.#cache.statics ??= null;
      this.#cache.templates ??= null;
      this.#cache.externals ??= null;
    }

    this.#cache.replacements ??= this.configReplacements();

    if (Object.values(this.#cache).some((v) => !v)) {
      const { templates, externals, statics, ...entryPoints } =
        this.makeEntryPointFields(this.config.entryPoints);

      this.#cache.statics ??= statics;
      this.#cache.templates ??= templates;
      this.#cache.externals ??= externals;

      /* Prepare final packaging data */
      this.config.package = deepmerge.all([
        {
          name: `${this.config.id}-${this.config.version}`,
          create: false,
          protected: false,
          manifest: "",
          download: "",
        },
        this.config.package ?? {},
        this.profile.package ?? {},
      ]);

      /** @type ManifestJSON */
      this.#cache.manifest ??= {
        id: this.config.id,
        title: this.config.title,
        version: this.config.version,
        description: this.config.description,
        authors: this.config.authors,
        url: this.config.projectUrl,
        compatibility: this.compat(this.config.dependencies.core),
        relationships: {
          systems: this.makeDep(this.config.dependencies.systems, 'system'),
          requires: this.makeDep(this.config.dependencies.modules, 'module'),
        },
        persistentStorage: !!this.config.storage,
        socket: !!this.config.socket,
        manifest: this.config.package.manifest,
        download: this.config.package.download,
        flags: this.config.flags,
        ...entryPoints,
      };



      // TODO dep 'profile.premium'
      if (this.profile.premium) {
        console.warn('[Deprecation: DenProfileJSON.premium] Use [DenConfigJSON|DenProfileJSON].package.protected instead. See PackageJSON.protected. Will be removed in version 2.0.');
        this.config.package.protected = true;
      }

      if (this.config.package.protected) {
        /* add default premium manifest path if none present */
        this.#cache.manifest.manifest = this.config.package.manifest ? this.config.package.manifest : `https://r2.foundryvtt.com/packages-public/${this.config.id}/module.json`;
        delete this.#cache.manifest.download;
        this.#cache.manifest.protected = true;
      }
    }

    return this.#cache;
  }

  modifyManifest(key, value) {
    if (!this.#cache.manifest) {
      throw new Error('Cannot modify unbuilt manifest. Run "build()" first.');
    }

    return (this.#cache.manifest[key] = value);
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
    const json5Path = path.join(configRel, configName + ".bd.json5");
    const jsonPath = path.join(configRel, configName + ".bd.json");

    const configPath = fs.existsSync(json5Path) ? json5Path : fs.existsSync(jsonPath) ? jsonPath : null;

    if (!configPath) {
      throw new Error(
        `Could not locate den config file. Provided URI = "${profileURI}". Localized to "${json5Path}" or "${jsonPath}" from "${
          import.meta.url
        }".`
      );
    }

    const configFile = fs.readFileSync(configPath)

    /** @type DenConfigJSON */
    const config = JSON5.parse(configFile);

    /* latch desired profile */
    if (!(profileName in config.profile ?? {})) {
      throw new Error(
        `Could not locate den config field "profile.${profileName}" in "${configPath}"`
      );
    }

    const profile = config.profile[profileName];
    const moduleRoot = path.dirname(configPath);

    config.name = configName;

    profile.src = moduleRoot;
    profile.name = profileName;
    profile.flags ??= {};

    /* allow profiles to override module ID */
    config.id = profile.id ?? config.id ?? configName;

    /* allow main config to define default output destination */
    profile.dest ??= config.dest;

    if (!profile.dest) {
      throw new Error(
        `No destination ("dest") found for profile ${profileName}`
      );
    }

    if (!path.isAbsolute(profile.dest))
      profile.dest = path.resolve(path.join(configRel, profile.dest));

    /* Sanity check to make sure parent directory of the 
     * module (i.e. profile.dest) exists. */
    if (!fs.existsSync(profile.dest)) {
      fs.mkdirSync(profile.dest, { recursive: true });
    }

    /* Final resting place is defined 'destination' + packageID */
    profile.dest = path.join(profile.dest, config.id);

    config.dependencies ??= {};
    config.dependencies.core ??= [];
    config.dependencies.systems ??= {};
    config.dependencies.modules ??= {};
    config.authors ??= [];

    /* merge profile-based overrides into config */
    config.entryPoints = combineEntryPoints(
      config.entryPoints,
      profile.entryPoints
    );

    config.flags = this.makeFlags(config, profile);
    config.version = profile.version ?? config.version;

    this.config = config;
    this.profile = profile;



    return { profile, config };
  }

  get styleSources() {
    return this.config.styleSources.map((source) =>
      this.makeInclude(this.profile.src, source)
    );
  }

  makeInclude(root, target) {
    return posixPath(path.join(path.relative(root, this.profile.src), target));
  }
}

export default BDConfig;
