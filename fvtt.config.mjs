import path from 'path';
import locale from 'locale-codes';
import {globSync as glob} from 'glob';

const makeEntryPointFields = (entryPoints) => {
  /* ES Modules */
  let esmodules = entryPoints.main ?? [];
  if(typeof esmodules == 'string') esmodules = [esmodules];
  esmodules = esmodules.flatMap( entry => glob(entry)
    .filter( fp => !!path.extname(fp) )
    .map( fp => path.relative('src/', fp)));

  /* Externals */
  let externals = entryPoints.external ?? [];
  if(typeof externals == 'string') externals = [externals];
  externals = externals.flatMap( entry => glob(entry)
    .filter( fp => !!path.extname(fp) )
    .map( fp => path.relative('src/', fp)));

  /* Compiled Styles */
  let styles = entryPoints.style ?? [];
  if(typeof styles == 'string') styles = [styles];
  styles = styles.flatMap( entry => glob(entry)
    .filter( fp => !!path.extname(fp) && path.parse(fp).base[0] != '_' )
    .map( fp => path.format({
      ...path.parse(path.relative('src/', fp)), 
      base: '',
      ext: '.css'
    })));
  
  /* Discovered Languages */
  let languages = entryPoints.lang ?? [];
  if(typeof languages == 'string') languages = [languages];
  languages = languages.flatMap( entry => {
    const files = glob(entry).filter( fp => !!path.extname(fp) );
    return files.map( filename => {
      if(path.extname(filename) == `.json`) {
        const lang = path.basename(filename, '.json');
        const name = locale.getByTag(lang).name;
        return {lang, name, path: path.relative('src/', filename)};
      }
      return null;
    }).filter( lang => !!lang );
  })
  console.log('Entry Points:', {esmodules, externals});
  console.log('Root Styles:', styles);
  console.log('Languages', languages);
  return {esmodules, styles, languages, externals};
}

const compat = ([min, curr, max]) => {
  const data = {};
  !!min ? data.minimum = min : null;
  !!curr ? data.verified = curr : null;
  !!max ? data.maximum = max : null;
  return data;
}

const makeDep = (deps) => Object.entries(deps).map( ([id, versions]) => ({id, compatibility: compat(versions)}) );

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
    return {
      "title": config.title,
      "id": config.id,
      ...makeEntryPointFields(config.entryPoints),
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
  

