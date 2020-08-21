'use strict';

const debug = require('debug')('mocha:cli:watch');
const path = require('path');
const chokidar = require('chokidar');
const Context = require('../context');
const collectFiles = require('./collect-files');
const {ModuleMap, CACHE_DIR_PATH} = require('./module-map');
const parents = require('parents');
const {Rerunner} = require('./rerunner');

/**
 * Exports the `watchRun` function that runs mocha in "watch" mode.
 * @see module:lib/cli/run-helpers
 * @module
 * @private
 */

/**
 * Run Mocha in parallel "watch" mode
 * @param {Mocha} mocha - Mocha instance
 * @param {Object} opts - Options
 * @param {string[]} [opts.watchFiles] - List of paths and patterns to
 *   watch. If not provided all files with an extension included in
 *   `fileCollectionParams.extension` are watched. See first argument of
 *   `chokidar.watch`.
 * @param {string[]} opts.watchIgnore - List of paths and patterns to
 *   exclude from watching. See `ignored` option of `chokidar`.
 * @param {FileCollectionOptions} fileCollectParams - Parameters that control test
 * @private
 */
exports.watchParallelRun = (
  mocha,
  {watchFiles, watchIgnore},
  fileCollectParams
) => {
  debug('creating parallel watcher');
  return createWatcher(mocha, {
    watchFiles,
    watchIgnore,
    beforeRun({mocha}) {
      // I don't know why we're cloning the root suite.
      const rootSuite = mocha.suite.clone();

      // this `require` is needed because the require cache has been cleared.  the dynamic
      // exports set via the below call to `mocha.ui()` won't work properly if a
      // test depends on this module (see `required-tokens.spec.js`).
      const Mocha = require('../mocha');

      // ... and now that we've gotten a new module, we need to use it again due
      // to `mocha.ui()` call
      const newMocha = new Mocha(mocha.options);
      // don't know why this is needed
      newMocha.suite = rootSuite;
      // nor this
      newMocha.suite.ctx = new Context();

      // reset the list of files
      newMocha.files = collectFiles(fileCollectParams);

      // because we've swapped out the root suite (see the `run` inner function
      // in `createRerunner`), we need to call `mocha.ui()` again to set up the context/globals.
      newMocha.ui(newMocha.options.ui);

      // we need to call `newMocha.rootHooks` to set up rootHooks for the new
      // suite
      newMocha.rootHooks(newMocha.options.rootHooks);

      // in parallel mode, the main Mocha process doesn't actually load the
      // files. this flag prevents `mocha.run()` from autoloading.
      newMocha.lazyLoadFiles(true);
      return newMocha;
    },
    fileCollectParams
  });
};

/**
 * Run Mocha in "watch" mode
 * @param {Mocha} mocha - Mocha instance
 * @param {Object} opts - Options
 * @param {string[]} [opts.watchFiles] - List of paths and patterns to
 *   watch. If not provided all files with an extension included in
 *   `fileCollectionParams.extension` are watched. See first argument of
 *   `chokidar.watch`.
 * @param {string[]} opts.watchIgnore - List of paths and patterns to
 *   exclude from watching. See `ignored` option of `chokidar`.
 * @param {FileCollectionOptions} fileCollectParams - Parameters that control test
 *   file collection. See `lib/cli/collect-files.js`.
 * @private
 */
exports.watchRun = (mocha, {watchFiles, watchIgnore}, fileCollectParams) => {
  debug('creating serial watcher');
  // list of all test files

  return createWatcher(mocha, {
    watchFiles,
    watchIgnore,
    beforeRun({mocha, filenames = []}) {
      // I don't know why we're cloning the root suite.
      const rootSuite = mocha.suite.clone();

      // this `require` is needed because the require cache has been cleared.  the dynamic
      // exports set via the below call to `mocha.ui()` won't work properly if a
      // test depends on this module (see `required-tokens.spec.js`).
      const Mocha = require('../mocha');

      // ... and now that we've gotten a new module, we need to use it again due
      // to `mocha.ui()` call
      const newMocha = new Mocha(mocha.options);
      // don't know why this is needed
      newMocha.suite = rootSuite;
      // nor this
      newMocha.suite.ctx = new Context();

      // reset the list of files
      newMocha.files = filenames.length
        ? filenames
        : collectFiles(fileCollectParams);
      debug('running mocha with files %o', newMocha.files);

      // because we've swapped out the root suite (see the `run` inner function
      // in `createRerunner`), we need to call `mocha.ui()` again to set up the context/globals.
      newMocha.ui(newMocha.options.ui);

      // we need to call `newMocha.rootHooks` to set up rootHooks for the new
      // suite
      newMocha.rootHooks(newMocha.options.rootHooks);

      return newMocha;
    },
    fileCollectParams
  });
};

