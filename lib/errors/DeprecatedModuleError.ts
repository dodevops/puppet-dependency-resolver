import { DeprecationStatus } from '../DeprecationStatus'

/**
 * A module was deprecated
 */
export class DeprecatedModuleError extends Error {
  /**
   * @param slug The slug of the deprecated method
   * @param deprecationStatus The deprecation status
   */
  constructor(slug: string, deprecationStatus: DeprecationStatus) {
    super()
    this.message = `Module ${slug} is deprecated: ${deprecationStatus}`
  }
}
