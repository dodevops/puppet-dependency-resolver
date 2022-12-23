/**
 * A dependency in the Puppet forge json
 */
export class ForgeDependency {
  /**
   * The name of a dependent module (actually a slug)
   */
  name?: string

  /**
   * The version requirement of the dependent module
   */
  version_requirement?: string
}
