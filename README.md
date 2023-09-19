## Getting Started
### Den Config File
File location defines the module's root.
File name must end in `.bd.json`. If an `id` field is not provided in the file, the preceding base name of config file will be used.
  - E.g. `src/my-module.bd.json`


[See Den Config Definition](https://trioderegion.github.io/rollup-config-badger-den/docs/global.html#DenConfigJSON) for full explation of each required and optional field in this file.

[Example Config File](https://trioderegion.github.io/rollup-config-badger-den/global.html#DenProfileJSON)

### NPM Scripts
`rollup -c node:rollup-config-badger-den --config-den src/my-module:dev`

In the above example `:dev` indicates to use the `dev` profile defined in the `my-module.bd.json` file located in the `src/` folder, which is the root of the module.
