import { Requirement } from '../Requirement'

/**
 * No possible version was found
 */
export class NoVersionFoundError extends Error {
  /**
   * @param dependency The requirement resulting in this error
   */
  constructor(dependency: Requirement) {
    super()
    this.message = `No possible version for requirement ${dependency.sourceModule?.getSlug()} => ${dependency.targetModule?.getSlug()} (${
      dependency.dependencyRange?.range
    })`
  }
}
