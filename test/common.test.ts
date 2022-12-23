import { promisify } from 'util'
import { exec } from 'child_process'

describe('Running it with a module with dependencies', function () {
  jest.setTimeout(20000)
  it('should add the dependencies', async () => {
    let returnValue
    try {
      returnValue = await promisify(exec)('node ./main.js resolve ./test/assets/common/Puppetfile.dependencies')
    } catch (e) {
      expect(e).toBeNull()
    }
    expect(returnValue?.stdout).toContain('## dependencies')
    expect(returnValue?.stdout).toContain("mod 'puppetlabs-stdlib'")
  })
  it('should only log to stderr', async () => {
    let returnValue
    try {
      returnValue = await promisify(exec)(
        'node ./main.js resolve -l debug ./test/assets/common/Puppetfile.dependencies'
      )
    } catch (e) {
      expect(e).toBeNull()
    }
    expect(returnValue?.stderr).toContain('Starting resolve command')
    expect(returnValue?.stdout).not.toContain('Starting resolve command')
  })
  it('should support adding a preamble', async () => {
    let returnValue
    try {
      returnValue = await promisify(exec)(
        'node ./main.js resolve -l debug -p ./test/assets/common/Puppetfile.preamble ./test/assets/common/Puppetfile.dependencies'
      )
    } catch (e) {
      expect(e).toBeNull()
    }
    expect(returnValue?.stdout).toContain(`forge 'https://forgeapi.puppetlabs.com'

TEST
PREAMBLE`)
  })
})
