'use strict';

const {paperwork} = require('precinct');
const cabinet = require('filing-cabinet');
const path = require('path');
const multimatch = require('multimatch');
const debug = require('debug')('mocha:cli:resolver');

exports.resolveDependencies = (
  filename,
  {cwd = process.cwd(), tsConfig, ignore = []} = {}
) => {
  const partials = paperwork(filename, {includeCore: false});
  debug('found partials in %s: %o', filename, partials);
  const deps = new Set(
    partials.map(partial => {
      const result = cabinet({
        partial,
        filename,
        directory: cwd,
        tsConfig: tsConfig || path.join(cwd, 'tsconfig.json')
      });
      debug('cabinet found for %s: %o', partial, result);
      return result;
    })
  );
  // remove stuff matching ignored globs from the list.
  // there is probably a more efficient way to do this.
  // "PR's accepted!"
  multimatch(deps, ignore).forEach(ignored => {
    deps.delete(ignored);
  });
  return deps;
};
