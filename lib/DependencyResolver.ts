import { RequirementsStore } from './RequirementsStore'
import { PuppetFile } from './PuppetFile'
import { getLogger, Logger } from 'loglevel'
import { DependencyGraph } from './DependencyGraph'
import { Requirement, RequirementSource } from './Requirement'
import { ModuleDeclaration } from './ModuleDeclaration'
import { NoVersionFoundError } from './errors/NoVersionFoundError'
import { DeprecatedModuleError } from './errors/DeprecatedModuleError'
import { DeprecationStatus } from './DeprecationStatus'

/**
 * The main workflow resolving dependencies from the Puppetfile
 */
export class DependencyResolver {
  /**
   * The logger to use
   */
  private _log: Logger = getLogger('DependencyResolver')

  /**
   * The open requirements
   */
  private _store?: RequirementsStore

  /**
   * The source puppetfile
   */
  private _sourcePuppetfile?: PuppetFile

  /**
   * A list of slugs for which errors should be ignored
   */
  private _ignoreList: Array<string> = []

  /**
   * A list of slugs to hide from the final puppet file
   */
  private _hideList: Array<string> = []

  /**
   * Add a Puppetfile from a filepath
   *
   * @param puppetfile Puppetfile The puppetfile to set
   * @returns the instance itself
   */
  public withPuppetFile(puppetfile: PuppetFile): DependencyResolver {
    this._sourcePuppetfile = puppetfile
    this._store = new RequirementsStore().withPuppetFile(puppetfile)
    return this
  }

  /**
   * Set the value for _hideList and return yourself
   *
   * @param value The value to set
   * @returns the instance itself
   */
  public withHideList(value: Array<string>) {
    this._hideList = value
    return this
  }

  /**
   * Set the value for _ignoreList and return yourself
   *
   * @param value The value to set
   * @returns the instance itself
   */
  public withIgnoreList(value: Array<string>) {
    this._ignoreList = value
    return this
  }

  /**
   * Resolve the dependencies of the configured puppet file and return a new Puppetfile object.
   *
   * @returns A Puppetfile with resolved dependencies
   */
  public async resolve(): Promise<PuppetFile> {
    if (!this._store) {
      throw `Store wasn't initialized.`
    }

    const graph = DependencyGraph.factory()
    const resultPuppetfile = new PuppetFile().withPreamble(this._sourcePuppetfile?.preamble ?? '')
    resultPuppetfile.forge = this._sourcePuppetfile?.forge ?? PuppetFile.DEFAULT_FORGE

    this._log.debug(`Resolving the requirements`)

    while (this._store.hasNextRequirement() ?? false) {
      const requirement = this._store.getNextRequirement()
      if (requirement?.isValid() && requirement?.targetModule) {
        this._log.trace(`Checking requirement ${requirement.getDescription()}`)

        if (requirement.sourceModule) {
          await this._checkDeprecationStatus(requirement.sourceModule)
        }
        await this._checkDeprecationStatus(requirement.targetModule)

        this._addToGraph(requirement)

        this._log.debug(
          `Testing if the version ${
            requirement.targetModule?.version
          } of ${requirement.targetModule?.getSlug()} satisfies all requirements`
        )
        const oldVersion = requirement.targetModule.version
        let newVersion
        try {
          newVersion = await requirement.getNewVersion()
        } catch (e) {
          if (
            e instanceof NoVersionFoundError &&
            this._ignoreList.some((slug) => slug === requirement.targetModule?.getSlug())
          ) {
            this._log.warn(`${e.message}, but module is ignored. Continuing`)
            continue
          }
          throw e
        }

        await this._checkVersion(requirement.targetModule, oldVersion ?? '', newVersion)
      }
    }

    this._log.debug('Dumping graph to puppetfile')

    graph.graph.forEachNode((nodeId, attributes) => {
      if (!this._hideList.some((slug) => slug === nodeId)) {
        const author = nodeId.split(/-/)[0]
        const name = nodeId.split(/-/)[1]
        if (
          (this._sourcePuppetfile?.hasModule(author, name) ||
            graph.graph.someInEdge(nodeId, (edgeId, edgeAttributes) => {
              return edgeAttributes[Requirement.PROPERTY_SOURCE] === RequirementSource.Puppetfile
            })) &&
          !(attributes['module'] in resultPuppetfile.modules)
        ) {
          resultPuppetfile.modules.push(attributes['module'])
        } else if (nodeId !== 'puppetfile' && !(attributes['module'] in resultPuppetfile.dependentModules)) {
          resultPuppetfile.dependentModules.push(attributes['module'])
        }
      }
    })

    return resultPuppetfile
  }

