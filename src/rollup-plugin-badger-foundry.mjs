import path from "path";
import ldb from './pack.mjs';

/** @typedef {import('rollup').Plugin} RollupPlugin */
/** @typedef {import('rollup').PluginImpl} PluginImpl */


/**
 * Get foundry database plugin provided a badger den manifest loader.
 *
 * @param {Object} pluginConfig
 * @param {BDConfig} pluginConf.config
 * @param {Object<string, RollupPlugin>} [pluginConf.plugins]
 *
 * @returns {PluginImpl}
 */
export default ({ config, pack = false, unpack = false}) => getPlugin(config, pack, unpack) 

function getPlugin(config, pack, unpack) {
  const api = {
    ranOnce: {
      pack: false,
      unpack: false,
    },
    pack,
    unpack,
    emptyId: "no-input-database",
  }
  return {
    name: "rollup-plugin-badger-foundry",
    api,
    watch: false,
    options(opts) {
      if (opts.input.length == 0) opts.input.push(api.emptyId);
      return opts;
    },
    buildStart() {
      this.emitFile({
        id: api.emptyId,
        fileName: api.emptyId,
        type: 'chunk',
      })
    },
    resolveId(source) {
      return source === api.emptyId ? `\0${api.emptyId}` : null;
    },
    load(id) {
      return id.includes(api.emptyId) ? "export const empty = true;" : null;
    },
    async generateBundle(_, bundle) {
      for (const key of Reflect.ownKeys(bundle)) {
        if (String(key).includes(api.emptyId)) {
          delete bundle[key];
        }
      }

      if (!api.ranOnce.pack && api.pack) {
        for (const packInfo of config.cache.manifest.packs) {
          const source = path.join(config.profile.src, packInfo.path);
          const dest = path.join(config.profile.dest, packInfo.path);
          console.log(`Packing: ${packInfo.label} (${packInfo.path})`);
          await ldb.pack(source, dest);
        }
        api.ranOnce.pack = true;
      }
    },
    async buildStart() {
      if (!api.ranOnce.unpack && api.unpack) {
        for (const packInfo of config.cache.manifest.packs) {
          const source = path.join(config.profile.src, packInfo.path);
          const dest = path.join(config.profile.dest, packInfo.path);
          console.log(`Unpacking: ${packInfo.label} (${packInfo.path})`);
          await ldb.unpack(dest, source);
        }

        api.ranOnce.unpack = true;
      }
    },
  }
}
