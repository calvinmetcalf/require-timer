"use strict";
var startTime = time();
var path = require('path');

var fs = require('fs');
var sprintf = require('sprintf');
var out = process.stdout;
var sync = false;
var reported = new Set();
module.exports = function (stream) {
    out = stream;
}
var root = module.parent;
var top = findTop(root);
root._requireTimer = {
  name: path.basename(top.filename),
  path: path.dirname(top.filename),
  start: startTime,
  end: null
};
root._requireTimer.stack = [root._requireTimer];
function findTop(module) { return module.parent ? findTop(module.parent) : module }

function time() {
  var hrtime = process.hrtime();
  return hrtime[0] * 1e3 + hrtime[1] / 1e6; //
}

function escapeRegExp(string){
  return string.replace(/([.*+?^${}()|\[\]\/\\])/g, "\\$1");
}

var resafesep = escapeRegExp(path.sep);
['.js', '.json'].forEach(function (ext) {
  var defaultLoader = require.extensions[ext];
  require.extensions[ext] = function (module) {
    if (module._requireTimer) {
      return defaultLoader.apply(null, arguments);
    }
    var current = module._requireTimer = {
      name: null,
      path: null,
      start: null,
      end: null
    };
    var matched = false;
    var parent = module;
    while (parent = parent.parent) {
      var relpath = path.relative(parent._requireTimer.path,module.filename);
      if (relpath[0] != '.') {
        current.name = relpath;
        matched = true;
        break;
      }
    }
    current.stack = parent._requireTimer.stack.slice();
    if (!matched) {
      current.path = module.parent._requireTimer.path;
      current.name = path.relative(current.path,module.filename);
    }
    else {
      var matches;
      if (0 === current.name.indexOf('node_modules'+path.sep)) {
        var namechunk = current.name.substr(12+path.sep.length);
        var namelength = namechunk.indexOf(path.sep);
        current.name = namechunk.substr(0,namelength);
        var moduleprefix = 'node_modules'+path.sep+current.name+path.sep;
        var module_path_length = module.filename.lastIndexOf(moduleprefix) + moduleprefix.length;
        current.path = module.filename.substr(0,module_path_length);
      }
      else {
        current.path = parent._requireTimer.path;
      }
    }
    current.stack.push(current);
    //console.log(current);
    current.start = time();
    var result = defaultLoader.apply(null,arguments);
    current.end = time();
    current.diff = current.end - current.start;
    current.children = module.children.map(function (item) {
      if (item && item._requireTimer) {
        return item._requireTimer.diff;
      }
    });
    current.stack = current.stack.filter(function (item) {
      return item === current || item.end === null;
    });
    setImmediate(function () {
      current.childDif = current.children.filter(function (item) {
        return item;
      }).reduce(function (a, b) {
        return a + b;
      }, 0);
      out.write(sprintf('%9.3f ms self, %9.3f ms total to load: %s\n', current.diff - current.childDif, current.diff, current.stack.map(function (item) {
        return item.name;
      }).join(' -> ')));
    });
    return result;
  };
});
