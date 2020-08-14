// @ts-check

'use strict';

const {format} = require('util');
const flatCache = require('flat-cache');
const findCacheDir = require('find-cache-dir');
// @ts-ignore
const {paperwork} = require('precinct');
const cabinet = require('filing-cabinet');
const path = require('path');
const debug = require('debug')('mocha:cli:module-map');
const fileEntryCache = require('file-entry-cache');

const CACHE_DIR_PATH = findCacheDir({name: 'mocha'});

const MODULE_MAP_CACHE_FILENAME = 'module-map.cache.json';
const FILE_ENTRY_CACHE_FILENAME = 'file-entry.cache.json';

/**
 * Class used internally by {@link ModuleMap} which tracks the relationship between parents and children.
 * All "references" are by filename (string); there are no references to other `ModuleMap`s.
 * @private
 */
class ModuleNode {
  /**
   * Sets properties
   * @param {string} filename
   * @param {ModuleNodeOptions} opts
   */
  constructor(filename, {entryFiles = [], children = [], parents = []} = {}) {
    this.filename = filename;
    this.entryFiles = entryFiles;
    this.parents = parents;
    this.children = children;
  }

  get parents() {
    return this._parents;
  }

  set parents(value) {
    this._parents = new Set([...value]);
  }

  get children() {
    return this._children;
  }

  set children(value) {
    this._children = new Set([...value]);
  }

  get entryFiles() {
    return this._entryFiles;
  }

  set entryFiles(value) {
    this._entryFiles = new Set([...value]);
  }

  toJSON() {
    return {
      filename: this.filename,
      entryFiles: [...this.entryFiles].sort(),
      children: [...this.children].sort(),
      parents: [...this.parents].sort()
    };
  }

  toString() {
    return format('%o', this.toJSON());
  }

  static create(filename, opts) {
    return new ModuleNode(filename, opts);
  }
}

