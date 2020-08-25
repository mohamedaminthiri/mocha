'use strict';

const {format} = require('util');

/**
 * Class used internally by {@link ModuleMap} which tracks the relationship between parents and children.
 * All "references" are by filename (string); there are no references to other `ModuleMap`s.
 * @private
 */
class ModuleMapNode {
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
    return new ModuleMapNode(filename, opts);
  }
}

exports.ModuleMapNode = ModuleMapNode;
