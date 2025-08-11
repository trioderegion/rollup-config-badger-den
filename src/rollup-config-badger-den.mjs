import loader from "./Manifest.mjs";
import bdPlug from "./rollup-plugin-badger-den.mjs";
import commonjs from "@rollup/plugin-commonjs";
import denDB from "./rollup-plugin-badger-foundry.mjs";
import fs from "fs";

/** @typedef {import('./Manifest.mjs').BDConfig} BDConfig */
/** @typedef {import('rollup').Plugin} RollupPlugin */
/** @typedef {import('rollup').RollupOptions} RollupOptions */
/** @typedef {import('rollup').defineConfig} DefineConfig */

/**
 * @type DefineConfig
 * @param {Object} [configuration] 
 * @param {BDConfig|string} [configuration.denConfig] Constructed and built BDConfig instance, or path URI (path:profile) to den configuration file.
 * @param {BadgerDenPlugin} [configuration.denPlug=BadgerDenPlugin] Allows a customized plugin compatible with {@see BadgerDenPlugin} to be used.
 *
 * @returns {RollupOptions}
 */
const defineConfig = ({
  denConfig = null,
  denPlug = bdPlug,
  unpack = false,
  pack = false,
  version = false,
} = {}) => {
  const overrides = {}
  if (version) {
    overrides.version = version;
  }

  if (typeof denConfig == 'string') {
    try {
      denConfig = new loader(denConfig, {overrides});
    } catch (e) {
      console.log(e);
      console.log(`Badger Den: Config/profile identifier "${denConfig}"`);
      return;
    }
  }

  if (!denConfig.config.version) throw new Error('Version required for build. See "DenConfigJSON.version", "DenProfileJSON.version", or argument "--config-version [string]".');

  const packageType = "module"; //TODO support systems
  console.log(`Badger Den: building ${packageType} "${denConfig.config.id}@${denConfig.config.version}"`);
  console.log(`-- Profile: "${denConfig.profile.name}"`);
  console.log(`-- From   : ${denConfig.profile.src}`)
  console.log(`-- To     : ${denConfig.profile.dest}`);

  denConfig.build();
  if (!fs.existsSync(denConfig.profile.dest)) fs.mkdirSync(denConfig.profile.dest);

  const noBundle = [unpack, pack].includes('only');
  if (noBundle) {
    return {
      plugins: [denDB({config: denConfig, pack, unpack})]
    }
  }

  return {
    /** @type {import('rollup').OutputOptions} */
    output: {
      dir: denConfig.profile.dest,
    },
    watch: {
      clearScreen: false,
    },
    /** @type {import('rollup').InputPluginOptions} */
    plugins: [
      commonjs(),
      denPlug({config: denConfig}),
      denDB({config: denConfig, pack, unpack})
    ]
  }
};

/**
 * Default entry point to be called via rollup as a configuration "file".
 *
 * @param {Object<string, string>} cliArgs Expects a 'config-den' field containing the den config URI (path:profile) to use for this build.
 * @returns {RollupPlugin}
 */
const cliConfig = (cliArgs) => {
  if(!('config-den' in cliArgs))
    throw new Error('Missing den location argument, "--config-den <bd.json path>:<build profile>"');

  return defineConfig({
    denConfig: cliArgs['config-den'],
    pack: cliArgs['config-pack'] ?? false,
    unpack: cliArgs['config-unpack'] ?? false,
    version: cliArgs['config-version'] ?? false,
  });
}

export {
  defineConfig, cliConfig as default
}
