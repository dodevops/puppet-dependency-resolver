import { DirectedGraph } from 'graphology'
import { getLogger, Logger } from 'loglevel'
import { ModuleDeclaration } from './ModuleDeclaration'
import { Requirement } from './Requirement'
import { satisfies, Range } from 'semver'

/**
 * A singleton handling the dependency graph
 */
export class DependencyGraph {
  /**
   * The dependency graph singleton
   */
  private static _dependencyGraph: DependencyGraph

  /**
   * The used graph
   */
  public graph: DirectedGraph

  /**
   * Logger
   */
  private _log: Logger = getLogger('DependencyGraph')

  constructor() {
    this.graph = new DirectedGraph()
  }

  /**
   * The graph factory method
   *
   * @returns The dependency graph singleton
   */
  public static factory(): DependencyGraph {
    if (!this._dependencyGraph) {
      this._dependencyGraph = new DependencyGraph()
    }
    return this._dependencyGraph
  }

  /**
   * Check whether the dependencies in the current graph are valid for the given node
   *
   * @param module Module to check
   * @returns whether the dependency graph is correct for the given module
   */
  public isValid(module: ModuleDeclaration): boolean {
    this._log.debug(`Checking validity of node ${module.getSlug()} according to the dependency graph`)
    return this.graph.everyInEdge(module.getSlug(), (edgeId, attributes, source) => {
      this._log.trace(
        `Checking dependency range ${attributes[Requirement.PROPERTY_DEPENDENCY_RANGE]} coming from ${source}`
      )
      const version = module.version
      if (!version) {
        return true
      }
      if (satisfies(version, attributes[Requirement.PROPERTY_DEPENDENCY_RANGE] as Range)) {
        this._log.trace('Dependency is satisfied')
        return true
      } else {
        this._log.trace('Dependency is NOT satisfied')
        return false
      }
    })
  }
}
