import fs from 'fs';
import path from 'path';
import locale from 'locale-codes';
/** @type {import('package.json').config} PackageConfig */

const entryPoints = (names, extension) => Object.entries(names).reduce( (acc, [output, input]) => {
        const ext = path.extname(input);
        ext.includes(extension) ? acc.push(output + '.' + extension) : null;
        return acc;
      }, [])

const compat = ([min, curr, max]) => {
  const data = {};
  !!min ? data.minimum = min : null;
  !!curr ? data.verified = curr : null;
  !!max ? data.maximum = max : null;
  return data;
}

const makeDep = (deps) => Object.entries(deps).map( ([id, versions]) => ({id, compatibility: compat(versions)}) );

const makeLangs = (inputDir, outputDir) => {
  const langEntries = []; 
  //console.log('make langs input:', inputDir, outputDir);
  if(inputDir == undefined) return langEntries;
  outputDir ??= path.basename(inputDir);

  const jsons = fs.readdirSync(inputDir);
  console.log('found langs', jsons);
  for ( const filename of jsons ) {
    if(path.extname(filename) == `.json`) {
      const lang = path.basename(filename, '.json');
      const name = locale.getByTag(lang).name;
      langEntries.push({lang, name, path: path.join(outputDir, filename)})
    }
  }
  return langEntries;
}

/**
 * Generate manifest data
 *
 * @param {PackageConfig} config
 * @returns 
 */
export default (config) => {

    config.entryPoints ??= {}
    config.dependencies ??= {};
    config.dependencies.core ??= [];
    config.dependencies.systems ??= {};
    config.dependencies.modules ??= {};
    //console.log(config);
    return {
      "title": config.title,
      "languages": makeLangs(config.directories.lang, 'static/lang'),
      "id": config.id,
      "esmodules": entryPoints(config.entryPoints, 'mjs'),
      "styles": entryPoints(config.entryPoints, 'css'),
      "compatibility": compat(config.dependencies.core),
      "relationships": {
        "systems": makeDep(config.dependencies.systems),
        "modules": makeDep(config.dependencies.modules),
      },
      "description": config.description,
      "version": config.version,
      "authors": config.authors,
      "url": config.projectUrl,
      "manifest": "",
      "download": ""
    }
};
  

