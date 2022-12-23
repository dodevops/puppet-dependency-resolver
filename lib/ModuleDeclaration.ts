import { readFile, stat } from 'fs/promises'
import path from 'path'
import simpleGit from 'simple-git'
import tmp from 'tmp-promise'
import { Requirement, RequirementSource } from './Requirement'
import { getLogger, Logger } from 'loglevel'
import { PuppetFile } from './PuppetFile'
import { ForgeCache } from './ForgeCache'
import { DeprecationStatus } from './DeprecationStatus'
import { Range } from 'semver'

/**
 * The declaration of a Puppet module. It contains all relevant data and helper methods
 */
export class ModuleDeclaration {
  /**
   * The module name
   */
  public name = ''

  /**
   * The module author
   */
  public author = ''

  /**
   * Whether this module can be found in the Puppet Forge
   */
  public forgeModule = true

  /**
   * The module version (Required if forgeModule = true)
   */
  public version?: string

  /**
   * A git repository link (Required if forgeModule = false)
   */
  public git?: string

  /**
   * A git reference
   */
  public ref?: string

  /**
   * Comments from the Puppetfile
   */
  public comments?: Array<string>

  /**
   * A list of available versions
   */
  private _availableVersions: Array<string> = []

  /**
   * The URL to the forge API
   */
  private _forgeApiUrl?: string

  /**
   * The raw metadata fetched from the git repository
   */
  private _gitMetadata?: Record<string, string>

  /**
   * List of dependencies of this module declaration
   */
  private _dependencies?: Array<Requirement>

  /**
   * Logger to use
   */
  private _log: Logger = getLogger('ModuleDeclaration')

