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
      ModuleMap = rewiremock.proxy(
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
      ).ModuleMap;
      sinon.stub(ModuleMap.prototype, 'cwd').get(() => CWD);
    });

    describe('constructor', function() {
      beforeEach(function() {
        sinon.stub(ModuleMap.prototype, '_init');
        sinon.stub(ModuleMap.prototype, 'getModuleMapCache');
        sinon.stub(ModuleMap.prototype, 'getFileEntryCache');
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
        sinon.stub(ModuleMap.prototype, 'getChangedFiles').returns([]);
        sinon.stub(ModuleMap.prototype, '_populate');
        sinon.stub(ModuleMap.prototype, 'save');
      });

      describe('_init()', function() {
        beforeEach(function() {
          sinon.stub(ModuleMap.prototype, 'sync');
          moduleMap = new ModuleMap({
            entryFiles: [__filename]
          });
        });

        describe('if already initialized', function() {
          it('should throw', function() {
            expect(() => moduleMap._init(), 'to throw');
          });
        });

        it('should clear and load from map', function() {
          expect(moduleMap.sync, 'to have a call satisfying', [
            {destructive: true}
          ]);
        });

        it('should look for known changed files', function() {
          expect(moduleMap.getChangedFiles, 'was called once');
        });

        it('should populate starting from entry nodes', function() {
          expect(moduleMap._populate, 'to have a call satisfying', [
            new Set([__filename]),
            {force: true}
          ]);
        });

        it('should persist the caches', function() {
          expect(moduleMap.save, 'was called once');
        });
      });
    });
  });
});
