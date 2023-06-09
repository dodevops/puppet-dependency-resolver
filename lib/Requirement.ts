import { ModuleDeclaration } from './ModuleDeclaration'
import { DependencyGraph } from './DependencyGraph'
import { Attributes } from 'graphology-types'
import { getLogger, Logger } from 'loglevel'
import { NoVersionFoundError } from './errors/NoVersionFoundError'
import { Range } from 'semver'

export enum RequirementSource {
  Puppetfile,
  Dependency,
}

/**
 * A requirement from a source to a target based on a specific version dependency range
 */
export class Requirement implements Attributes {
  /**
   * The edge attribute's property for source
   */
  public static readonly PROPERTY_SOURCE = 'source'

  /**
   * The edge attribute's property for sourceModule
   */
  public static readonly PROPERTY_SOURCE_MODULE = 'sourceModule'

  /**
   * The edge attribute's property for targetModule
   */
  public static readonly PROPERTY_TARGET_MODULE = 'targetModule'

  /**
   * The edge attribute's property for dependencyRange
   */
  public static readonly PROPERTY_DEPENDENCY_RANGE = 'dependencyRange'

  /**
   * The declaration of the required module
   */
  public targetModule?: ModuleDeclaration

  /**
   * The declaration of the source module
   */
  public sourceModule?: ModuleDeclaration

  /**
   * The source where this declaration originated
   */
  public source?: RequirementSource

  /**
   * The semver dependency range for this dependency
   */
  public dependencyRange?: Range

  /**
   * Logger
   */
  private _log: Logger = getLogger('Requirement')

  /**
   * Add a module declaration
   *
   * @param declaration declaration of this requirement
   * @returns the instance itself
   */
  public withTargetModule(declaration: ModuleDeclaration): Requirement {
    this.targetModule = declaration
    if (declaration.version && !this.dependencyRange) {
      this.dependencyRange = new Range(`<= ${declaration.version}`)
    }

    return this
  }

  /**
   * Set the value for source and return yourself
   *
   * @param value The value to set
   * @returns the instance itself
   */
  public withSource(value: RequirementSource) {
    this.source = value
    return this
  }

  /**
   * Set the value for sourceModule and return yourself
   *
   * @param value The value to set
   * @returns the instance itself
   */
  public withSourceModule(value: ModuleDeclaration) {
    this.sourceModule = value
    return this
  }

  /**
   * Set the value for dependencyRange and return yourself
   *
   * @param value The value to set
   * @returns the instance itself
   */
  public withDependencyRange(value: Range) {
    this.dependencyRange = value
    return this
  }

  /**
   * Check if this requirement is defined correctly
   *
   * @returns Whether the requirement is valid
   */
  public isValid(): boolean {
    if (this.source === RequirementSource.Dependency && !this.sourceModule) {
      throw `Requirement has no source module`
    }
    if (!this.targetModule) {
      throw `Requirement has no target module`
    }
    if (!this.dependencyRange) {
      throw `Requirement has no dependency range`
    }
    return true
  }

  /**
   * Check whether the current graph satisfies this requirement with the current version of the target module. If not,
   * find a version that does and return that.
   *
   * @throws NoVersionFoundError no valid version could be found
   * @returns The new valid version
   */
  public async getNewVersion(): Promise<string> {
    const requirementDescription = `${
      this.sourceModule?.getSlug() ?? 'Puppetfile'
    } => ${this.targetModule?.getSlug()} (${this.dependencyRange})`
    this._log.debug(`Checking requirement ${requirementDescription} with version ${this.targetModule?.version}`)

    const graph = DependencyGraph.factory()

    if (this.targetModule && !graph.isValid(this.targetModule)) {
      this._log.debug(`Requirement could not be satisfied. Trying out other versions`)
      let solutionFound = false
      while (await this.targetModule.hasAvailableVersion()) {
        this.targetModule.version = await this.targetModule.getNextAvailableVersion()
        this._log.trace(`Trying out version ${this.targetModule.version} of ${this.targetModule.getSlug()}`)
        if (graph.isValid(this.targetModule) && this.targetModule.version) {
          this._log.debug(`Found new valid version ${this.targetModule.version} for ${this.targetModule.getSlug()}`)
          await this.targetModule.addAvailableVersion(this.targetModule.version)
          solutionFound = true
          break
        }
      }
      if (!solutionFound) {
        throw new NoVersionFoundError(this)
      }

      this._log.debug(`Found valid version. Dropping node from dependency tree and readding it to the requirements`)
    }

    if (this.targetModule) {
      return this.targetModule.version ?? ''
    }

    return ''
  }

  /**
   * Get attributes for the edge in the dependency graph for this requirement
   * Return the attributes used in the edge
   *
   * @returns The edge attributes
   */
  public getEdgeAttributes(): Record<string, ModuleDeclaration | string | RequirementSource | Range | undefined> {
    const attributes: Record<string, ModuleDeclaration | string | RequirementSource | Range | undefined> = {}
    attributes[Requirement.PROPERTY_SOURCE] = this.source
    attributes[Requirement.PROPERTY_SOURCE_MODULE] = this.sourceModule
    attributes[Requirement.PROPERTY_TARGET_MODULE] = this.targetModule
    attributes[Requirement.PROPERTY_DEPENDENCY_RANGE] = this.dependencyRange
    return attributes
  }

  /**
   * Calculate the ID of an edge for this requirement
   *
   * @returns the calculated edge id
   */
  public getEdgeId(): string {
    return `${
      this.source == RequirementSource.Puppetfile ? 'puppetfile' : this.sourceModule?.getSlug()
    }.${this.targetModule?.getSlug()}`
  }

  /**
   * Return a description of this requirement
   *
   * @returns The description
   */
  public getDescription(): string {
    return `${
      this.source === RequirementSource.Puppetfile ? 'Puppetfile' : this.sourceModule?.getSlug()
    } => ${this.targetModule?.getSlug()} (${this.dependencyRange})`
  }
}
