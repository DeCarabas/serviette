# Serviette

Serviette is a javascript port of Gary Bernhardt's useful [ServeIt](https://github.com/garybernhardt/serveit) tool.
Briefly, it is a web server that serves content off the local file system.
Before each request, it checks to see if any of the files have changed; if they have, it runs the build command, waits for the build command to complete, and then serves the appropriate file.

## Usage

```
Usage: serviette [options] [--] [<cmd>...]

Options:
  --serve=DIR    The root directory to serve. [default: .]
  -h --help      Show this help.
```

e.g. to serve the current directory at http://localhost:3000 as a purely static site, run:

```
$ serviette
```

To have it run make when you refresh the page, use:

```
$ serviette 'make'
```

If all your stuff is built into the "dist" subdirectory, then you can limit the browsing to just that directory:

```
$ serviette --serve=dist make
```

## Why?

Because ServeIt doesn't run well on Windows, and I needed to run on Windows.
(In particular, scanning my directory of 22k files took many seconds, and running the build command caused it to hang. Yuck.)
