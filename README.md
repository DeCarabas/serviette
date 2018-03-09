# Serviette

Serviette is a javascript port of Gary Bernhardt's useful [ServeIt](https://github.com/garybernhardt/serveit) tool.
Briefly, it is a web server that serves content off the local file system.
Before each request, it checks to see if any of the files have changed; if they have, it runs the build command, waits for the build command to complete, and then serves the appropriate file.

## Usage

To serve the current directory at http://localhost:8000 as a purely static site, run:

```
$ serviette
```

To have it run make when you refresh the page, use:

```
$ serviette 'make'
```

(There's more but I'm tired of writing right now and I don't want to copy all of ServeIt's documentation.)

## Why?

Because ServeIt doesn't run well on Windows, and I needed to run on Windows.
(In particular, scanning my directory of 22k files took many seconds, and running the build command caused it to hang. Yuck.)
