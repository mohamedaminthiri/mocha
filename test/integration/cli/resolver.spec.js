'use strict';

const {resolveDependencies} = require('../../../lib/cli/resolver');

describe('dependency resolution', function() {
  describe('when provided a list of globs to ignore', function() {
    it('should not return files matching the globs', function() {
      expect(
        [
          ...resolveDependencies(require.resolve('../../../lib/mocha'), {
            ignore: ['**/node_modules/**']
          })
        ],
        'to have items satisfying',
        expect.it('not to match', /node_modules/)
      );
    });
  });
});
