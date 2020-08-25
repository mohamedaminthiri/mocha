// @ts-check

'use strict';

const {format} = require('util');
const flatCache = require('flat-cache');
const findCacheDir = require('find-cache-dir');
// @ts-ignore
const path = require('path');
const debug = require('debug')('mocha:cli:module-map');
const fileEntryCache = require('file-entry-cache');
const {resolveDependencies} = require('./resolver');
const CACHE_DIR_PATH = findCacheDir({name: 'mocha'});
const {ModuleMapNode} = require('./module-map-node');
const MODULE_MAP_CACHE_FILENAME = 'module-map.cache.json';
const FILE_ENTRY_CACHE_FILENAME = 'file-entry.cache.json';

/**
 * A map to track files and their dependencies
 * @type {Map<string,ModuleMapNode>}
 */
class ModuleMap extends Map {
  /**
   * Initializes cache, map, loads from disk, finds deps, etc.
   * Cannot be instantiated like a normal map.
   * @param {Partial<ModuleMapOptions>} opts
   */
  constructor({
    moduleMapCacheFilename = MODULE_MAP_CACHE_FILENAME,
    fileEntryCacheFilename = FILE_ENTRY_CACHE_FILENAME,
    cacheDir = CACHE_DIR_PATH,
    reset = false,
    entryFiles = [],
    ignore = [],
    cwd = process.cwd()
  } = {}) {
    super();
    this.cacheDir = cacheDir;
    this.moduleMapCacheFilename = moduleMapCacheFilename;
    this.fileEntryCacheFilename = fileEntryCacheFilename;
    this._moduleMapCache = this.createModuleMapCache();
    this._fileEntryCache = this.createFileEntryCache();
    this.cwd = cwd;
    this.entryFiles = new Set(entryFiles);
    this.ignore = new Set(ignore);
    this._initialized = false;
    this._init({reset});
    debug('instantiated ModuleMap with %d initial files', this.files.size);
  }

  /**
   * @type {string}
   */
  get cwd() {
    return this._cwd;
  }

  set cwd(value) {
    this._cwd = value;
  }

  /**
   * @type {string}
   */
  get moduleMapCacheFilename() {
    return this._moduleMapCacheFilename;
  }

  set moduleMapCacheFilename(value) {
    this._moduleMapCacheFilename = value;
  }

  /**
   * @type {string}
   */
  get fileEntryCacheFilename() {
    return this._fileEntryCacheFilename;
  }

  set fileEntryCacheFilename(value) {
    this._fileEntryCacheFilename = value;
  }

  /**
   * @type {Set<string>}
   */
  get ignore() {
    return this._ignore;
  }

  set ignore(value) {
    this._ignore = new Set(value);
  }

  /**
   * Like `Map#keys()` but returns a `Set` instead.
   */
  get files() {
    /**
     * @type {Set<string>}
     */
    const list = new Set();
    for (const file of this.keys()) {
      list.add(file);
    }
    return list;
  }

  /**
   * @type {Set<string>}
   */
  get entryFiles() {
    return this._entryFiles;
  }

  set entryFiles(value) {
    this._entryFiles = new Set(
      [...value].map(filename => path.resolve(this.cwd, filename))
    );
  }

  get entryDirs() {
    return new Set([...this.entryFiles].map(file => path.dirname(file)));
  }

  /**
   * Load module map cache
   */
  createModuleMapCache() {
    const cache = flatCache.create(this.moduleMapCacheFilename, this.cacheDir);
    debug(
      'created/loaded module map cache at %s',
      path.join(this.cacheDir, this.fileEntryCacheFilename)
    );
    return cache;
  }

  /**
   * Load file entry cache
   */
  createFileEntryCache() {
    const cache = fileEntryCache.create(
      this.fileEntryCacheFilename,
      this.cacheDir
    );
    debug(
      'created/loaded file entry cache at %s',
      path.join(this.cacheDir, this.fileEntryCacheFilename)
    );
    return cache;
  }

  /**
   * Initializes map from cache on disk.  Should only be called once, by constructor.
   * Re-populates map from entry files
   * Persists caches
   */
  _init({reset = false} = {}) {
    if (this._initialized) {
      throw new Error('already initialized');
    }
    if (reset) {
      this.resetModuleMapCache().resetFileEntryCache();
    }
    this.mergeFromCache({destructive: true});
    const nodes = new Set();

    // ensure we add unknown entry files
    for (const entryFile of this.entryFiles) {
      if (!this.has(entryFile)) {
        debug('added new entry file: %s', entryFile);
        this.set(entryFile, ModuleMapNode.create(entryFile));
      }
    }
    // figure out what files have changed.
    // on a clean cache, this will return all the files
    this._getChangedFiles().forEach(filename => {
      if (this.has(filename)) {
        nodes.add(this.get(filename));
      }
    });

    if (nodes.size) {
      this._populate(nodes, {force: true});
    }

    this.save();

    this._initialized = true;

    return this;
  }

