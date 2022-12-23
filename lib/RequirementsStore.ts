import { PuppetFile } from './PuppetFile'
import { Requirement, RequirementSource } from './Requirement'
import { getLogger, Logger } from 'loglevel'
import { Range } from 'semver'

/**
 * A cache to store and retrieve requirements during resolving dependencies
 */
export class RequirementsStore {
  /**
   * The logger to use
   */
  private _log: Logger = getLogger('DependencyResolver')

  private _requirements: Array<Requirement> = []
  private _puppetfile?: PuppetFile

  /**
   * Fill the requirements based on the modules defined in the Puppetfile
   *
   * @param puppetfile The Puppetfile to
   * @returns the instance itself
   */
  public withPuppetFile(puppetfile: PuppetFile): RequirementsStore {
    this._puppetfile = puppetfile
    for (const module of this._puppetfile ? this._puppetfile.modules : []) {
      this.addRequirement(
        new Requirement()
          .withTargetModule(module)
          .withSource(RequirementSource.Puppetfile)
          .withDependencyRange(new Range(`=${module.version ?? ''}`))
      )
    }
    return this
  }

  /**
   * Add a new requirement
   *
   * @param requirement requirement to add
   */
  public addRequirement(requirement: Requirement) {
    this._requirements.push(requirement)
  }

  /**
   * Check if there are still requirements left
   *
   * @returns whether requirements still exist
   */
  public hasNextRequirement() {
    return this._requirements.length > 0
  }

  /**
   * Get next requirement
   *
   * @returns The next requirement (if it exists)
   */
  public getNextRequirement(): Requirement | undefined {
    return this._requirements.shift()
  }

  /**
   * Whether a Puppetfile requirement for the given target module exists
   *
   * @param slug Slug of the target module
   * @returns Whether the puppetfile already has that requirement
   */
  public hasPuppetfileRequirementWithTargetModule(slug: string): boolean {
    return this._requirements.some(
      (value) => value.source === RequirementSource.Puppetfile && value.targetModule?.getSlug() === slug
    )
  }

  /**
   * Update the target version of the given target module
   *
   * @param slug Slug of the target module
   * @param version Version to set
   */
  public updateTargetVersion(slug: string, version: string) {
    for (const requirement of this._requirements.filter((value) => value.targetModule?.getSlug() === slug)) {
      if (requirement.targetModule) {
        this._log.debug(`Updated target version of requirement ${requirement.getDescription()}) to ${version}`)
        requirement.targetModule.version = version
      }
    }
  }

  /**
   * Remove requirements that have the given source module set
   *
   * @param sourceSlug Slug of the source module to remove
   */
  public deleteSourceRequirements(sourceSlug: string) {
    this._requirements = this._requirements.filter(
      (value) => value.sourceModule && value.sourceModule.getSlug() !== sourceSlug
    )
  }
}
