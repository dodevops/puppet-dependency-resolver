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
