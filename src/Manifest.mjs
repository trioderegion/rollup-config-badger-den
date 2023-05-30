import locale from "locale-codes";
import { globSync as glob } from "glob";
import path from "path";
import fs from "fs";

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

class BDConfig {
  #cache = { manifest: null, replacements: null };
  profile = null;
  config = null;
  namespace = null;

  /**
   * Generate manifest data
   *
   * @param {BadgerDenConfig} config
   * @param {BadgerDenProfile} profile
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

  makeEntryPointFields = (entryPoints, profile = this.profile) => {
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
              path: path.relative(
                profile.src,
                path.join(profile.src, filename)
              ),
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
      compatibility: compat(versions),
    }));

  get cache() {
    return this.#cache;
  }

  build(force = false) {
    if (force) this.#cache = { manifest: null, replacements: null };

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
      manifest: "",
      download: "",
    };

    this.#cache.replacements ??= this.pkgReplacements();

    return this.#cache;
  }

  load(profileURI) {
    console.log(profileURI);
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
    const config = JSON.parse(fs.readFileSync(configPath));

    config.id ??= configName;

    if (!config.id) {
      throw new Error(
        `Could not read field "id" from configuration file: ${configPath}`
      );
    }

    /* latch desired profile */
    const profile = config.profile[profileName];
    const moduleRoot = path.dirname(configPath);
    profile.src = moduleRoot;

    if (!profile.dest) {
      throw new Error(
        `No destination ("dest") found for profile ${profileName}`
      );
    }

    if (!path.isAbsolute(profile.dest))
      profile.dest = path.resolve(path.join(configRel, profile.dest));

    // Sanity check to make sure parent directory of the module (i.e. profile.dest) exists.
    if (!fs.existsSync(profile.dest)) {
      throw new Error(
        `${nameProfile} destination path does not exist: ${profile.dest}`
      );
    }

    /* Final resting place is defined 'destination' + packageID */
    profile.dest = path.join(profile.dest, config.id);

    config.entryPoints ??= {};
    config.dependencies ??= {};
    config.dependencies.core ??= [];
    config.dependencies.systems ??= {};
    config.dependencies.modules ??= {};

    return { profile, config };
  }

  get styleSources() {
    let styles = this.config.entryPoints?.style ?? [];
    if (typeof styles == "string") styles = [styles];
    styles = styles.flatMap((entry) =>
      glob(api.makeInclude(this.profile.src, entry), {
        cwd: this.profile.src,
      }).filter((fp) => !!path.extname(fp))
    );
  }

  makeInclude(root, target) {
    return path
      .join(path.relative(root, this.profile.src), target)
      .replace(/\\/g, "/");
  }
}

export default BDConfig;
