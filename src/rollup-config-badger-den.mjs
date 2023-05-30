import loader from "./Manifest.mjs";
import bdPlug from "./rollup-plugin-badger-den.mjs";
import commonjs from "@rollup/plugin-commonjs";

const bdRollupConfig = ({denConfig = null, denPlug = null} = {}) => {

  if (typeof denConfig == 'string') {
    /* Assume this is a raw config path and load it */    
    denConfig = new loader(denConfig);
  }
  denPlug ??= bdPlug;

  console.log("BadgerDen Workflow    : ", `${denConfig.config.id}:${denConfig.profile.name}`);
  console.log("BadgerDen Source      : ", denConfig.profile.src);
  console.log("BadgerDen Destination : ", denConfig.profile.dest);
  
  return [{
    output: {
      entryFileNames: "[name]",
      dir: denConfig.profile.dest,
      format: "es",
      globals: {
        jquery: "$",
      },
      sourcemap: denConfig.profile.sourcemaps,
      sourcemapPathTransform: (
        sourcePath //TODO need to revisit
      ) => sourcePath.replace(import.meta.url, "."),
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
