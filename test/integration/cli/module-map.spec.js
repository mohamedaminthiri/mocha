'use strict';

const {ModuleMap, ModuleNode} = require('../../../lib/cli/module-map');
const sinon = require('sinon');
const {absoluteFixturePath} = require('../helpers');

const TEST_MODULE_MAP_CACHE_FILENAME = 'module-map-integration-test.cache.json';
const TEST_FILE_ENTRY_CACHE_FILENAME = 'file-entry-integration-test.cache.json';
const TEST_WITH_DEP_PATH = absoluteFixturePath(
  'options/watch/test-with-dependency'
);
const DEP_PATH = absoluteFixturePath('options/watch/dependency');
const TEST_WITH_TRANSITIVE_DEP_PATH = absoluteFixturePath(
  'options/watch/test-with-transitive-dep'
);
const TRANSITIVE_DEP_PATH = absoluteFixturePath('options/watch/transitive-dep');

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
      entryFiles: [TEST_WITH_DEP_PATH, TEST_WITH_TRANSITIVE_DEP_PATH],
      reset: true
    });
  });

  afterEach(function() {
    sinon.restore();
  });

  describe('initialization', function() {
    it('should populate the ModuleMap with all entry files and dependencies thereof', function() {
      expect(moduleMap, 'as JSON', 'to satisfy', {
        [TEST_WITH_DEP_PATH]: {
          filename: TEST_WITH_DEP_PATH,
          entryFiles: [],
          children: [DEP_PATH],
          parents: []
        },
        [TEST_WITH_TRANSITIVE_DEP_PATH]: {
          filename: TEST_WITH_TRANSITIVE_DEP_PATH,
          entryFiles: [],
          children: [TRANSITIVE_DEP_PATH],
          parents: []
        },
        [DEP_PATH]: {
          filename: DEP_PATH,
          entryFiles: [TEST_WITH_DEP_PATH, TEST_WITH_TRANSITIVE_DEP_PATH],
          children: [],
          parents: [TEST_WITH_DEP_PATH, TRANSITIVE_DEP_PATH]
        },
        [TRANSITIVE_DEP_PATH]: {
          filename: TRANSITIVE_DEP_PATH,
          entryFiles: [TEST_WITH_TRANSITIVE_DEP_PATH],
          children: [DEP_PATH],
          parents: [TEST_WITH_TRANSITIVE_DEP_PATH]
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
          entryFiles: [
            TEST_WITH_DEP_PATH,
            TEST_WITH_TRANSITIVE_DEP_PATH,
            someOtherFile
          ]
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
            .stub(ModuleMap.prototype, '_getChangedFiles')
            .returns([TEST_WITH_DEP_PATH, someOtherFile]);
        });

        it('should inspect all changed and new entry files', function() {
          const map2 = ModuleMap.create({
            entryFiles: [
              TEST_WITH_DEP_PATH,
              TEST_WITH_TRANSITIVE_DEP_PATH,
              someOtherFile
            ]
          });
          expect(map2._populate, 'to have a call satisfying', [
            new Set([
              ModuleNode.create(someOtherFile),
              ModuleNode.create(TEST_WITH_DEP_PATH, {
                children: new Set([DEP_PATH])
              })
            ]),
            {force: true}
          ]);
        });
      });

      describe('when a known dependency has changed', function() {
        beforeEach(function() {
          sinon
            .stub(ModuleMap.prototype, '_getChangedFiles')
            .returns([DEP_PATH]);
        });

        it('should inspect all changed dependencies', function() {
          const map2 = ModuleMap.create({
            entryFiles: [TEST_WITH_DEP_PATH, TEST_WITH_TRANSITIVE_DEP_PATH]
          });
          expect(map2._populate, 'to have a call satisfying', [
            new Set([
              ModuleNode.create(DEP_PATH, {
                entryFiles: new Set([
                  TEST_WITH_DEP_PATH,
                  TEST_WITH_TRANSITIVE_DEP_PATH
                ]),
                parents: new Set([TEST_WITH_DEP_PATH, TRANSITIVE_DEP_PATH])
              })
            ]),
            {force: true}
          ]);
        });
      });
    });
  });

  describe('merging from disk', function() {
    describe('when run w/ option `destructive = true`', function() {
      it('should overwrite the ModuleMap contents', function() {
        moduleMap.set('/some/file', ModuleNode.create('/some/file'));
        moduleMap.mergeFromCache({destructive: true});
        expect(moduleMap, 'not to have key', '/some/file').and(
          'to have key',
          TEST_WITH_DEP_PATH
        );
      });
    });

    describe('when run w/o options', function() {
      it('should merge into the ModuleMap contents', function() {
        moduleMap.set('/some/file', ModuleNode.create('/some/file'));
        moduleMap.mergeFromCache();
        console.error(moduleMap);
        expect(moduleMap, 'to have key', '/some/file').and(
          'to have key',
          TEST_WITH_DEP_PATH
        );
      });
    });
  });

  describe('module map cache creation', function() {
    it('should return a non-empty flat cache object', function() {
      expect(moduleMap.createModuleMapCache().all(), 'to have keys', [
        ...moduleMap.files
      ]);
    });

    // describe('when run w/ option `reset = true`', function() {
    //   let cache;

    //   beforeEach(function() {
    //     cache = moduleMap.createModuleMapCache({reset: true});
    //   });
    //   it('should destroy the cache', function() {
    //     expect(cache.all(), 'to equal', {});
    //   });

    //   it('should persist', function() {
    //     expect(moduleMap.createModuleMapCache().all(), 'to equal', {});
    //   });
    // });
  });

  describe('file entry cache creation', function() {
    it('should return a non-empty flat cache object', function() {
      expect(moduleMap.createFileEntryCache().cache.all(), 'to have keys', [
        ...moduleMap.files
      ]);
    });

    // describe('when run w/ option `reset = true`', function() {
    //   let cache;

    //   beforeEach(function() {
    //     cache = moduleMap.createFileEntryCache({reset: true});
    //   });

    //   it('should destroy the cache', function() {
    //     expect(cache.cache.all(), 'to equal', {});
    //   });

    //   it('should persist', function() {
    //     expect(moduleMap.createFileEntryCache().cache.all(), 'to equal', {});
    //   });
    // });
  });

  describe('module map cache destruction', function() {
    beforeEach(function() {
      moduleMap.resetModuleMapCache();
    });

    describe('when module map is reloaded', function() {
      it('should result in an empty module map', function() {
        const map2 = ModuleMap.create();
        expect(map2, 'to be empty');
      });
    });
  });

  describe('file entry cache destruction', function() {});

  describe('finding entry files affected by a file change', function() {
    describe('when a direct dependency of an entry file is known to have changed', function() {
      it('should return a list of test files to re-run', function() {
        expect(
          moduleMap.findAffectedFiles({
            markChangedFiles: [DEP_PATH]
          }),
          'to equal',
          {
            entryFiles: new Set([
              TEST_WITH_DEP_PATH,
              TEST_WITH_TRANSITIVE_DEP_PATH
            ]),
            allFiles: new Set([
              TEST_WITH_DEP_PATH,
              TEST_WITH_TRANSITIVE_DEP_PATH,
              TRANSITIVE_DEP_PATH,
              DEP_PATH
            ])
          }
        );
      });
    });

    describe('when an entry file itself is known to have changed', function() {
      it('should return a list of entry files', function() {
        expect(
          moduleMap.findAffectedFiles({
            markChangedFiles: [TEST_WITH_DEP_PATH]
          }),
          'to equal',
          {
            entryFiles: new Set([TEST_WITH_DEP_PATH]),
            allFiles: new Set([TEST_WITH_DEP_PATH])
          }
        );
      });
    });

    describe('when an entry file which depends on another entry file is known to have changed', function() {
      it('should return a list of entry files');
    });

    describe('when a previously-unknown file is known to have changed', function() {
      it('should return nothing', function() {
        expect(
          moduleMap.findAffectedFiles({
            markChangedFiles: [absoluteFixturePath('options/watch/hook')]
          }),
          'to equal',
          {entryFiles: new Set(), allFiles: new Set()}
        );
      });
    });
  });
});
