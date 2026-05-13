/** @typedef {import('rollup').Plugin} RollupPlugin */
/** @typedef {import('rollup').PluginImpl} PluginImpl */

import path from "path";
import fs from 'fs';
import {compilePack, extractPack} from '@foundryvtt/foundryvtt-cli'

const compile = async (folder, output, options = {}) => {
  const inputValid = fs.existsSync(folder);
  if(!inputValid) {
    console.log(`Error: Could not locate input data folder at ${folder}`);
    return -1;
  }

  await compilePack(folder, output, options);
}

const extract = async (folder, output, options = {}) => {

  const inputValid = fs.existsSync(folder);
  if(!inputValid) {
    console.log(`Error: Could not locate input DB at ${folder}`);
    return -1;
  }

  await extractPack(folder, output, options)
}

const logKey = (doc) => { console.log(doc._key) }

const idReplace = (doc, fromId, toId) => {
  Object.entries(doc).forEach( ([key, val]) => {
    const str = JSON.stringify(val);
    const repl = str.replaceAll(fromId, toId);
    const replObj = JSON.parse(repl);
    doc[key] = replObj;
  });
}

const packTransformer = (manifest, fromId, toId) => {
  return (doc) => {

    /* block all docs from this pack */
    if (!manifest) return false;
    
    /* allow only those found in the manifest */
    if (manifest !== true) {
      if (!(doc._id in manifest)) return false;

      for (const [collection, ids] of Object.entries(manifest[doc._id])) {
        if (ids.length == 0) {
          //console.log('removing all embedded documents under ' + collection + ' for ' + doc.name);
          delete doc[collection];
        }
        else {
          doc[collection] = doc[collection].filter( embed => ids.includes(embed._id) ); 
        }
      }
    }

    /* id swap */
    if (fromId && toId) idReplace(doc, fromId, toId);
  }
}

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
        api.ranOnce.pack = true;

        for (const packInfo of config.cache.manifest.packs) {
          const source = path.join(config.profile.src, packInfo.path);
          const dest = path.join(config.profile.dest, packInfo.path);
          console.log(`Packing: ${packInfo.label} (${packInfo.path})`);

          const manifest = config.config.entryPoints.compendia.manifest ?? {[packInfo.name] :true};
          const transform = packTransformer(manifest[packInfo.name], config.config.pid, config.config.id); 
          //console.log(manifest, config.config.pid, config.config.id);
          config.cache.dbOptions.pack.transformEntry = transform;

          await compile(source, dest, config.cache.dbOptions.pack);
        }
      }
    },
    async buildStart() {
      
      if (!api.ranOnce.unpack && api.unpack) {
        api.ranOnce.unpack = true;
        
        if (config.config.pid?.length) {
          console.log(`Cannot unpack variant module data - Skipping...`);
          return;
        }

        for (const packInfo of config.cache.manifest.packs) {
          const source = path.join(config.profile.src, packInfo.path);
          const dest = path.join(config.profile.dest, packInfo.path);
          console.log(`Unpacking: ${packInfo.label} (${packInfo.path})`);
          await extract(dest, source, config.cache.dbOptions.unpack);
        }

      }
    },
  }
}
