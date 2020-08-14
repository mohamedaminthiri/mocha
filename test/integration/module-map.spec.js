'use strict';

const path = require('path');
const {ModuleMap, ModuleNode} = require('../../lib/cli/module-map');
const sinon = require('sinon');

const TEST_MODULE_MAP_CACHE_FILENAME = 'module-map-integration-test.cache.json';
const TEST_FILE_ENTRY_CACHE_FILENAME = 'file-entry-integration-test.cache.json';
const CWD = path.join(__dirname, '..', '..');
const TEST_FIXTURE = require.resolve(
  './fixtures/options/watch/test-with-dependency.fixture.js'
);
const TEST_FIXTURE_DEP = require.resolve(
  './fixtures/options/watch/dependency.fixture.js'
);

/**
 * Returns a canonical plain object representation of a `ModuleMap`
 * w/ relative filepaths for easier comparison
 * @param {ModuleMap} map
 * @returns {Object}
 */
const relativizeMap = map => {
  const relativizeProp = (obj, prop) =>
    obj[prop].map(filepath =>
      path.relative(CWD, filepath).replace(/^instrumented\//, '')
    );
  const json = map.toJSON();
  return Object.keys(json).reduce((acc, key) => {
    const newKey = path.relative(CWD, key).replace(/^instrumented\//, '');
    const value = json[key];
    value.filename = newKey; // filename is the same as newKey
    value.parents = relativizeProp(value, 'parents');
    value.children = relativizeProp(value, 'children');
    value.entryFiles = relativizeProp(value, 'entryFiles');
    acc[newKey] = json[key];
    return acc;
  }, {});
};

describe('module-map', function() {
  describe('instance method', function() {
    let moduleMap;

    beforeEach(function() {
      sinon
        .stub(ModuleMap.prototype, 'fileEntryCacheFilename')
        .get(() => TEST_FILE_ENTRY_CACHE_FILENAME);
      sinon
        .stub(ModuleMap.prototype, 'moduleMapCacheFilename')
        .get(() => TEST_MODULE_MAP_CACHE_FILENAME);

      moduleMap = ModuleMap.create({
        entryFiles: [TEST_FIXTURE],
        reset: true
      });
    });

    afterEach(function() {
      sinon.restore();
    });

    describe('init()', function() {
      it('should populate the ModuleMap with all entry files and dependencies thereof', function() {
        const relativeJson = relativizeMap(moduleMap);

        // this would benefit from a snapshot test
        expect(relativeJson, 'to equal', {
          'test/integration/fixtures/options/watch/test-with-dependency.fixture.js': {
            filename:
              'test/integration/fixtures/options/watch/test-with-dependency.fixture.js',
            entryFiles: [],
            children: [
              'test/integration/fixtures/options/watch/dependency.fixture.js'
            ],
            parents: []
          },
          'test/integration/fixtures/options/watch/dependency.fixture.js': {
            filename:
              'test/integration/fixtures/options/watch/dependency.fixture.js',
            entryFiles: [
              'test/integration/fixtures/options/watch/test-with-dependency.fixture.js'
            ],
            children: [],
            parents: [
              'test/integration/fixtures/options/watch/test-with-dependency.fixture.js'
            ]
          }
        });
      });

      describe('when reloading', function() {
        it('should inspect all files', function() {
          sinon.spy(ModuleMap.prototype, '_populate');
          const map2 = new ModuleMap({
            entryFiles: [
              TEST_FIXTURE,
              require.resolve(
                './fixtures/options/watch/test-file-change.fixture.js'
              )
            ]
          });
          expect(map2._populate, 'to have a call satisfying', [
            [
              new ModuleNode(
                require.resolve(
                  './fixtures/options/watch/test-file-change.fixture.js'
                )
              ),
              new ModuleNode(TEST_FIXTURE)
            ],
            {force: true}
          ]);
        });
      });
    });

    describe('sync()', function() {
      describe('when run w/ option `destructive = true`', function() {
        it('should obliterate anything missing from cache', function() {
          moduleMap.set('/some/file', ModuleNode.create('/some/file'));
          moduleMap.sync({destructive: true});
          expect(moduleMap, 'not to have key', '/some/file');
        });
      });

      describe('when run w/o options', function() {
        it('should merge the cache with the ModuleMap', function() {
          moduleMap.set('/some/file', ModuleNode.create('/some/file'));
          moduleMap.sync();
          expect(moduleMap, 'to have key', '/some/file');
        });
      });
    });

    describe('getModuleMapCache()', function() {
      describe('when run w/o options', function() {
        it('should return a non-empty flat cache object', function() {
          expect(moduleMap.getModuleMapCache().all(), 'to have keys', [
            ...moduleMap.files
          ]);
        });
      });

      describe('when run w/ option `reset = true`', function() {
        let cache;

        beforeEach(function() {
          cache = moduleMap.getModuleMapCache({reset: true});
        });
        it('should destroy the cache', function() {
          expect(cache.all(), 'to equal', {});
        });

        it('should persist', function() {
          expect(moduleMap.getModuleMapCache().all(), 'to equal', {});
        });
      });
    });

    describe('getFileEntryCache()', function() {
      describe('when run w/o options', function() {
        it('should return a non-empty flat cache object', function() {
          expect(moduleMap.getFileEntryCache().cache.all(), 'to have keys', [
            ...moduleMap.files
          ]);
        });
      });

      describe('when run w/ option `reset = true`', function() {
        let cache;

        beforeEach(function() {
          cache = moduleMap.getFileEntryCache({reset: true});
        });

        it('should destroy the cache', function() {
          expect(cache.cache.all(), 'to equal', {});
        });

        it('should persist', function() {
          expect(moduleMap.getFileEntryCache().cache.all(), 'to equal', {});
        });
      });
    });

    describe('getAffectedFiles()', function() {
      describe('when given a direct dependency of an entry (test) file', function() {
        it('should return a list of test files to re-run', function() {
          expect(
            moduleMap.getAffectedFiles(TEST_FIXTURE_DEP),
            'to equal',
            new Set([TEST_FIXTURE])
          );
        });
      });

      describe('when given an entry file', function() {
        it('should return a list of entry files', function() {
          expect(
            moduleMap.getAffectedFiles(TEST_FIXTURE),
            'to equal',
            new Set([TEST_FIXTURE])
          );
        });
      });

      describe('when given a previously-unknown file', function() {
        it('should return nothing', function() {
          expect(
            moduleMap.getAffectedFiles(
              require.resolve('./fixtures/options/watch/hook.fixture.js')
            ),
            'to equal',
            new Set([])
          );
        });
      });
    });
  });
});
