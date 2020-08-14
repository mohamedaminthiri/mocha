'use strict';

const setTimeout = global.setTimeout;
const debug = require('debug')('mocha:cli:rerunner');

/**
 * A class that calls `mocha.run()`. Owns a queue of files to run
 * @private
 */
class Rerunner {
  /**
   * Create an object that allows you to rerun tests on the mocha instance.
   *
   * @param {Mocha} mocha - Mocha instance
   * @param {FSWatcher} watcher - chokidar `FSWatcher` instance
   * @param {Object} [opts] - Options!
   * @param {BeforeWatchRun} [opts.beforeRun] - Function to call before `mocha.run()`
   */
  constructor(mocha, watcher, {beforeRun} = {}) {
    this.running = false;
    /**
     * @type {RunObject[]}
     */
    this.queue = [];
    this.mocha = mocha;
    this.watcher = watcher;
    this.beforeRun = beforeRun;
  }

  /**
   * Enqueue files to be run by Mocha
   * @param {string[]|Set<string>} testFiles - A list of test ("entry") files
   * @param {string[]|Set<string>} affectedFiles - A list of all files which should be blasted from the require cache.  A superset of `testFiles`
   */
  enqueue(testFiles = [], affectedFiles = []) {
    this.queue.push({
      testFiles: [...testFiles],
      affectedFiles: [...affectedFiles]
    });
    if (!this.running) {
      this.drain();
    }
  }

  /**
   * Drain the queue and run.
   */
  drain() {
    const runObjects = [...this.queue];
    this.queue.length = 0;
    Rerunner.eraseLine();
    this.run(runObjects);
  }

  /**
   * Calls `Mocha#run()` with `runObjects`.
   * If other files are enqueued while this is running, it will drain the queue at the end of its run.
   * Calls `beforeRun` if present.
   * @param {RunObject[]} runObjects - Test files and affected files. If empty, just run all files
   */
  run(runObjects = []) {
    this.running = true;
    // need flatmap
    const testFiles = runObjects.reduce(
      (acc, {testFiles}) => [...acc, ...testFiles],
      []
    );
    const affectedFiles = runObjects.reduce(
      (acc, {affectedFiles}) => [...acc, ...affectedFiles],
      []
    );
    Rerunner.blastCache(affectedFiles);

    const mocha = (this.mocha = this.beforeRun
      ? this.beforeRun.call(null, {
          mocha: this.mocha,
          watcher: this.watcher,
          filenames: testFiles
        })
      : this.mocha);

    mocha.run(() => {
      debug('finished watch run');
      this.running = false;
      if (this.queue.length) {
        setTimeout(() => {
          this.drain();
        });
      } else {
        debug('waiting for changes...');
      }
    });
  }

  /**
   * Blast files out of `require.cache`
   * @param {string[]|Set<string>} files - List of files
   */
  static blastCache(files) {
    files.forEach(file => {
      delete require.cache[file];
    });
    debug('deleted %d file(s) from the require cache', [...files].length);
  }

  static create(mocha, watcher, opts) {
    return new Rerunner(mocha, watcher, opts);
  }

  /**
   * Erases the line on stdout
   */
  static eraseLine() {
    process.stdout.write('\u001b[2K');
  }
}

exports.Rerunner = Rerunner;

/**
 * Callback to be run before `mocha.run()` is called.
 * Optionally, it can return a new `Mocha` instance.
 * @callback BeforeWatchRun
 * @private
 * @param {{mocha: Mocha, watcher: FSWatcher, filenames: string[]}} options
 * @returns {Mocha|void}
 */

/**
 * An object containing a list of test files and list of all affected files
 * @typedef {Object} RunObject
 * @property {string[]} testFiles
 * @property {string[]} affectedFiles
 */