  save() {
    this.persistModuleMapCache();
    this.persistFileEntryCache();
    return this;
  }

  toString() {
    return format('%o', this.toJSON());
  }

  persistFileEntryCache({files = this.files} = {}) {
    this._fileEntryCache.normalizeEntries([...files]);
    this._fileEntryCache.reconcile(true);
    debug('persisted file entry cache: %s', this.fileEntryCacheFilename);
    return this;
  }

  resetFileEntryCache() {
    this._fileEntryCache.destroy();
    debug('destroyed file entry cache: %s', this.fileEntryCacheFilename);
    return this;
  }

  resetModuleMapCache() {
    this._moduleMapCache.destroy();
    debug('destroyed module map cache: %s', this.moduleMapCacheFilename);
    return this;
  }

  /**
   * Adds an entry file to the map, and populates its dependences
   * @param {string} filename
   */
  addEntryFile(filename) {
    if (!this.entryFiles.has(filename)) {
      this.entryFiles.add(filename);
    }
    if (this.has(filename)) {
      debug('marked file %s as an entry file', filename);
    } else {
      this.set(filename, ModuleMapNode.create(filename));
      this._populate(this.get(filename));
      debug('added new entry file %s', filename);
    }
  }

  /**
   * Syncs module map cache _from_ disk
   * @param {{destructive?: boolean}} param0
   */
  mergeFromCache({destructive = false} = {}) {
    const map = this._moduleMapCache.all();
    if (destructive) {
      this.clear();
      debug('cleared in-memory ModuleMap');
    }
    const filenames = Object.keys(map);
    filenames.forEach(key => {
      const {filename, children, entryFiles, parents} = map[key];
      this.set(
        filename,
        ModuleMapNode.create(filename, {children, entryFiles, parents})
      );
    });
    debug('added %d files to map from cache', filenames.length);
    return this;
  }

  /**
   * Removes a file from the map (and all references within the map's `ModuleMapNode` values)
   * @param {string} filename
   */
  delete(filename) {
    if (this.has(filename)) {
      const node = this.get(filename);

      node.children.forEach(childFilename => {
        const {parents} = this.get(childFilename);
        parents.delete(node.filename);
        if (!parents.size) {
          this.delete(childFilename);
          debug('cascading delete: %s', childFilename);
        }
      });
      node.parents.forEach(parentFilename => {
        this.get(parentFilename).children.delete(node.filename);
      });
      this.entryFiles.delete(filename);
    }
    return super.delete(filename);
  }

  /**
   * Ensures in-memory module map cache has same values as in-memory ModuleMap.
   * Does not _remove_ any values from the in-memory module map cache.
   */
  _normalizeModuleMapCache() {
    this.forEach((value, key) => {
      this._moduleMapCache.setKey(key, value);
    });
    return this;
  }

  /**
   * Normalizes & persists module map cache to disk
   */
  persistModuleMapCache() {
    this._normalizeModuleMapCache();
    this._moduleMapCache.save(true);
    debug('persisted module map cache: %s', this.moduleMapCacheFilename);
    return this;
  }

  /**
   * Given one or more `ModuleMapNode`s, find dependencies and add them to the map.
   * @param {ModuleMapNode|Set<ModuleMapNode>} nodes - One or more module nodes to find dependencies for
   */
  _populate(nodes, {force = false} = {}) {
    if (nodes instanceof ModuleMapNode) {
      nodes = new Set([nodes]);
    }
    debug(
      'populating from %o',
      [...nodes].map(({filename}) => filename)
    );
    const stack = [];
    const seen = new Set();
    for (const node of nodes) {
      stack.push(
        this.entryFiles.has(node.filename) ? {node, entryNode: node} : {node}
      );
    }
    while (stack.length) {
      const {node, entryNode} = stack.pop();
      let children;
      if (force || this._fileEntryCache.hasFileChanged(node.filename)) {
        children = this.findDependencies(node.filename);
        node.children = children;
        debug('added %d children to %s', children.size, node.filename);
      } else {
        children = node.children;
      }
      // TODO I think entry files can get out-of-date here.  test it
      seen.add(node);
      for (const child of children) {
        const childNode = this.get(child) || ModuleMapNode.create(child);
        if (entryNode) {
          childNode.entryFiles.add(entryNode.filename);
        }
        childNode.parents.add(node.filename);
        this.set(child, childNode);
        if (!seen.has(childNode)) {
          stack.push({node: childNode, entryNode});
          seen.add(childNode);
        }
      }
    }
  }

  /**
   * Find all dependencies for `filename`
   * @param {string} filename
   */
  findDependencies(filename) {
    return resolveDependencies(filename, {cwd: this.cwd, ignore: this.ignore});
  }

