'use strict';

const rewiremock = require('rewiremock/node');
const sinon = require('sinon');
const path = require('path');

const CWD = path.join(__dirname, '..', '..', '..');

describe('module-map', function() {
  afterEach(function() {
    sinon.restore();
  });

  describe('class ModuleMap', function() {
    let stubs;
    let mocks;
    let moduleMap;
    let ModuleMap;
    let ModuleNode;

    beforeEach(function() {
      mocks = {
        FileEntryCache: {
          destroy: sinon.stub(),
          getUpdatedFiles: sinon.stub(),
          reconcile: sinon.stub(),
          hasFileChanged: sinon.stub().returns(true)
        },
        Cache: {
          all: sinon.stub().returns({}),
          save: sinon.stub(),
          destroy: sinon.stub(),
          setKey: sinon.stub()
        }
      };
      stubs = {
        'find-cache-dir': sinon.stub().returns(''),
        'file-entry-cache': {
          create: sinon.stub().returns(mocks.FileEntryCache)
        },
        'flat-cache': {
          create: sinon.stub().returns(mocks.Cache)
        },
        precinct: {
          paperwork: sinon.stub()
        },
        'filing-cabinet': sinon.stub()
      };
      const moduleMapModule = rewiremock.proxy(
        () => require('../../../lib/cli/module-map'),
        r => ({
          'file-entry-cache': r
            .with(stubs['file-entry-cache'])
            .directChildOnly(),
          'flat-cache': r.with(stubs['flat-cache']).directChildOnly(),
          precinct: r.with(stubs.precinct).directChildOnly(),
          'filing-cabinet': r
            .by(() => stubs['filing-cabinet'])
            .directChildOnly(),
          'find-cache-dir': r
            .by(() => stubs['find-cache-dir'])
            .directChildOnly()
        })
      );
      ModuleMap = moduleMapModule.ModuleMap;
      ModuleNode = moduleMapModule.ModuleNode;
      sinon.stub(ModuleMap.prototype, 'cwd').get(() => CWD);
    });

    describe('constructor', function() {
      beforeEach(function() {
        sinon.stub(ModuleMap.prototype, '_init');
        sinon.stub(ModuleMap.prototype, 'createModuleMapCache');
        sinon.stub(ModuleMap.prototype, 'createFileEntryCache');
        moduleMap = new ModuleMap({
          entryFiles: [__filename]
        });
      });

      it('should initialize', function() {
        expect(moduleMap._init, 'was called once');
      });
    });

    describe('instance method', function() {
      beforeEach(function() {
        sinon.stub(ModuleMap.prototype, 'findDependencies').returns([]);
        sinon.stub(ModuleMap.prototype, '_getChangedFiles');
        sinon.stub(ModuleMap.prototype, '_populate');
        sinon.stub(ModuleMap.prototype, 'save');
      });

      describe('_init()', function() {
        beforeEach(function() {
          sinon.stub(ModuleNode, 'create').returns({some: 'node'});
          sinon.stub(ModuleMap.prototype, 'mergeFromCache');
        });

        describe('when already initialized', function() {
          beforeEach(function() {
            ModuleMap.prototype._getChangedFiles.returns([]);
            moduleMap = ModuleMap.create({
              entryFiles: [__filename]
            });
          });

          it('should throw', function() {
            expect(() => moduleMap._init(), 'to throw');
          });
        });

        describe('when entry files have changed', function() {
          beforeEach(function() {
            ModuleMap.prototype._getChangedFiles.returns([__filename]);
            moduleMap = ModuleMap.create({
              entryFiles: [__filename]
            });
          });
          it('should clear and load from map', function() {
            expect(moduleMap.mergeFromCache, 'to have a call satisfying', [
              {destructive: true}
            ]);
          });

          it('should look for known changed files', function() {
            expect(moduleMap._getChangedFiles, 'was called once');
          });

          it('should populate starting from entry files', function() {
            expect(moduleMap._populate, 'to have a call satisfying', [
              new Set([{some: 'node'}]),
              {force: true}
            ]);
          });

          it('should persist the caches', function() {
            expect(moduleMap.save, 'was called once');
          });
        });

        describe('when entry node and no other files have changed', function() {
          beforeEach(function() {
            ModuleMap.prototype._getChangedFiles.returns([]);
            moduleMap = ModuleMap.create({
              entryFiles: [__filename]
            });
          });

          it('should not populate anything', function() {
            expect(moduleMap._populate, 'was not called');
          });
        });
      });
    });

    describe('computed properties', function() {
      beforeEach(function() {
        sinon.stub(ModuleMap.prototype, '_init');
        moduleMap = new ModuleMap({
          entryFiles: [__filename, '/some/other/path.js']
        });
      });

      describe('entryDirs', function() {
        it('should return a set of all directories in which entry files live', function() {
          expect(
            moduleMap.entryDirs,
            'to equal',
            new Set([path.dirname(__filename), '/some/other'])
          );
        });
      });
    });
  });
});
