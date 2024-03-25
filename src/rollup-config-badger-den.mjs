import loader from "./Manifest.mjs";
import bdPlug from "./rollup-plugin-badger-den.mjs";
import commonjs from "@rollup/plugin-commonjs";

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
const defineConfig = ({denConfig = null, denPlug = bdPlug, unpack = false, pack = false} = {}) => {

  if (typeof denConfig == 'string') {
    try {
      denConfig = new loader(denConfig);
    } catch (e) {
      console.log(e);
      console.log(`Badger Den: Config/profile identifier "${denConfig}"`);
      return;
    }
  }

  const packageType = "module"; //TODO support systems
  console.log(`Badger Den: building ${packageType} "${denConfig.config.id}"`);
  console.log(`-- Using profile "${denConfig.profile.name}"`);
  console.log(`-- From ${denConfig.profile.src}`)
  console.log(`-- To   ${denConfig.profile.dest}`);
  return {
    /** @type {import('rollup').OutputOptions} */
    output: {
      dir: denConfig.profile.dest,
    },
    /** @type {import('rollup').InputPluginOptions} */
    plugins: [
      denPlug({
        config: denConfig,
        options: {
          pack,
          unpack,
        }
      }),
      denConfig.cache.manifest.externals.length > 0 ? commonjs() : null,
    ],
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
    pack: 'config-pack' in cliArgs,
    unpack: 'config-unpack' in cliArgs,
  });
}

export {
  defineConfig, cliConfig as default
}
