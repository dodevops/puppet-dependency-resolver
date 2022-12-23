import { Command, command, option, Options, param } from 'clime'
import { DependencyResolver } from '../lib/DependencyResolver'
import { PuppetFile } from '../lib/PuppetFile'
import log, { LogLevelDesc } from 'loglevel'
import { readFile, stat, writeFile } from 'fs/promises'
import { ForgeCache } from '../lib/ForgeCache'
import { DependencyGraph } from '../lib/DependencyGraph'
import { stringify } from 'flatted'

/**
 * The options for the resolve command
 */
export class ResolveOptions extends Options {
  @option({
    flag: 'h',
    description:
      'Path to text file with list of modules (format: author-module) to hide in the output when all dependencies have been resolved',
    default: '',
    validator: async (value) => {
      if (value !== '') {
        await stat(<string>value)
      }
    },
    type: String,
  })
  public hideFile = ''

  @option({
    flag: 'l',
    description: 'Loglevel to use (see https://github.com/pimterry/loglevel/blob/master/index.d.ts#L14)',
    default: 'info',
    type: String,
  })
  public loglevel = 'info'

  @option({
    flag: 'i',
    description:
      'A file containing module slugs (format: author-module) that should be ignored for dependency errors or deprecations',
    default: '',
    validator: async (value) => {
      if (value !== '') {
        await stat(<string>value)
      }
    },
    type: String,
  })
  public ignoreFile = ''

  @option({
    flag: 'p',
    description: 'Add the contents of this file at the top of the Puppetfile',
    default: '',
    validator: async (value) => {
      if (value !== '') {
        await stat(<string>value)
      }
    },
    type: String,
  })
  public preambleFile = ''
}

/**
 * The Resolve command
 */
@command({
  description: 'Resolve Puppetfile dependencies',
})
export default class extends Command {
  /**
   * Resolves the dependencies in a Puppetfile
   *
   * @param puppetfile The path to the Puppetfile to parse
   * @param options Puppetfile options
   * @returns The new Puppetfile output
   */
  async execute(
    @param({
      required: true,
      description: 'Absolute location of Puppetfile to parse/edit',
    })
    puppetfile: string,
    options: ResolveOptions
  ): Promise<string> {
    log.methodFactory = (methodName, logLevel, loggerName) => {
      return (message) => {
        console.error(`${new Date().toISOString()} [${methodName.toUpperCase()}] (${String(loggerName)}) ${message}`)
      }
    }
    log.setDefaultLevel(options.loglevel as LogLevelDesc)
    const logger = log.getLogger('ResolveCommand')
    logger.debug('Starting resolve command')

    const hideList: Array<string> = []
    if (options.hideFile !== '') {
      logger.debug('Reading hide file')
      hideList.push(...(await this._readInFile(options.hideFile)))
    }

    const ignoreList: Array<string> = []
    if (options.ignoreFile !== '') {
      ignoreList.push(...(await this._readInFile(options.ignoreFile)))
    }

    let preamble = ''
    if (options.preambleFile !== '') {
      preamble = await readFile(options.preambleFile, { encoding: 'utf-8' })
    }

    try {
      const newPuppetFile = await new DependencyResolver()
        .withPuppetFile((await new PuppetFile().fromFilePath(puppetfile)).withPreamble(preamble))
        .withHideList(hideList)
        .withIgnoreList(ignoreList)
        .resolve()
      return newPuppetFile.toText()
    } catch (e) {
      log.error(
        `Error "${e}" occured. Dumping database to errorDump.js. Use flatted to import and analyze the serialized version.`
      )
      await writeFile(
        'errorDump.js',
        stringify({
          forgeCache: ForgeCache.factory('').getErrorInformation(),
          dependencyGraph: DependencyGraph.factory().graph.export(),
        })
      )
      process.exit(1)
    }
  }

  /**
   * Read in a simple text file, skipping empty and comment lines
   *
   * @param filePath the path to the file to read
   * @returns the contents of the file
   */
  private async _readInFile(filePath: string): Promise<Array<string>> {
    const fileContent = await readFile(filePath, { encoding: 'utf-8' })
    const parsedContent = []
    for (const line of fileContent.split(/\n/)) {
      if (line.match(/^$/ || line.match(/^\s*#.+$/))) {
        continue
      }
      parsedContent.push(line.trim())
    }
    return parsedContent
  }
}
