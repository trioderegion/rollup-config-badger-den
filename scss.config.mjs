import scss from 'rollup-plugin-scss';
import postcss from 'postcss'
import autoprefixer     from 'autoprefixer';             // Adds vendor specific extensions to CSS
import postcssPresetEnv from 'postcss-preset-env';       // Popular postcss plugin for next gen CSS usage.
import {packageWatcher as pkg} from './fvtt.plugs.mjs'

//TODO capture as list
const entry = pkg().raw.config.entryPoints.style;
const output = 'style.css';

export default ({createSourceMap, watchList = [], postcssPlugs = [], ...rest}) => 
  scss({
    processor: () => postcss([autoprefixer(), postcssPresetEnv(), ...postcssPlugs]),
    outputStyle: 'compressed',
    fileName: output,
    sourceMap: createSourceMap,
    watch: watchList,
    ...rest
  })
