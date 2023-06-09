# Puppetfile Depencency Resolver

## Introduction

The [Puppetfile](https://puppet.com/docs/pe/2019.8/puppetfile.html) includes all required component 
modules from the [Puppet Forge](https://forge.puppet.com/) and other external sources that will
be available for a Puppet environment after installing using tools like [r10k](https://github.com/puppetlabs/r10k).

This tool resolves the required dependent modules of the modules that are included in the Puppetfile
and adds them to the Puppetfile as well.

An alternative tool is [Puppetfile Librarian](https://github.com/voxpupuli/librarian-puppet), which didn't
solve all the problems that led to the development of this tool.

## Usage

```bash
$ node main.js resolve --help

  Resolve Puppetfile dependencies

  USAGE

    main resolve [...options] <puppetfile>

  PARAMETERS

    puppetfile - Absolute location of Puppetfile to parse/edit

  OPTIONS

    -h, --hide-file <hideFile>         - Path to text file with list of modules (format: author-module) to hide in the output when all dependencies have been resolved []
    -l, --loglevel <loglevel>          - Loglevel to use (see https://github.com/pimterry/loglevel/blob/master/index.d.ts#L14) [info]                                    
    -i, --ignore-file <ignoreFile>     - A file containing module slugs (format: author-module) that should be ignored for dependency errors or deprecations []          
    -p, --preamble-file <preambleFile> - Add the contents of this file at the top of the Puppetfile []      
```

This will output the resolved Puppetfile.

### Comments

Comments in front of module declarations are preserved while recompiling the Puppetfile. Please note
that comments on the same line of a module declaration is *not* preserved.

### Hide file

The hide file can be used to remove certain modules from the resulting Puppetfile. This can be useful if
a module was adopted by another publisher, but is still required from specific modules.

Put one module slug (publisher/module-name) per line.

### Ignore file

The Puppetfile Dependency Resolver also checks if a module is deprecated and should be replaced
with another module. This usually results in an error and aborts the process.

Processing errors can be ignored using the ignore file. Put one module slug (publisher/module-name) per line.

### Preamble file

The preamble file can be used to include organization comments in the resulting Puppetfile. The
preamble is always included after the `forge` declaration.

## Analyzing problems

The dependency resolver dumps its database when problems occur. Because of possible circular references, this database 
is in a special JSON format, which can be interpreted using [flatted](https://github.com/WebReflection/flatted#flatted).

(The following examples expect, that the required packages are installed as documented in their respective documentation,
e.g. `npm install flatted` or `npm install graphology`)

```javascript
const {parse} = require('flatted');
const database = parse(fs.readFileSync('errorDump.js'))
```

The database contains two keys:

* forgeCache: the cache of downloaded information from the PuppetForge. It contains available releases and metadata
  for each required module
* dependencyGraph: a [Graphology](https://graphology.github.io/) graph containing the dependencies

The dependency graph can be imported to be analyzed by using the import function:

```javascript
const Graph=require('graphology')
const analysisGraph=new Graph()
analysisGraph.import(database.dependencyGraph)
```

Afterwards, the graph can be analyzed using the documented features. For example, it can be turned into an SVG
representation like this:

```javascript
const circular = require('graphology-layout/circular')
const render = require('graphology-svg')
circular.assign(analysisGraph, {scale:20})
render(analysisGraph, './graph.svg', () => console.log('Done!'))
```