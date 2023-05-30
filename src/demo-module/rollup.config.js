/******************
 * Node imports
 ******************/
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/******************
 * Rollup plugin imports
 ******************/
import { string } from "rollup-plugin-string"; //allows loading strings as ES6 modules
import commonjs from "@rollup/plugin-commonjs";

/******************
 * Pre-configured badger den plugin
 ******************/
import badgerDen from "badger-den";

export default () => {
  /* Some contexts do not forward these
   * system symbols, define them ourself
   */
  const _filename = fileURLToPath(import.meta.url);
  const _dirname = path.dirname(_filename);

  const [bdPath = null, profileName = null] = (process.env.TARGET ?? "").split(
    ":"
  );

  if (!(bdPath && profileName)) {
    throw new Error(`${bdPath}:${profileName} den profile cannot be parsed.`);
  }

  const packageId = path.basename(bdPath);

  /* load package config */
  const configPath = path.join(_dirname, bdPath + ".bd.json");
  const config = JSON.parse(fs.readFileSync(configPath));
  config.id ??= packageId;

  /* latch desired profile */
  const profile = config.build[profileName];
  profile.dest ??= path.resolve(_dirname, `dist`);

  // Sanity check to make sure parent directory of the module (i.e. DEN_DEPLOY_PATH) exists.
  if (!fs.existsSync(profile.dest)) {
    throw new Error(
      `${config.id}/${profileName} destination path does not exist: ${profile.dest}`
    );
  }

  profile.dest = path.join(profile.dest, packageId);
  profile.src = path.dirname(configPath);

  // Shortcuts
  console.log(`Building with environment: ${process.env.TARGET}`);
  console.log("Source: ", profile.src);
  console.log("Target: ", profile.dest);

  return [
    {
      output: {
        dir: profile.dest,
      },
      plugins: [
        badgerDen({
          config,
          profile,
        }),
        string({ include: ["**/*.css", "**/*.html"] }),
        commonjs(),
      ],
    },
  ];
};
