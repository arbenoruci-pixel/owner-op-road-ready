import {load as loadJsx} from '../test-jsx-loader.mjs';

export function load(url, context, nextLoad) {
  if (url.endsWith('.css')) {
    return {format: 'module', source: 'export default {};', shortCircuit: true};
  }
  return loadJsx(url, context, nextLoad);
}
