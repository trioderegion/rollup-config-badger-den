import commonjs from "@rollup/plugin-commonjs";
/******************
 * Pre-configured badger den plugin
 ******************/
import BDConfig from "./Manifest.mjs";
import badgerDen from "./den.config.mjs";

export default () => {
 
  const config = new BDConfig(process.env.TARGET);
  
  // Shortcuts
  console.log(`Building with environment: ${process.env.TARGET}`);
  console.log("Source: ", config.profile.src);
  console.log("Target: ", config.profile.dest);

  return [
    {
      output: {
        dir: config.profile.dest,
      },
      plugins: [
        badgerDen({
          config,
          plugins: {
            compress: true,
            scss: true,
          }
        }),
        commonjs(),
      ],
    },
  ];
};