  /**
   * Add the parts of the given requirement to the graph, if they don't exist
   *
   * @param requirement The requirement to add
   */
  private _addToGraph(requirement: Requirement) {
    const graph = DependencyGraph.factory()
    if (
      requirement.source == RequirementSource.Dependency &&
      !graph.graph.hasNode(requirement.sourceModule?.getSlug())
    ) {
      this._log.debug(`Adding source module to the dependency graph`)
      graph.graph.addNode(requirement.sourceModule?.getSlug(), {
        module: requirement.sourceModule,
      })
    } else if (requirement.source == RequirementSource.Puppetfile && !graph.graph.hasNode('puppetfile')) {
      graph.graph.addNode('puppetfile')
    }

    if (!graph.graph.hasNode(requirement.targetModule?.getSlug())) {
      this._log.debug(`Adding target module ${requirement.targetModule?.getSlug()} to the dependency graph`)
      graph.graph.addNode(requirement.targetModule?.getSlug(), {
        module: requirement.targetModule,
      })
    }

    const sourceKey = requirement.sourceModule?.getSlug() ?? 'puppetfile'

    if (!graph.graph.hasEdge(`${sourceKey}.${requirement.targetModule?.getSlug()}`)) {
      this._log.debug(`Adding dependency ${requirement.getDescription()} to the graph`)
      graph.graph.addDirectedEdgeWithKey(
        requirement.getEdgeId(),
        sourceKey,
        requirement.targetModule?.getSlug(),
        requirement.getEdgeAttributes()
      )
    }
  }

  /**
   * Check whether the given module is deprecated
   *
   * @param module Module to check
   */
  private async _checkDeprecationStatus(module: ModuleDeclaration) {
    if ((await module.getDeprecationStatus()) !== null) {
      const error = new DeprecatedModuleError(module.getSlug(), <DeprecationStatus>await module.getDeprecationStatus())
      const requirementSlug = module.getSlug()
      if (this._ignoreList.some((slug) => slug === requirementSlug)) {
        this._log.warn(`${error.message}, but module is ignored. Continuing`)
      } else {
        throw error
      }
    }
  }

  /**
   * Handle possible version changes. If no change occured add the dependencies of the target module to the requirement
   * store. If the version changed, remove the existing dependencies and re-add the target module and all its
   * dependencies in the new version to the requirement store.
   *
   * @param targetModule The module to handle
   * @param oldVersion The old version of the module
   * @param newVersion The (possibly) new version of the module
   */
  private async _checkVersion(targetModule: ModuleDeclaration, oldVersion: string, newVersion: string) {
    if (!this._store) {
      throw `Store wasn't initialized.`
    }
    const graph = DependencyGraph.factory()
    if (newVersion === oldVersion) {
      this._log.debug(
        `Current version meets requirements. Adding possible dependencies of the ${targetModule.getSlug()} to the requirements store`
      )
      for (const dependency of (await targetModule.getDependencies()) ?? []) {
        if (dependency.isValid() && dependency.targetModule && dependency.dependencyRange) {
          this._log.debug(`Adding dependency ${dependency.getDescription()}`)
          if (graph.graph.hasNode(dependency.targetModule.getSlug()) && graph.isValid(dependency.targetModule)) {
            const existingModule = graph.graph.getNodeAttribute(
              dependency.targetModule.getSlug(),
              'module'
            ) as ModuleDeclaration
            this._log.debug(
              `Dependency ${existingModule.getSlug()} is already in the graph in version ${
                existingModule.version
              }. Using that`
            )
            dependency.targetModule = existingModule
          } else {
            this._log.debug(`Adding requirement for dependency to ${dependency.targetModule.getSlug()}`)
            this._store.addRequirement(
              new Requirement()
                .withSource(RequirementSource.Dependency)
                .withSourceModule(targetModule)
                .withTargetModule(dependency.targetModule)
                .withDependencyRange(dependency.dependencyRange)
            )
          }
        }
      }
    } else {
      targetModule.version = newVersion
      this._log.debug(
        `Current version does not meet current requirements. Lowering the version of the ${targetModule.getSlug()} to ${newVersion} and reevaluating.`
      )
      this._log.debug(`Updating target version in current requirements for ${targetModule.getSlug()}`)
      this._store.updateTargetVersion(targetModule.getSlug(), newVersion)

      this._log.debug(`Cleaning sole dependencies of ${targetModule.getSlug()} from dependency tree`)
      graph.graph.forEachOutEdge(targetModule.getSlug(), (edgeId, attributes, source, target) => {
        if (!graph.graph.someInEdge(target, (edgeId, attributes, edgeSource) => source !== edgeSource)) {
          graph.graph.dropNode(target)
        }
      })

      this._log.debug(`Removing existing requirements of ${targetModule.getSlug()} from the store`)
      this._store.deleteSourceRequirements(targetModule.getSlug())

      this._log.debug('Readding existing requirements to the target module to the store')
      for (const edge of graph.graph.inEdges(targetModule.getSlug())) {
        const edgeAttributes = graph.graph.getEdgeAttributes(edge)
        this._store?.addRequirement(
          new Requirement()
            .withSource(RequirementSource.Dependency)
            .withSourceModule(edgeAttributes[Requirement.PROPERTY_SOURCE_MODULE])
            .withTargetModule(targetModule)
            .withDependencyRange(edgeAttributes[Requirement.PROPERTY_DEPENDENCY_RANGE])
        )
      }
      this._log.debug('Dropping existing node')
      graph.graph.dropNode(targetModule.getSlug())
    }
  }
}
