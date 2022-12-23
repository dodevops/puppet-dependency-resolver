/**
 * No possible version was found
 */
export class NoVersionFoundError extends Error {
  /**
   * @param requirementDescription The description of the requirement that resulted in this error
   */
  constructor(requirementDescription: string) {
    super()
    this.message = `No possible version for requirement ${requirementDescription}`
  }
}
