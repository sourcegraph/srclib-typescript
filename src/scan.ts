/// <reference path="../typings/node/node.d.ts" />
/// <reference path="../typings/npm/npm.d.ts" />
/// <reference path="../typings/q/Q.d.ts" />
/// <reference path="../typings/async/async.d.ts" />

import unit = require('./unit');
import utils = require('./utils');

import * as npm from "npm";
import * as q from "q";
import * as async from "async";

const TESTS_DIR: string = '.';
const TSCONFIG_JSON : string = 'tsconfig.json';

import fs = require('fs');
import path = require('path');
import stream = require('stream');
import child_process = require('child_process');

var tsconfig = require('tsconfig');

/**
 * Scan command typescript routine, looks for tsconfig.json file
 */
export class ScanAction implements Action {

    execute(): void {
        var self = this;

        var sourceUnit = new unit.SourceUnit();
        sourceUnit.Type = 'TypeScriptModule';

        if (!fs.existsSync(TSCONFIG_JSON)) {
          console.log('[]');
          return;
        }
        q.
        when(self._initializeNpm()).
        then(self._install).
        then(self._getDeps).
        then(self._getRepositories).
        then(function(repos: {}[]) {
          var deps = [];
          repos.forEach(function(repo:any) {
            deps.push({
              Raw: repo,
              Target: {
                ToRepoCloneURL: repo.uri,
                ToUnit: 'TODO',
                ToUnitType: 'CommonJSPackage',
                ToVersionString: repo.version
              }
            });
          });
          sourceUnit.Dependencies = deps;
        }).
        then(self._collectFiles).
        then(function(files) {
          files.forEach(function(file:string) {
            try {
              var content = fs.readFileSync(file).toString();
              var matcher = /^\/\/\/.?<reference\s+path\s*=\s*\"([^"]+)\"/gm;
              var refPath;
              while (refPath = matcher.exec(content)) {
                  refPath = utils.normalizePath(
                    path.resolve(path.dirname(file), refPath[1]));
                  if (files.indexOf(refPath) < 0 && fs.existsSync(refPath)) {
                    files.push(refPath);
                  }
              }
            } catch (e) {
              console.error(e);
            }
          });
          sourceUnit.Files = files;
        }).
        then(function() {
          var packageJson: any;
          try {
            var json = fs.readFileSync('package.json');
            packageJson = JSON.parse(json.toString());
          } catch (e) {
             packageJson = {};
          }
          sourceUnit.Name = packageJson.name || path.basename(process.cwd());
          console.log(JSON.stringify([sourceUnit]));
        });
    }

    private _initializeNpm(): q.Promise<void> {
      var ret : q.Deferred<void> = q.defer<void>();
      console.error("initializing npm");
      npm.load(null, function(err, result) {
        if (err) {
          ret.reject(err);
        } else {
          console.error("npm is initialized");
          ret.resolve();
        }
      });
      return ret.promise;
    }

    private _install(): q.Promise<void> {
      var ret : q.Deferred<void> = q.defer<void>();
      console.error("Installing npm packages");
      // nodejs ignores PATHEXT
      var npmCmd: string;
      if (process.platform == "win32") {
        npmCmd = "npm.cmd";
      } else {
        npmCmd = "npm";
      }
      child_process.execFile(npmCmd, ["install"], (err, stdout, stderr) => {
        if (err) {
          console.error("An error occured while instaling packages", err);
        }
        console.error("npm install stdout", stdout);
        console.error("npm install stderr", stderr);
        console.error("npm packages are installed");
        ret.resolve();
      });
      return ret.promise;
    }

    private _getDeps(): q.Promise<{}[]> {
      var ret : q.Deferred<{}[]> = q.defer<{}[]>();
      console.error("Retrieving installed npm packages");
      npm.commands.ls([], true, function(err, data, deps) {
        if (err) {
          console.error("An error occured while retrieving deps", err);
        }
        console.error("Retrieved installed npm packages");
        ret.resolve(deps || {});
      });
      return ret.promise;
    }

    private _getRepositories(deps: any): q.Promise<any> {
      var ret : q.Deferred<any> = q.defer<any>();
      console.error("Retrieving repositories");
      var tasks = [];
      async.forEachOf(deps.dependencies || {}, function(v:any, k:string) {
        tasks.push(function(callback) {
          delete v.dependencies;
          npm.commands.view([k + '@' + v.version], true, function(err, data) {
            v.uri = ((data[v.version] || {}).repository || {}).url;
            callback(err, v);
          })
        });
      }, function() {});
      async.parallel(tasks, function(err, data) {
        if (err) {
          console.error("An error occured while retrieving repositories", err);
        }
        console.error("Retrieved repositories");
        ret.resolve(data || []);
      });

      return ret.promise;
    }

    private _collectFiles(): string[] {
      console.error("Collecting files");
      try {
        var tsConfig = tsconfig.loadSync(TESTS_DIR);
      } catch (e) {
        return [];
      }
        return (tsConfig.files || []).map(function(file: string) {
            return utils.normalizePath(file);
        });
    }
}