  /**
   * Given a list of filenames, return those that are in `entryFiles`
   * @param {string[]|Set<string>} files
   * @returns {string[]}
   */
  filterEntryFiles(files) {
    return [...files].filter(file => this.entryFiles.has(file));
  }

  markFileAsChanged(file) {
    this._fileEntryCache.removeEntry(file);
    return this;
  }

  /**
   * Given a list of filenames which potentially have changed recently, find all files which depend upon these files
   * @param {FindAffectedFilesOptions} [opts]
   * @returns {{entryFiles: Set<string>, allFiles: Set<string>}} Zero or more files impacted by a given change
   */
  findAffectedFiles({files = [], markChangedFiles = []} = {}) {
    files = new Set(files);
    markChangedFiles = new Set(markChangedFiles);
    if (markChangedFiles.size) {
      markChangedFiles.forEach(markChangedFile => {
        this.markFileAsChanged(markChangedFile);
      });
    }
    if (!files.size) {
      files = this.getChangedFiles();
    }
    if (files.size) {
      const nodes = [...files]
        .map(filename =>
          path.isAbsolute(filename)
            ? filename
            : path.resolve(this.cwd, filename)
        )
        .filter(filename => this.has(filename))
        .map(filename => this.get(filename));
      debug(
        'found %d existing nodes from %d filename(s)',
        nodes.length,
        files.size
      );
      this._populate(new Set(nodes));

      // by starting the reduce() below with this Set, we ensure
      // the changed files will be in the returned list.
      const nodeFilenames = new Set(nodes.map(({filename}) => filename));
      const allFiles = nodes.reduce((acc, node) => {
        const affectedFiles = new Set(
          this.entryFiles.has(node.filename)
            ? [node.filename, ...node.entryFiles]
            : [...node.entryFiles]
        );
        const stack = [...node.parents];
        while (stack.length) {
          const parentFilename = stack.pop();
          if (!affectedFiles.has(parentFilename)) {
            affectedFiles.add(parentFilename);
            stack.push(...this.get(parentFilename).parents);
          }
        }
        debug('change in %o affected: %o', node.filename, [...affectedFiles]);
        affectedFiles.forEach(affectedFile => {
          acc.add(affectedFile);
        });
        return acc;
      }, nodeFilenames);
      const entryFiles = new Set(this.filterEntryFiles(allFiles));
      return {allFiles, entryFiles};
    } else {
      debug('no changed files!');
      return {entryFiles: new Set(), allFiles: new Set()};
    }
  }

  _getChangedFiles() {
    const files = new Set(
      this._fileEntryCache.getUpdatedFiles([...this.files])
    );
    debug(
      'found %d changed out of %d known files',
      files.size,
      this.files.size
    );
    return files;
  }

  /**
   * From the known files, return a list of files that have changed since last time we looked.
   * Persists the file entry cache.
   */
  getChangedFiles() {
    const changed = this._getChangedFiles();
    this.persistFileEntryCache();
    return changed;
  }

  /**
   * Returns a stable object representation of this ModuleMap.
   * Keys (filenames) will be sorted; values (`ModuleMapNode`
   * instances) will be the result of calling {@link ModuleMapNode#toJSON()} on each
   * @returns {Object}
   */
  toJSON() {
    return [...this]
      .sort(([filenameA], [filenameB]) => filenameA.localeCompare(filenameB))
      .reduce(
        (acc, [filename, node]) => ({...acc, [filename]: node.toJSON()}),
        {}
      );
  }

  static create(opts) {
    return new ModuleMap(opts);
  }
}

exports.ModuleMap = ModuleMap;
exports.ModuleMapNode = ModuleMapNode;
exports.CACHE_DIR_PATH = CACHE_DIR_PATH;

/**
 * @typedef {Object} ModuleMapNodeOptions
 * @property {string[]|Set<string>} [parents] - List of parents (dependants), if any
 * @property {string[]|Set<string>} [children] - List of children (dependencies), if any
 * @property {string[]|Set<string>} [entryFiles] - List of associated test files
 */

/**
 * @typedef {Object} ModuleMapOptions
 * @property {string} moduleMapCacheFilename - Filename of on-disk module map cache
 * @property {string} fileEntryCacheFilename - Filename of on-disk file entry cache
 * @property {string} cacheDir - Path to Mocha-specific cache directory
 * @property {boolean} reset - If `true`, will obliterate caches
 * @property {string[]|Set<string>} entryFiles - List of test files
 * @property {string[]|Set<string>} ignore - List of ignored globs
 * @property {string} cwd - Current working directory
 */

/**
 * @typedef {Object} FindAffectedFilesOptions
 * @property {Set<string>|Array<string>} [files] - The list of _all_ changed files.  If omitted, changed files will be determined by the file entry cache.
 * @property {Set<string>|Array<string>} [markChangedFiles] - A list of files to explicitly consider changed (but not _all_ changed files)
 */
