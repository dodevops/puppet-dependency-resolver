import { default as axios } from 'axios'
import { ForgeDependency } from './ForgeDependency'
import { getLogger, Logger } from 'loglevel'
import { DeprecationStatus } from './DeprecationStatus'

/**
 * A cache for requests to the Puppet Forge
 */
export class ForgeCache {
  /**
   * The singleton instance
   */
  private static _cache?: ForgeCache

  /**
   * Logger
   */
  private _log: Logger = getLogger('Requirement')

  /**
   * The URL to the Puppet Forge
   */
  private _forgeApiUrl?: string

  /**
   * A list of available releases per module slug
   */
  private _releases: Record<string, Array<string>> = {}

  /**
   * The information data for a module from the Puppet forge
   */
  private _forgeModuleData: Record<string, never> = {}

  /**
   * The dependencies of a module
   */
  private _dependencies: Record<string, Array<ForgeDependency>> = {}

  /**
   * Return the ForgeCache singleton
   *
   * @param forgeApiUrl The URL of the forge to use
   * @returns the singleton
   */
  public static factory(forgeApiUrl: string): ForgeCache {
    if (!this._cache) {
      this._cache = new ForgeCache().withForgeApiUrl(forgeApiUrl)
    }

    return this._cache
  }

  /**
   * Clear the forge cache (used in tests)
   */
  public static clearCache() {
    this._cache = undefined
  }

  /**
   * Set the value for _forgeUrl and return yourself
   *
   * @param value The value to set
   * @returns the instance itself
   */
  public withForgeApiUrl(value: string) {
    this._forgeApiUrl = value
    return this
  }

  /**
   * Return all releases of a module
   *
   * @param author The author of the module
   * @param name The name of the module
   * @returns A list of release (version) numbers
   */
  public async getReleases(author: string, name: string): Promise<Array<string>> {
    const slug = `${author}-${name}`
    if (!(slug in this._releases)) {
      const moduleData = await this.getModuleData(author, name)
      this._releases[slug] = []
      if (moduleData.releases) {
        for (const release of moduleData['releases'] as Array<never>) {
          this._releases[slug].push(release['version'])
        }
      }
    } else {
      this._log.trace(`Returning release from cache for ${slug}`)
    }
    return this._releases[slug]
  }

  /**
   * Check whether a module is deprecated on the forge or return null if not.
   *
   * @param author The author of the module
   * @param name The name of the module
   * @returns The deprecation status object of the module or null if the module isn't deprecated
   */
  public async getDeprecationStatus(author: string, name: string): Promise<DeprecationStatus | null> {
    const moduleData = await this.getModuleData(author, name)
    if (moduleData['deprecated_at'] && new Date(moduleData['deprecated_at'])) {
      return new DeprecationStatus()
        .withDeprecatedAt(new Date(moduleData['deprecated_at']))
        .withDeprecatedFor(moduleData['deprecated_for'] ?? '')
        .withSupersededBy((moduleData['superseded_by'] ?? { slug: '' })['slug'])
    } else {
      return null
    }
  }

  /**
   * Get the module data from the forge
   *
   * @param author The author of the module
   * @param name The name of the module
   * @returns a plain object with data about the module
   */
  public async getModuleData(author: string, name: string): Promise<Record<string, never>> {
    const slug = `${author}-${name}`
    if (!(slug in this._forgeModuleData)) {
      this._log.trace(`Calling ${this._forgeApiUrl}/v3/modules/${slug}`)
      const response = await axios.get(`${this._forgeApiUrl}/v3/modules/${slug}`)
      this._forgeModuleData[slug] = response['data'] as never
    }
    return this._forgeModuleData[slug]
  }

  /**
   * Get the dependencies of a specific version of the module
   *
   * @param author The author of the module
   * @param name The name of the module
   * @param version The version of the module
   * @returns A list of dependency information
   */
  public async getDependencies(author: string, name: string, version: string): Promise<Array<ForgeDependency>> {
    const slug = `${author}-${name}-${version}`
    if (!(slug in this._dependencies)) {
      this._log.trace(`Calling ${this._forgeApiUrl}/v3/releases/${slug}`)
      const response = await axios.get(`${this._forgeApiUrl}/v3/releases/${author}-${name}-${version}`)
      this._dependencies[slug] = response.data.metadata.dependencies ?? []
    } else {
      this._log.trace(`Returning dependencies from cache for ${slug}`)
    }
    return this._dependencies[slug]
  }

  /**
   * Update the available releases based on a new array. This helps to reduce the available release after checking
   * that specific versions aren't usable because of the dependencies
   *
   * @param author Author of the module
   * @param name Name of the module
   * @param releases A list of valid releases
   */
  public updateAvailableReleases(author: string, name: string, releases: Array<string>) {
    this._log.debug(`Updating available releases for ${author}-${name}. Maximum version is now ${releases[0]}`)
    this._releases[`${author}-${name}`] = releases
  }

  /**
   * Return the current cache for the error dump
   *
   * @returns the current state of the cache
   */
  public getErrorInformation(): Record<string, Record<string, Array<string> | Array<ForgeDependency>>> {
    return {
      dependencies: this._dependencies,
      releases: this._releases,
      moduleData: this._forgeModuleData,
    }
  }
}
