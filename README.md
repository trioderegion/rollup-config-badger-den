<p align="center">
  <img width="300" height="300" alt="badger-den-badge" src="https://github.com/user-attachments/assets/b4a08b1e-86d2-4332-9136-9078f968c92c" />

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
Your code; your rules. Between file discovery via `glob` and Rollup's own magic, the Den is happy with whatever file structure you use.

### Stylesheet Bundling and Compilation
Supports Sass (`scss`), Less (`less`), and standard CSS (`css`) files with results bundled into a single css file and appropriate module manifest entries. Simply `import` the stylesheet into your JS entry point, or any other relevant JS file. Dependent stylesheets will be automatically discovered and bundled as required. Badger Den supports mixed style languages and resolves based on extension (note, Sass files should use `.scss` extension).

### External Module Support
Include browser-compatible utilities or libraries sourced from NPM packages or third party sources easily and without hassle.

### Distribution Package Creation
Automatically modify resulting manifest and create distributable zip file for installation via Foundry's package manager, eliminating the need for complex build and file substitution workflows. Bundle code and styles, pack compendium databases, define release version, and produce final distribution package (zip and manifest) in a single step! You can find an example workflow file for GitHub Actions [here](https://github.com/trioderegion/rollup-config-badger-den/blob/master/.github/workflows/example-release-gh-workflow.yml)

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

These arguments can be added directly to the npm script entry, or passed along from the command line. Note, when passing via the command line, the arguments must be seperated by `--` from the rest of the npm script command, as seen in the example below.

`npm run develop -- -w --config-pack`
`npm run release -- --config-pack --config-version "1.0"`

#### Rollup Options

`-w | --watch` Enable Rollup's watch mode, recompiling on changes.

#### Compendium Options

`--config-pack [only]` Compile LevelDB compendiums during build. If `only` is used (e.g. `--config-pack only`), this bundling operation will _only_ pack the defined compendia paths, rather than both packing compendia and bundling module code. Note, due to optional `only` argument, `--config-pack/unpack` must be the last configuration argument provided to Rollup.

`--config-unpack [only]` Extract LevelDB binary compendiums to human-readable source files. See `--config-pack` for `only` usage notes.

#### Other Options

`--config-version "[string]"` Set the version of the resulting bundle. This overrides any entries in the DenConfigJSON and useful for automated build workflows.
