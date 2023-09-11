import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';

import {ClassicLevel} from "classic-level";

function ensureDir(folderPath) {
  if (fs.existsSync(folderPath)) {
    return;
  }

  return fs.mkdirSync(folderPath, {recursive: true});
}

/**
 * Replace all non-alphanumeric characters with an underscore in a filename
 * @param {string} filename         The filename to sanitize
 * @returns {string}                The sanitized filename
 */
export function getSafeFilename(filename) {
  return filename.replace(/[^a-zA-Z0-9]/g, '_');
}

/**
 * Read serialized files from a directory and write them to a pack db
 * @param {string} packDir        The directory path to the pack
 * @param {string} inputDir       The directory path to read the serialized files from
 * @returns {Promise<void>}
 * @private
 */
const packClassicLevel = async (packDir, inputDir) => {
  // Load the directory as a ClassicLevel db
  const db = new ClassicLevel(packDir, {keyEncoding: "utf8", valueEncoding: "json"});
  const batch = db.batch();

  // Iterate over all YAML files in the input directory, writing them to the db
  const files = fs.readdirSync(inputDir);
  const seenKeys = new Set();
  for ( const file of files ) {
    const fileContents = fs.readFileSync(path.join(inputDir, file));
    const value = file.endsWith(".yml") ? yaml.load(fileContents) : JSON.parse(fileContents);
    const key = value._key;
    delete value._key;
    seenKeys.add(key);
    batch.put(key, value);
    console.log(`Packed "${value.name ?? ""}" as [${value._id}] `);
  }

  // Remove any entries in the db that are not in the input directory
  for ( const key of await db.keys().all() ) {
    if ( !seenKeys.has(key) ) {
      batch.del(key);
      console.log(`Removed ${key}`);
    }
  }
  await batch.write();

  if (seenKeys.size) {
    await compactClassicLevel(db);
  }

  await db.close();
}

/**
 * Load a pack from a directory and serialize the DB entries, each to their own file
 * @param {string} packDir          The directory path to the pack
 * @param {string} outputDir        The directory path to write the serialized files
 * @param {Object} options          The command line arguments
 * @returns {Promise<void>}
 * @private
 */
const unpackClassicLevel = async (packDir, outputDir, {format}) => {
  // Load the directory as a ClassicLevel db
  const db = new ClassicLevel(packDir, {keyEncoding: "utf8", valueEncoding: "json"});

  // Iterate over all entries in the db, writing them as individual YAML files
  for await (const [key, value] of db.iterator()) {
    const name = value.name ? `${getSafeFilename(value.name)}_${value._id}` : key;
    value._key = key;
    const fileName = path.join(outputDir, `${name}.${format}`);

    const writer = {
      'yml': () => fs.writeFileSync(fileName, yaml.dump(value)),
      'json': () => fs.writeFileSync(fileName, JSON.stringify(value, null, 2)),
    }[format];

    try {
      writer();
      console.log(`Unpacked [${key}] as "${fileName}"`);
    } catch (err) {
      console.error(`Error: Unpacking - failed to write ${fileName}`);
      console.error(err);
      await db.close()
      return;
    }
  }

  await db.close();
}

export const pack = async (folder, {output}) => {
  const inputValid = fs.existsSync(folder);
  if(!inputValid) {
    console.log(`Error: Could not locate input data folder at ${folder}`);
    return -1;
  }

  output = path.join(output, path.basename(folder));
  ensureDir(output);

  await packClassicLevel(output, folder);
}

const supportedFormat = (format) => {
  const shortExt = {
    'json': 'json',
    'yml': 'yml',
    'yaml': 'yml',
  }[format]

  return ['yml','json'].includes(shortExt);
}

export const unpack = async (folder, {format, output}) => {
  if(!supportedFormat(format)) {
    console.log(`Error: Cannot unpack to target extension ${format}`);
    return;
  }
  const inputValid = fs.existsSync(folder);
  if(!inputValid) {
    console.log(`Error: Could not locate input DB at ${folder}`);
  }

  output = path.join(output, path.basename(folder));
  ensureDir(output);

  await unpackClassicLevel(folder, output, {format});

}

/**
 * Flushes the log of the given database to create compressed binary tables.
 * @param {ClassicLevel} db The database to compress.
 * @returns {Promise<void>}
 * @private
 */
async function compactClassicLevel(db) {
  const forwardIterator = db.keys({ limit: 1, fillCache: false });
  const firstKey = await forwardIterator.next();
  await forwardIterator.close();

  const backwardIterator = db.keys({ limit: 1, fillCache: false });
  const lastKey = await backwardIterator.next();
  await backwardIterator.close();

  if (firstKey && lastKey) {
    return db.compactRange(firstKey, lastKey, { keyEncoding: "utf8" });
  }
}
