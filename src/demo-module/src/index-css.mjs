/* any scss files should be imported first */
import './css/style.css'

/* Using a wrapped export for externals keeps its source isolated */
import lib from './lib/index.mjs';

console.log('Hello World', lib.tiny('Hello World, But Tiny'));

/* can access any primitive value held in db.json configuration */
console.log(`%config.version%`);
