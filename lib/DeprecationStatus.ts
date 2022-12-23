/**
 * The status of the deprecation of a module
 */
export class DeprecationStatus {
  /**
   * When was the module deprecated?
   */
  deprecatedAt?: Date

  /**
   * What was the cause of the deprecation?
   */
  deprecatedFor?: string

  /**
   * What other module superseded this module?
   */
  supersededBy?: string

  /**
   * Set the value for deprecatedFor and return yourself
   *
   * @param value The value to set
   * @returns the instance itself
   */
  public withDeprecatedFor(value: string) {
    this.deprecatedFor = value
    return this
  }

  /**
   * Set the value for deprecatedAt and return yourself
   *
   * @param value The value to set
   * @returns the instance itself
   */
  public withDeprecatedAt(value: Date) {
    this.deprecatedAt = value
    return this
  }

  /**
   * Set the value for supersededBy and return yourself
   *
   * @param value The value to set
   * @returns the instance itself
   */
  public withSupersededBy(value: string) {
    this.supersededBy = value
    return this
  }

  /**
   * Generate a description of this deprecation status
   *
   * @returns the description
   */
  public toString(): string {
    return `Module was deprecated at ${this.deprecatedAt?.toISOString()} by ${this.supersededBy}: ${this.deprecatedFor}`
  }
}
