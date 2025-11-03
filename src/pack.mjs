import fs from 'fs';
import {extractPack, compilePack } from '@foundryvtt/foundryvtt-cli'

export const pack = async (folder, output, options = {}) => {
  const inputValid = fs.existsSync(folder);
  if(!inputValid) {
    console.log(`Error: Could not locate input data folder at ${folder}`);
    return -1;
  }

  await compilePack(folder, output, options);
}

export const unpack = async (folder, output, options = {}) => {

  const inputValid = fs.existsSync(folder);
  if(!inputValid) {
    console.log(`Error: Could not locate input DB at ${folder}`);
  }

  await extractPack(folder, output, options)
}

export default {
  pack,
  unpack,
}
