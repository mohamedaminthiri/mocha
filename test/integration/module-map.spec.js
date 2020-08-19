'use strict';

const path = require('path');
const {ModuleMap, ModuleNode} = require('../../lib/cli/module-map');
const sinon = require('sinon');
const {absoluteFixturePath} = require('./helpers');

const TEST_MODULE_MAP_CACHE_FILENAME = 'module-map-integration-test.cache.json';
const TEST_FILE_ENTRY_CACHE_FILENAME = 'file-entry-integration-test.cache.json';
const CWD = path.join(__dirname, '..', '..');
const TEST_FIXTURE = absoluteFixturePath('options/watch/test-with-dependency');
const TEST_FIXTURE_DEP = absoluteFixturePath('options/watch/dependency');

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

  describe('initialization', function() {
    it('should populate the ModuleMap with all entry files and dependencies thereof', function() {
      const relativeJson = relativizeMap(moduleMap);

      // TODO: blast relativizeMap and use absoluteFixturePath()
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
      beforeEach(function() {
        sinon.spy(ModuleMap.prototype, '_populate');
      });

      it('should inspect all new entry files', function() {
        const someOtherFile = absoluteFixturePath(
          'options/watch/test-file-change'
        );
        const map2 = ModuleMap.create({
          entryFiles: [TEST_FIXTURE, someOtherFile]
        });
        expect(map2._populate, 'to have a call satisfying', [
          new Set([ModuleNode.create(someOtherFile)]),
          {force: true}
        ]);
      });

      describe('when an entry file has changed', function() {
        let someOtherFile;

        beforeEach(function() {
          someOtherFile = absoluteFixturePath('options/watch/test-file-change');
          sinon
            .stub(ModuleMap.prototype, 'getChangedFiles')
            .returns([TEST_FIXTURE, someOtherFile]);
        });

        it('should inspect all changed and new entry files', function() {
          const map2 = ModuleMap.create({
            entryFiles: [TEST_FIXTURE, someOtherFile]
          });
          expect(map2._populate, 'to have a call satisfying', [
            new Set([
              ModuleNode.create(someOtherFile),
              ModuleNode.create(TEST_FIXTURE, {
                children: new Set([
                  absoluteFixturePath('options/watch/dependency')
                ])
              })
            ]),
            {force: true}
          ]);
        });
      });

      describe('when a known dependency has changed', function() {
        beforeEach(function() {
          sinon
            .stub(ModuleMap.prototype, 'getChangedFiles')
            .returns([TEST_FIXTURE_DEP]);
        });

        it('should inspect all changed dependencies', function() {
          const map2 = ModuleMap.create({
            entryFiles: [TEST_FIXTURE]
          });
          expect(map2._populate, 'to have a call satisfying', [
            new Set([
              ModuleNode.create(TEST_FIXTURE_DEP, {
                entryFiles: new Set([TEST_FIXTURE]),
                parents: new Set([TEST_FIXTURE])
              })
            ]),
            {force: true}
          ]);
        });
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
          moduleMap.getAffectedFiles(absoluteFixturePath('options/watch/hook')),
          'to equal',
          new Set([])
        );
      });
    });
  });
});
