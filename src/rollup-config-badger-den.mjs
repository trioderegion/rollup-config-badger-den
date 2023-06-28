import loader from "./Manifest.mjs";
import bdPlug from "./rollup-plugin-badger-den.mjs";
import commonjs from "@rollup/plugin-commonjs";

/** @typedef {import('./Manifest.mjs').BDConfig} BDConfig */
/** @typedef {import('./rollup-plugin-badger-den.mjs').BadgerDenPlugin} BadgerDenPlugin */

/**
 *
 *
 * @param {Object} [configuration] 
 * @param {BDConfig|string} [configuration.denConfig] Constructed and built BDConfig instance, or path URI (path:profile) to den configuration file.
 * @param {BadgerDenPlugin} [configuration.denPlug=BadgerDenPlugin] Allows a customized plugin compatible with {@see BadgerDenPlugin} to be used.
 *
 * @returns {RollupConfig}
 */
const bdRollupConfig = ({denConfig = null, denPlug = bdPlug} = {}) => {

  if (typeof denConfig == 'string') {
    /* Assume this is a raw config path and load it */    
    console.log
    denConfig = new loader(denConfig);
  }

  console.log("BadgerDen Workflow    : ", `${denConfig.config.id}:${denConfig.profile.name}`);
  console.log("BadgerDen Source      : ", denConfig.profile.src);
  console.log("BadgerDen Destination : ", denConfig.profile.dest);
  return [{
    output: {
      dir: denConfig.profile.dest,
    },
    plugins: [
      denPlug({
        config: denConfig,
        plugins: {
          compress: true,
          scss: true,
        },
      }),
      denConfig.cache.manifest.externals.length > 0 ? commonjs() : null,
    ],
  }]
};

/**
 * Default entry point to be called via rollup as a configuration "file".
 *
 * @param {Object<string, string>} cliArgs Expects a 'config-den' field containing the den config URI (path:profile) to use for this build.
 * @returns {RollupConfig}
 */
const cliConfig = (cliArgs) => {
  if(!('config-den' in cliArgs))
    throw new Error('Missing den location argument, "--config-den <bd.json path>:<build profile>"');

  return bdRollupConfig({
    denConfig: cliArgs['config-den']
  });
}

export {
  bdRollupConfig, cliConfig as default
}