/**
 * Bootstraps a chokidar watcher. Handles keyboard input & signals
 * @param {Mocha} mocha - Mocha instance
 * @param {Object} opts
 * @param {BeforeWatchRun} [opts.beforeRun] - Function to call before
 * `mocha.run()`
 * @param {string[]} [opts.watchFiles] - List of paths and patterns to watch. If
 *   not provided all files with an extension included in
 *   `fileCollectionParams.extension` are watched. See first argument of
 *   `chokidar.watch`.
 * @param {string[]} [opts.watchIgnore] - List of paths and patterns to exclude
 *   from watching. See `ignored` option of `chokidar`.
 * @param {FileCollectionOptions} opts.fileCollectParams - List of extensions to watch if `opts.watchFiles` is not given.
 * @returns {FSWatcher}
 * @ignore
 * @private
 */
const createWatcher = (
  mocha,
  {watchFiles = [], watchIgnore = [], beforeRun, fileCollectParams}
) => {
  watchIgnore = [...watchIgnore, CACHE_DIR_PATH];

  debug('ignoring files matching: %s', watchIgnore);

  const entryFiles = collectFiles(fileCollectParams);
  debug('entryFiles: %s', entryFiles);
  const cache = new ModuleMap({
    entryFiles,
    ignored: watchIgnore
  });

  let allWatched;
  if (watchFiles.length) {
    allWatched = watchFiles;
  } else {
    const allDirs = new Set(
      [...cache.files].map(filename => path.dirname(filename))
    );

    allWatched = new Set([...cache.files, ...allDirs]);
  }

  const watcher = chokidar.watch([...allWatched], {
    ignored: watchIgnore,
    ignoreInitial: true
  });

  const rerunner = Rerunner.create(mocha, watcher, {
    beforeRun
  });

  const findChangesAndRerun = filename => {
    if (watchFiles.length) {
      debug('re-running all tests due to presence of watched files list');
      rerunner.enqueue();
    } else {
      debug('computing changed tests from change to %s', filename);
      const allChangedKnownFiles = cache.getChangedFiles({
        knownChangedFiles: [filename]
      });
      if (allChangedKnownFiles.length) {
        const affectedFiles = cache.findAffectedFiles(allChangedKnownFiles);
        const affectedTests = cache.filterEntryFiles(affectedFiles);
        if (affectedTests.length) {
          debug('enqueing %o', affectedTests);
          rerunner.enqueue(affectedTests, affectedFiles);
        } else {
          debug(
            '%d files changed, but no tests were affected!',
            allChangedKnownFiles.length
          );
        }
      } else {
        debug(
          'file in watched directory changed (%s) but not consumed by any test file',
          filename
        );
      }
    }
  };

  watcher
    .on('ready', () => {
      // const watchedFiles = getWatchedFiles(watcher);
      // debug(watcher.getWatched());
      rerunner.run();
    })
    .on('all', (event, filename) => {
      if (watchFiles.length) {
        findChangesAndRerun();
        return;
      }
      debug('event [%s]: %s', event, filename);
      switch (event) {
        case 'add': {
          const dirpath = path.dirname(filename);
          const {entryDirs} = cache;
          if (
            entryDirs.has(dirpath) ||
            parents(dirpath).some(parent => entryDirs.has(parent))
          ) {
            cache.addEntryFile(filename);
            debug('added new entry file %s', filename);
          } else {
            debug('added %s, but is not a test file', filename);
          }
          break;
        }
        case 'change': {
          findChangesAndRerun(filename);
          break;
        }
      }
    });

  hideCursor();

  process
    .on('exit', () => {
      showCursor();
    })
    .on('SIGINT', () => {
      showCursor();
      cache.persistModuleMapCache();
      console.log('\n');
      process.exit(128 + 2);
    });

  // Keyboard shortcut for restarting when "rs\n" is typed (ala Nodemon)
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', data => {
    const str = data
      .toString()
      .trim()
      .toLowerCase();
    if (str === 'rs') rerunner.scheduleRun();
  });

  return watcher;
};

/**
 * Hide the cursor.
 * @ignore
 * @private
 */
const hideCursor = () => {
  process.stdout.write('\u001b[?25l');
};

/**
 * Show the cursor.
 * @ignore
 * @private
 */
const showCursor = () => {
  process.stdout.write('\u001b[?25h');
};
