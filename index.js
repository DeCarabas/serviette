// @format
// @flow
const child_process = require("child_process");
const fs = require("fs");
const http = require("http");
const path_ = require("path");
const url = require("url");

const port = 3000;
const buildCommand = "npm run build";

/** A function to compare things.

Sometimes you need a function to compare things, and JS doesn't come with one.
*/
function compare(a, b) {
  if (a < b) {
    return -1;
  } else if (b < a) {
    return 1;
  } else {
    return 0;
  }
}

/** See if two disk states are equal. */
function equalsState(new_state, previous_state) {
  if (new_state && !previous_state) {
    return false;
  }
  if (!new_state && previous_state) {
    return false;
  }
  if (new_state.length != previous_state.length) {
    return false;
  }
  for (let i = 0; i < new_state.length; i++) {
    if (new_state[i].path != previous_state[i].path) {
      return false;
    }

    if (new_state[i].mtime != previous_state[i].mtime) {
      return false;
    }
  }
  return true;
}

/** Helper to print a string right-justified at 80 cols. */
function printStatus(status) {
  const padding = 79 - status.length;
  let result = "";
  while (result.length < padding) {
    result += "=";
  }
  console.log(result, status);
}

/** A simple asynchronous lock.

Call `lock` with a callback, and that callback will be called when the lock is
free. The callback will receve another function to call when you're done using
the lock.
*/
/*::
type unlock_cb = () => void;
type locked_cb = (unlock_cb) => void;
*/
class LockQueue {
  /*::
  lock_queue: locked_cb[];
  */
  constructor() {
    this.lock_queue = [];
  }

  lock(callback) {
    this.lock_queue.push(callback);
    if (this.lock_queue.length == 1) {
      process.nextTick(() => this._dispatch());
    }
  }

  _dispatch() {
    const unlock = () => {
      this.lock_queue.shift();
      if (this.lock_queue.length > 0) {
        process.nextTick(() => this._dispatch());
      }
    };

    const item = this.lock_queue[0];
    item(unlock);
  }
}

/** The thing what does rebuilding.

So much more verbose compared to Gary's ruby version.
*/
class Rebuilder {
  /*::
  disk_state: ({|path: string, mtime: number|})[];
  lock: LockQueue;
  rebuild_command: string;
  */
  constructor(rebuild_command) {
    this.disk_state = [];
    this.lock = new LockQueue();
    this.rebuild_command = rebuild_command;
  }

  rebuildIfNecessary(callback) {
    // This locking is required so that we only ever have one build going on
    // at a time.
    this.lock.lock(unlock => {
      this.scan((err, results) => {
        if (err || equalsState(results, this.disk_state)) {
          unlock();
          callback(err);
        } else {
          this.rebuild(err => {
            if (err) {
              unlock();
              callback(err);
            } else {
              this.gatherState((err, results) => {
                if (!err) {
                  this.disk_state = results;
                }
                unlock();
                callback(err);
              });
            }
          });
        }
      });
    });
  }

  scan(callback) {
    const start_time = new Date();
    this.gatherState((err, results) => {
      const end_time = new Date();
      const elapsed = (end_time - start_time) / 1000;
      printStatus(`Scanned ${results.length} files in ${elapsed}s`);
      callback(err, results);
    });
  }

  gatherState(callback) {
    let expected = 0;
    const results = [];

    function begin() {
      expected += 1;
    }

    function done() {
      expected -= 1;
      if (expected == 0) {
        results.sort((a, b) => compare(a.path, b.path));
        callback(null, results);
      }
    }

    function error(err) {
      expected = -1;
      callback(err, results);
    }

    function walk(path) {
      begin();
      fs.stat(path, (err, stat) => {
        if (err) {
          error(err);
        } else {
          results.push({ path: path, mtime: stat.mtimeMs });
          if (stat.isDirectory()) {
            fs.readdir(path, (err, files) => {
              if (err) {
                error(err);
              } else {
                files.forEach(f => walk(path_.join(path, f)));
                done();
              }
            });
          } else {
            done();
          }
        }
      });
    }
    walk(".");
  }

  rebuild(callback) {
    printStatus(`Running ${this.rebuild_command}`);
    const start = new Date();
    function printEnd() {
      const end = new Date();
      const elapsed = (end - start) / 1000;
      printStatus(`Rebuilt in ${elapsed}s`);
    }

    const child = child_process.exec(this.rebuild_command);
    if (child.stdin) {
      child.stdin.end();
    }

    let output = "";
    child.stdout.on("data", data => {
      output += data;
    });
    child.stderr.on("data", data => {
      output += data;
    });

    let signaled = false;
    child.on("error", err => {
      if (!signaled) {
        signaled = true;
        printEnd();
        callback(err);
      }
    });
    child.on("exit", (code, signal) => {
      if (!signaled) {
        signaled = true;
        console.log(output);
        printEnd();
        if (code || signal) {
          callback(output);
        } else {
          callback(null);
        }
      }
    });
  }
}

let rebuilder = new Rebuilder("npm run build");

let disk_state;
function requestHandler(request, response) {
  console.log("Handling:", request.url);
  rebuilder.rebuildIfNecessary(err => {
    if (err) {
      reportError(err, response);
    } else {
      serveFile(request, response);
    }
    console.log("Done handling", request.url);
  });
}

const mimeTypes = {
  html: "text/html",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  js: "text/javascript",
  css: "text/css"
};

function serveFile(request, response) {
  //const uri = new url.URL(request.url).pathname;
  const relative = request.url;
  const absolute = path_.resolve(process.cwd(), relative.substr(1));

  fs.stat(absolute, (err, stat) => {
    if (err) {
      reportError(err, response);
    } else if (stat.isDirectory()) {
      serveDirectory(absolute, relative, response);
    } else {
      const ext = path_.extname(absolute).substr(1);
      const mimeType = mimeTypes[ext] || "text/html";
      response.writeHead(200, {
        "Content-Type": mimeType,
        "Content-Length": stat.size.toString()
      });

      const fileStream = fs.createReadStream(absolute);
      fileStream.pipe(response);
    }
  });
}

function serveDirectory(absolute, relative, response) {
  fs.readdir(absolute, (err, files) => {
    if (err) {
      reportError(err, response);
    } else {
      const prefix = relative == "/" ? "" : relative;
      files.sort();
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(`
        <p><h3>Listing for ${path_.basename(absolute)}</h3></p>
        ${files
          .map(f => `<a href='${prefix + "/" + f}'>${f}</a>`)
          .join("<br/>\n")}
      `);
    }
  });
}

function reportError(error, response) {
  response.end(`An error occurred: ${error.toString()}`);
}

const server = http.createServer(requestHandler);
server.listen(port, err => {
  if (err) {
    return console.log("something bad happened", err);
  }
  console.log(`server is listening on ${port}`);
});