  /**
   * Fill in the information based on a module line from a puppetfile
   *
   * @param text The single line module this from the Puppetfile
   * @returns the instance itself
   */
  public async fromText(text: string): Promise<ModuleDeclaration> {
    this._log.debug(`Creating a module declaration from the text ${text}`)
    const moduleRegExp = /^mod '(?<author>[^-]+)[-/](?<name>[^']+)'(,\s*'(?<version>[^']+)')?/m
    const matches = text.match(moduleRegExp)
    if (!matches || !matches.groups) {
      throw `Invalid module declaration: ${text}`
    }
    this.name = matches.groups['name']
    this.author = matches.groups['author']

    const parameters: Record<string, string> = text
      .replace(moduleRegExp, '')
      .replace(/\s+/g, '')
      .split(',')
      .reduce((previousValue: Record<string, string>, currentValue) => {
        const [key, value] = currentValue.replace(/'/g, '').split(/=>/)
        previousValue[key] = value
        return previousValue
      }, {})

    if (':git' in parameters) {
      this.git = parameters[':git']
      if (':ref' in parameters) {
        this.ref = parameters[':ref']
      }
      this.forgeModule = false
      await this.fetchGitMetadata()
    }

    if (this.forgeModule) {
      if ('version' in matches.groups && matches.groups['version']) {
        this.version = matches.groups['version']
      } else {
        this.version = (await this.getAvailableVersions())[0]
      }
    }

    return this
  }

  /**
   * Set the forge api URL of this object
   *
   * @param forgeUrl The URL to the forge api
   * @returns the instance itself
   */
  public withForgeApiUrl(forgeUrl: string): ModuleDeclaration {
    this._forgeApiUrl = forgeUrl
    return this
  }

  /**
   * Set the value for dependencies and return yourself
   *
   * @param value The value to set
   * @returns the instance itself
   */
  public withDependencies(value: Array<Requirement>) {
    this._dependencies = value
    return this
  }

  /**
   * Get the dependencies of this module, if any
   *
   * @returns The dependencies
   */
  public async getDependencies(): Promise<Array<Requirement>> {
    if (this.forgeModule) {
      await this._buildForgeDependencies()
    } else {
      await this._buildGitDependencies()
    }

    return this._dependencies ?? []
  }

  /**
   * Set the value for availableVersions and return yourself
   *
   * @param value The value to set
   * @returns the instance itself
   */
  public withAvailableVersions(value: Array<string>) {
    this._availableVersions = value
    return this
  }

  /**
   * Fetch the metadata from the git repository
   *
   * @returns the raw metadata
   */
  public async fetchGitMetadata() {
    if (!this.git) {
      throw `About to fetch git metadata without a git setting`
    }
    const localTmp = await tmp.dir({ template: 'puppetgit-XXXXXX', unsafeCleanup: true })
    this._log.trace(`Cloning ${this.git} to ${localTmp.path}`)
    try {
      await simpleGit().clone(this.git, localTmp.path)
    } catch (e) {
      throw `Can not clone git repository: ${e}`
    }

    if (this.ref) {
      this._log.trace(`Checking out ref ${this.ref}`)
      try {
        await simpleGit(localTmp.path).checkout(this.ref)
      } catch (e) {
        throw `Can not checkout git reference: ${e}`
      }
    }
    try {
      await stat(path.join(localTmp.path, 'metadata.json'))
    } catch (e) {
      throw `Can't find metadata.json in repository ${this.git}`
    }

    this._log.trace(`Reading metadata file`)
    const metadataContent = await readFile(path.join(localTmp.path, 'metadata.json'), { encoding: 'utf-8' })
    this._gitMetadata = JSON.parse(metadataContent)

    if (!this._gitMetadata) {
      throw `Couldn't parse metadata json: ${metadataContent}`
    }

    if (!this.version && this._gitMetadata.version) {
      this.version = this._gitMetadata.version
      this._availableVersions = [this.version || '']
    }
  }

  /**
   * Set the value for name and return yourself
   *
   * @param value The value to set
   * @returns the instance itself
   */
  public withName(value: string) {
    this.name = value
    return this
  }

  /**
   * Set the value for author and return yourself
   *
   * @param value The value to set
   * @returns the instance itself
   */
  public withAuthor(value: string) {
    this.author = value
    return this
  }

  /**
   * Set the value for forgeModule and return yourself
   *
   * @param value The value to set
   * @returns the instance itself
   */
  public withForgeModule(value: boolean) {
    this.forgeModule = value
    return this
  }

  /**
   * Set the value for version and return yourself
   *
   * @param value The value to set
   * @returns the instance itself
   */
  public withVersion(value: string) {
    this.version = value
    return this
  }

  /**
   * Set the value for git and return yourself
   *
   * @param value The value to set
   * @returns the instance itself
   */
  public withGit(value: string) {
    this.git = value
    return this
  }

  /**
   * Set the value for ref and return yourself
   *
   * @param value The value to set
   * @returns the instance itself
   */
  public withRef(value: string) {
    this.ref = value
    return this
  }

  /**
   * Set the value for comments and return yourself
   *
   * @param value The value to set
   * @returns the instance itself
   */
  public withComments(value: Array<string>) {
    this.comments = [...value]
    return this
  }

  /**
   * Return the available versions of this module. Will be reduced throughout the dependency resolving to versions
   * still fitting the dependencies.
   *
   * @returns A list of versions
   */
  public async getAvailableVersions(): Promise<Array<string>> {
    if (!this._forgeApiUrl) {
      throw `Can not fetch versions. No forge API URL set.`
    }
    return ForgeCache.factory(this._forgeApiUrl).getReleases(this.author, this.name)
  }

  /**
   * Check if there are any available versions left
   *
   * @returns Whether there are any more available versions
   */
  public async hasAvailableVersion() {
    if (!this._forgeApiUrl) {
      throw `Can not fetch versions. No forge API URL set.`
    }
    return (await this.getAvailableVersions()).length > 0
  }

  /**
   * Get the next available version from the list
   *
   * @returns The next available versions
   */
  public async getNextAvailableVersion(): Promise<string | undefined> {
    if (!this._forgeApiUrl) {
      throw `Can not fetch versions. No forge API URL set.`
    }
    const versions = await this.getAvailableVersions()
    const newVersion = versions.shift()
    ForgeCache.factory(this._forgeApiUrl).updateAvailableReleases(this.author, this.name, versions)
    return newVersion
  }

  /**
   * Add an available version to the list of versions
   *
   * @param version The version to add
   */
  public async addAvailableVersion(version: string) {
    if (!this._forgeApiUrl) {
      throw `Can not fetch versions. No forge API URL set.`
    }
    const versions = await this.getAvailableVersions()
    versions.unshift(version)
    ForgeCache.factory(this._forgeApiUrl).updateAvailableReleases(this.author, this.name, versions)
  }

  /**
   * Check whether a module is deprecated on the forge or return null if not.
   *
   * @returns The deprecation status object of the module or null if the module isn't deprecated
   */
  public async getDeprecationStatus(): Promise<DeprecationStatus | null> {
    if (!this.forgeModule) {
      return null
    }
    if (!this._forgeApiUrl) {
      throw `Can not fetch versions. No forge API URL set.`
    }
    return ForgeCache.factory(this._forgeApiUrl).getDeprecationStatus(this.author, this.name)
  }

  /**
   * Return the slug of this module
   *
   * @returns The slug
   */
  public getSlug(): string {
    return `${this.author}-${this.name}`
  }

  /**
   * This is a forge module. Fetch the depencencies from the forge api
   *
   * @returns The dependencies
   */
  private async _buildForgeDependencies(): Promise<void> {
    const version = await this._getVersion()
    if (!this._forgeApiUrl) {
      throw `Can not fetch dependencies. No forge API URL set`
    }
    this._dependencies = await this._buildDependencies(
      await ForgeCache.factory(this._forgeApiUrl).getDependencies(this.author, this.name, version)
    )
  }

  /**
   * This is not a forge module. Fetch the dependencies from the git repo
   */
  private async _buildGitDependencies(): Promise<void> {
    if (!this._gitMetadata || !this._gitMetadata['dependencies']) {
      return
    }
    this._dependencies = await this._buildDependencies(this._gitMetadata['dependencies'])
  }

  /**
   * Build a list of Requirement objects out of a raw dependencies object from metadata.json or the Puppet Forge
   *
   * @param rawDependencies A simple JS object
   * @returns A list of parsed requirements
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async _buildDependencies(rawDependencies: any): Promise<Array<Requirement>> {
    const dependencies = []
    for (const dependency of rawDependencies) {
      const [author, name] = dependency.name.split(/[\/-]/)
      if (!('version_requirement' in dependency)) {
        dependency.version_requirement = ''
      }
      dependencies.push(
        new Requirement()
          .withSource(RequirementSource.Dependency)
          .withDependencyRange(new Range(dependency.version_requirement))
          .withSourceModule(this)
          .withTargetModule(
            await new ModuleDeclaration()
              .withForgeApiUrl(this._forgeApiUrl ?? PuppetFile.DEFAULT_FORGE)
              .fromText(`mod '${author}-${name}'`)
          )
      )
    }
    return dependencies
  }

  /**
   * Return the version or, if unset, the latest version from Puppet forge
   *
   * @returns set or latest version
   */
  private async _getVersion(): Promise<string> {
    if (this.version) {
      return this.version
    }
    if (!this._forgeApiUrl) {
      throw `Can not get version. No Forge API URL is set.`
    }
    return (await ForgeCache.factory(this._forgeApiUrl).getReleases(this.author, this.name))[0]
  }
}
