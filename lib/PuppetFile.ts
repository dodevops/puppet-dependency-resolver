import { ModuleDeclaration } from './ModuleDeclaration'
import * as fs from 'fs/promises'
import Handlebars from 'handlebars'

/**
 * A representation of a puppetfile
 */
export class PuppetFile {
  /**
   * The default URL of the Puppet forge if not given
   */
  public static readonly DEFAULT_FORGE = 'https://forgeapi.puppetlabs.com'

  /**
   * The required modules
   */
  public modules: Array<ModuleDeclaration> = []

  /**
   * The dependent modules
   */
  public dependentModules: Array<ModuleDeclaration> = []

  /**
   * The forge URL
   */
  public forge: string = PuppetFile.DEFAULT_FORGE

  /**
   * Additional text to put after the forge URL when generating a Puppetfile
   */
  public preamble = ''

  /**
   * A RegExp that matches the line where the dependencies start in the Puppetfile
   */
  private _dependencyIdentifier = '## dependencies'

  /**
   * Set the value for _dependencyIdentifier and return yourself
   *
   * @param value The value to set
   * @returns the instance itself
   */
  public withDependencyIdentifier(value: string) {
    this._dependencyIdentifier = value
    return this
  }

  /**
   * Set the value for preamble and return yourself
   *
   * @param value The value to set
   * @returns the instance itself
   */
  public withPreamble(value: string) {
    this.preamble = value
    return this
  }

  /**
   * Set the information of this based on a Puppetfile
   *
   * @param filePath Path to the Puppetfile
   * @returns the instance itself
   */
  public async fromFilePath(filePath: string): Promise<PuppetFile> {
    const text = await fs.readFile(filePath, {
      encoding: 'utf-8',
    })

    return this.fromText(text)
  }

  /**
   * Set the information of this based on the text from a Puppetfile
   *
   * @param text The Puppetfile text
   * @returns the instance itself
   */
  public async fromText(text: string): Promise<PuppetFile> {
    let currentDeclaration = ''
    let inDeclaration = false
    let inDependencies = false
    let currentComment: Array<string> = []
    const readingComment: Array<string> = []
    let matches
    const addToModules = async () => {
      if (inDeclaration && currentDeclaration !== '') {
        const newModule = (
          await new ModuleDeclaration().withForgeApiUrl(this.forge).fromText(currentDeclaration)
        ).withComments(currentComment)
        if (inDependencies) {
          this.dependentModules.push(newModule)
        } else {
          this.modules.push(newModule)
        }
      }
    }
    for (const line of text.split(/\r?\n/)) {
      if (line.match(/^mod/) || line.includes(this._dependencyIdentifier)) {
        await addToModules()

        currentComment = [...readingComment]
        readingComment.length = 0

        if (line.includes(this._dependencyIdentifier)) {
          inDependencies = true
          currentDeclaration = ''
          inDeclaration = false
        } else {
          inDeclaration = true
          currentDeclaration = line
        }
      } else if ((matches = line.match(/^\s*#\s*(?<comment>.*)$/)) && matches && matches.groups) {
        readingComment.push(matches.groups['comment'])
      } else if (line.match(/^\s*$/)) {
        readingComment.length = 0
      } else if (inDeclaration) {
        currentDeclaration += line
      } else if ((matches = line.match(/forge '(?<forge>[^']+)'/)) && matches && matches.groups) {
        this.forge = matches.groups['forge']
      }
    }

    await addToModules()
    return this
  }

  /**
   * Retrieve a module based on the author and name
   *
   * @param author The author of the module
   * @param name The name of the module
   * @returns The module
   */
  public getModule(author: string, name: string) {
    return this.modules.find((value) => value.author == author && value.name == name)
  }

  /**
   * Check if the given module is defined in this Puppetfile
   *
   * @param author The author of the module
   * @param name The name of the module
   * @returns Whether the module exists
   */
  public hasModule(author: string, name: string) {
    return this.modules.some((value) => value.author == author && value.name == name)
  }

  /**
   * Retrieve module from the list of dependencies in this Puppetfile based on the author and name
   *
   * @param author The author of the module
   * @param name The name of the module
   * @returns The module
   */
  public getDependentModule(author: string, name: string) {
    return this.dependentModules.find((value) => value.author == author && value.name == name)
  }

  /**
   * Compile a Puppetfile output from the information in this object
   *
   * @returns The Puppetfile text
   */
  public toText(): string {
    const sortByModuleName = (a: ModuleDeclaration, b: ModuleDeclaration) => {
      if (a.name < b.name) {
        return -1
      } else if (a.name > b.name) {
        return 1
      }
      return 0
    }
    return Handlebars.compile(`forge '{{ forge }}'

{{#if preamble}}
{{preamble}}

{{/if}}
# Git modules

{{#each gitModules}}
{{#each comments}}
# {{{this}}}
{{/each}}
mod '{{author}}-{{name}}',
    :git => '{{git}}'{{#if ref}},
    :ref => '{{ref}}'{{/if}}
{{#unless @last}}
    
{{/unless}}
{{/each}}

# Forge modules

{{#each forgeModules}}
{{#each comments}}
# {{{this}}}
{{/each}}
mod '{{author}}-{{name}}', '{{version}}'
{{#unless @last}}

{{/unless}}
{{/each}}

{{dependencyIdentifier}}

{{#each dependentModules}}
{{#each comments}}
# {{{this}}}
{{/each}}
mod '{{author}}-{{name}}', '{{version}}'{{#unless @last}}

{{/unless}}
{{/each}}`)({
      forge: this.forge,
      gitModules: this.modules
        .filter((value) => !value.forgeModule)
        .sort(sortByModuleName)
        .map((value) => {
          const retValue = {
            name: value.name,
            author: value.author,
            git: value.git,
            comments: value.comments,
            ref: '',
          }
          if (value.ref) {
            retValue['ref'] = value.ref
          }
          return retValue
        }),
      forgeModules: this.modules
        .filter((value) => value.forgeModule)
        .sort(sortByModuleName)
        .map((value) => {
          return {
            author: value.author,
            name: value.name,
            version: value.version,
            comments: value.comments,
          }
        }),
      dependentModules: this.dependentModules.sort(sortByModuleName).map((value) => {
        return {
          author: value.author,
          name: value.name,
          version: value.version,
          comments: value.comments,
        }
      }),
      dependencyIdentifier: this._dependencyIdentifier,
      preamble: this.preamble,
    })
  }
}
