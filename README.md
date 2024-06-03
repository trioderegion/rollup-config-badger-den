<p align="center">
  <img src="https://storage.googleapis.com/badgerwerks/branding/badger-den-badge-sm.webp" title="Badger Den badge">
</p>

## What is the Badger Den?
A configurable Rollup plugin designed for easy bundling and packaging of FoundryVTT modules. Built with flexibility in mind -- let the Badger Den make your life easier.

## Why Use the Badger Den?

### Rapid Development
Using Rollup's `watch` mode and FoundryVTT's "hot module reload" system allows for more time coding and styling, and less time creating builds and reloading. Note, JS files are not currently compatible with FVTT's default HMR system, but are watched, re-bundled on change, and latched by Foundry on a browser refresh.

### Multiple Build Profiles
Create different build configurations for various develeopment activities, such debug, test, and release; all using the same source code.  Include additional development or debug JS modules without worry of accidental inclusion in the release bundle.

### Compendium Extraction and Compilation
Manage compendium/database sources and optionally compile to, or extract from, human-readable source files and LevelDB/Foundry compatible compendium databases.

### Source Structure Flexibility
Your code; your rules. Between file discovery via `fast-glob` and Rollup's own magic, the Den is happy with whatever file structure you use.

### Stylesheet Bundling and Compilation
Supports Sass `scss` and standard `css` files with results bundled into a single css file, with appropriate module manifest entries. Simply `import` the stylesheet into your JS entry point, or any other relevant JS file. Dependent stylesheets will be automatically discovered and bundled as required.

### External Module Support
Include browser-compatible utilities or libraries sourced from NPM packages or third party sources easily and without hassle.

## Installation

```
npm init
npm install -D rollup-config-badger-den
```

## Setup
The primary component of using the Badger Den is the "bd" config file, which contains the information and configurations for producing the output module bundle.

### Den Config File
File location defines the module's root.
File name must end in `.bd.json`. If an `id` field is not provided in the file, the preceding base name of config file will be used.
  - E.g. `src/my-module.bd.json`


[See Den Config Definition](https://trioderegion.github.io/rollup-config-badger-den/global.html#DenConfigJSON) for full explation of each required and optional field in this file.

[Example Config File](https://github.com/trioderegion/rollup-config-badger-den/blob/master/src/demo-module/src/demo-module.bd.json)

### NPM Scripts
Executing the bundling/packaging process is most easily done via an entry in your package.json's `scripts` field.

For example:

`{"develop": "rollup -c node:rollup-config-badger-den --config-den src/my-module:dev"}`

Using the above, the build would be started with `npm run develop`, where `develop` is the name given to the script entry and `:dev` indicates to use the `dev` profile defined in the `my-module.bd.json` file located in the `src/` folder, which is the root of the module.

### Additional Arguments

`-w | --watch` Enable Rollup's watch mode, recompiling on changes.

`--config-pack [only]` Compile LevelDB compendiums during build. If `only` is used (e.g. `--config-pack only`), this bundling operation will _only_ pack the defined compendia paths, rather than both packing compendia and bundling module code. Note, due to optional `only` argument, `--config-pack/unpack` must be the last configuration argument provided to Rollup.

`--config-unpack [only]` Extract LevelDB binary compendiums to human-readable source files. See `--config-pack` for `only` usage notes.

These arguments can be added directly to the npm script entry, or passed along from the command line. Note, when passing via the command line, the arguments must be seperated by `--` from the rest of the npm script command, as seen in the example below.

`npm run develop -- -w --config-pack`


<p align="center">
  <img src="https://storage.googleapis.com/badgerwerks/branding/badgerwerks-badge-sm.webp" title="BadgerWerks badge">
  <br><em>Badger Den is a BadgerWerks production</em>
</p>