/**
 * A map to track files and their dependencies
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
    ignored = [],
    cwd = process.cwd()
  } = {}) {
    super();
    this.cacheDir = cacheDir;
    this.moduleMapCacheFilename = moduleMapCacheFilename;
    this.fileEntryCacheFilename = fileEntryCacheFilename;
    this._moduleMapCache = this.getModuleMapCache({reset});
    this._fileEntryCache = this.getFileEntryCache({reset});
    this.cwd = cwd;
    this.entryFiles = entryFiles;
    this.ignored = ignored;
    this._initialized = false;
    this._init();
    debug('instantiated ModuleMap with %d initial files', this.files.size);
  }

  get cwd() {
    return this._cwd;
  }

  set cwd(value) {
    this._cwd = value;
  }

  get moduleMapCacheFilename() {
    return this._moduleMapCacheFilename;
  }

  set moduleMapCacheFilename(value) {
    this._moduleMapCacheFilename = value;
  }

  get fileEntryCacheFilename() {
    return this._fileEntryCacheFilename;
  }

  set fileEntryCacheFilename(value) {
    this._fileEntryCacheFilename = value;
  }

  get ignored() {
    return this._ignored;
  }

  set ignored(value) {
    this._ignored = new Set([value]);
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
   * Load module map cache
   * @param {{reset?: boolean}} [opts]
   */
  getModuleMapCache({reset = false} = {}) {
    const cache = flatCache.create(this.moduleMapCacheFilename, this.cacheDir);
    if (reset) {
      cache.destroy();
      debug('destroyed module map cache %s', this.moduleMapCacheFilename);
    }
    return cache;
  }

  /**
   * Load file entry cache
   * @param {{reset?: boolean}} [opts]
   */
  getFileEntryCache({reset = false} = {}) {
    const cache = fileEntryCache.create(
      this.fileEntryCacheFilename,
      this.cacheDir
    );
    if (reset) {
      cache.destroy();
      debug('destroyed file entry cache %s', this.fileEntryCacheFilename);
    }
    return cache;
  }

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
   * Initializes map from cache on disk.  Should only be called once, by constructor.
   * Re-populates map from entry files
   * Persists caches
   */
  _init() {
    if (this._initialized) {
      throw new Error('already initialized');
    }
    this.sync({destructive: true});
    const nodes = new Set();

    // ensure we add unknown entry files
    for (const entryFile of this.entryFiles) {
      if (!this.has(entryFile)) {
        this.set(entryFile, ModuleNode.create(entryFile));
      }
    }
    // figure out what files have changed.
    // on a clean cache, this will return all the files
    this.getChangedFiles().forEach(filename => {
      if (this.has(filename)) {
        nodes.add(this.get(filename));
      }
    });
    this.entryFiles.forEach(entryFile => {
      nodes.add(this.get(entryFile));
    });

    this._populate([...nodes], {force: true});

    this.save();

    this._initialized = true;
  }

  toString() {
    return format('%o', this.toJSON());
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
      this.set(filename, ModuleNode.create(filename));
      this._populate([this.get(filename)]);
      debug('added new entry file %s', filename);
    }
  }

  /**
   * Syncs module map cache _from_ disk
   * @param {{destructive?: boolean}} param0
   */
  sync({destructive = false} = {}) {
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
        ModuleNode.create(filename, {children, entryFiles, parents})
      );
    });
    debug('added %d files to map from cache', filenames.length);
  }

  /**
   * Removes a file from the map (and all references within the map's `ModuleNode` values)
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
   * Persists caches to disk
   */
  save() {
    debug('persisting caches...');
    this.forEach((value, key) => {
      this._moduleMapCache.setKey(key, value);
    });
    this._moduleMapCache.save();
    this.getChangedFiles();
    debug('persisted caches');
    return this;
  }

  /**
   * Given one or more `ModuleNode`s, find dependencies and add them to the map.
   * @param {ModuleNode|ModuleNode[]} nodes - One or more module nodes to find dependencies for
   */
  _populate(nodes, {force = false} = {}) {
    if (nodes instanceof ModuleNode) {
      nodes = [nodes];
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
        const childNode = this.get(child) || ModuleNode.create(child);
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
    /**
     * @type {string[]}
     */
    const partials = paperwork(filename, {includeCore: false});
    const deps = new Set(
      partials
        .map(partial => cabinet({partial, filename, directory: this.cwd}))
        .filter(
          // it's possible to end up with _empty_ dependency names,
          // which is probably a bug in filing-cabinet or precinct.
          // this happens when requiring a json file but skipping the file extension
          // TODO: use the `ignored` prop
          depFilename => depFilename && !depFilename.includes('node_modules')
        )
    );
    debug('found %d deps for file %s', deps.size, filename);
    return deps;
  }

  /**
   * Given a list of filenames, return those that are in `entryFiles`
   * @param {string[]|Set<string>} files
   * @returns {string[]}
   */
  filterEntryFiles(files) {
    return [...files].filter(file => this.entryFiles.has(file));
  }

  /**
   * Given a list of filenames which potentially have changed recently, find all files which depend upon these files
   * @param {string|string[]} filenames - One or more filenames
   * @returns {Set<string>} Zero or more files impacted by a given change
   */
  getAffectedFiles(filenames) {
    if (typeof filenames === 'string') {
      filenames = [filenames];
    }

    const nodes = [...filenames]
      .map(filename => path.resolve(this.cwd, filename))
      .filter(filename => this.has(filename))
      .map(filename => this.get(filename));
    debug(
      'found %d existing nodes from %d filenames',
      nodes.length,
      filenames.length
    );
    this._populate(nodes);

    return nodes.reduce((acc, node) => {
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
    }, new Set());
  }

  /**
   * From the known files, return a list of files that have changed since last time we looked.
   * Persists the file entry cache.
   */
  getChangedFiles() {
    debug('checking %d files for changes...', this.files.size);
    const changed = this._fileEntryCache.getUpdatedFiles([...this.files]);
    this._fileEntryCache.reconcile(true);
    debug('persisted changed files: %o', changed);
    return changed;
  }

  toJSON() {
    return [...this]
      .sort(([aKey], [bKey]) => aKey - bKey)
      .reduce((acc, [key, value]) => {
        acc[key] = value.toJSON();
        return acc;
      }, {});
  }

  static create(opts) {
    return new ModuleMap(opts);
  }
}

exports.ModuleMap = ModuleMap;
exports.ModuleNode = ModuleNode;
exports.CACHE_DIR_PATH = CACHE_DIR_PATH;

/**
 * @typedef {Object} ModuleNodeOptions
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
 * @property {string[]|Set<string>} ignored - List of ignored globs
 * @property {string} cwd - Current working directory
 */
