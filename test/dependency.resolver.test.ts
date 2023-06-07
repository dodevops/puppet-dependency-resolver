import { Stubborn } from 'stubborn-ws'
import tmp from 'tmp-promise'
import simpleGit from 'simple-git'
import { writeFile } from 'fs/promises'
import path from 'path'
import { PuppetFile } from '../lib/PuppetFile'
import { DependencyResolver } from '../lib/DependencyResolver'
import { expect } from '@jest/globals'
import { DependencyGraph } from '../lib/DependencyGraph'
import { ForgeCache } from '../lib/ForgeCache'

jest.setTimeout(999999999)
const sb = new Stubborn()

let tmpDir: tmp.DirectoryResult

beforeAll(async () => {
  await sb.start()
})

afterAll(async () => {
  await sb.stop()
})

describe('The dependency resolver', function () {
  beforeEach(async () => {
    DependencyGraph.clearGraph()
    ForgeCache.clearCache()

    sb.get('/v3/releases/test-default-1.2.3').setResponseBody({
      slug: 'test-default',
      metadata: {
        dependencies: [
          {
            name: 'test/defaultdependency',
            version_requirement: '>= 1.2.4',
          },
        ],
      },
    })
    sb.get('/v3/releases/test-defaultdependency-1.2.5').setResponseBody({
      slug: 'test-defaultdependency',
      metadata: {
        dependencies: [],
      },
    })
    sb.get('/v3/releases/test-wrongdepa-1.2.3').setResponseBody({
      slug: 'test-defaultdependency',
      metadata: {
        dependencies: [
          {
            name: 'test/wrongdepc',
            version_requirement: '>=1.2.3',
          },
        ],
      },
    })
    sb.get('/v3/releases/test-wrongdepb-1.2.3').setResponseBody({
      slug: 'test-defaultdependency',
      metadata: {
        dependencies: [
          {
            name: 'test/wrongdepc',
            version_requirement: '<1.2.3',
          },
        ],
      },
    })
    sb.get('/v3/releases/test-wrongdepc-1.2.3').setResponseBody({
      slug: 'test-defaultdependency',
      metadata: {
        dependencies: [],
      },
    })
    sb.get('/v3/releases/test-deprecated-1.2.3').setResponseBody({
      slug: 'test-deprecated',
      metadata: {
        dependencies: [],
      },
    })
    sb.get('/v3/modules/test-default').setResponseBody({
      slug: 'test-default',
      releases: [
        {
          version: '1.2.3',
        },
      ],
    })
    sb.get('/v3/modules/test-defaultdependency').setResponseBody({
      slug: 'test-defaultdependency',
      releases: [
        {
          version: '1.2.5',
        },
      ],
    })
    sb.get('/v3/modules/test-dependency').setResponseBody({
      slug: 'test-default',
      releases: [
        {
          version: '1.2.4',
        },
      ],
    })
    sb.get('/v3/modules/test-wrongdepa').setResponseBody({
      slug: 'test-wrongdepa',
      releases: [
        {
          version: '1.2.3',
        },
      ],
    })
    sb.get('/v3/modules/test-wrongdepb').setResponseBody({
      slug: 'test-wrongdepa',
      releases: [
        {
          version: '1.2.3',
        },
      ],
    })
    sb.get('/v3/modules/test-wrongdepc').setResponseBody({
      slug: 'test-wrongdepc',
      releases: [
        {
          version: '1.2.3',
        },
      ],
    })
    sb.get('/v3/modules/test-deprecated').setResponseBody({
      slug: 'test-deprecated',
      releases: [
        {
          version: '1.2.3',
        },
      ],
      deprecated_at: new Date(2021, 29, 12, 14, 14, 0, 0).toISOString(),
      deprecated_for: 'some reason',
      superseded_by: {
        slug: 'other-module',
      },
    })
    tmpDir = await tmp.dir({
      unsafeCleanup: true,
    })
    const git = simpleGit(tmpDir.path, {
      config: ['user.email=test@test.com', 'user.name=Tester', 'init.defaultBranch=main'],
    })
    await git.init()
    await writeFile(
      path.join(tmpDir.path, 'metadata.json'),
      `
{
  "version": "0.1.2"
}
    `
    )
    await git.add(path.join(tmpDir.path, 'metadata.json'))
    await git.commit('Added metadata')
    await git.checkoutBranch('test', 'main')
  })

  afterEach(() => {
    tmpDir.cleanup()
  })

  it('should create a valid puppetfile', async () => {
    const subject = await new DependencyResolver()
      .withPuppetFile(
        await new PuppetFile().fromText(`
forge 'http://localhost:${sb.getPort()}'

mod 'test-default', '1.2.3'

## dependencies

mod 'test-dependency', '1.2.4'
    `)
      )
      .resolve()
    expect(subject.modules).toHaveLength(1)
    expect(subject.modules[0].getSlug()).toEqual('test-default')
    expect(subject.modules[0].version).toEqual('1.2.3')
    expect(subject.dependentModules).toHaveLength(1)
    expect(subject.dependentModules[0].getSlug()).toEqual('test-defaultdependency')
    expect(subject.dependentModules[0].version).toEqual('1.2.5')
  })

  it('should hide items from the puppetfile', async () => {
    const subject = await new DependencyResolver()
      .withPuppetFile(
        await new PuppetFile().fromText(`
forge 'http://localhost:${sb.getPort()}'

mod 'test-default', '1.2.3'

## dependencies

mod 'test-dependency', '1.2.4'
    `)
      )
      .withHideList(['test-default'])
      .resolve()
    expect(subject.modules).toHaveLength(0)
    expect(subject.dependentModules).toHaveLength(1)
    expect(subject.dependentModules[0].getSlug()).toEqual('test-defaultdependency')
    expect(subject.dependentModules[0].version).toEqual('1.2.5')
  })

  it('should throw on invalid dependencies', async () => {
    await expect(
      new DependencyResolver()
        .withPuppetFile(
          await new PuppetFile().fromText(`
forge 'http://localhost:${sb.getPort()}'

mod 'test-wrongdepa', '1.2.3'
mod 'test-wrongdepb', '1.2.3'
    `)
        )
        .resolve()
    ).rejects.toMatchObject({
      message: 'No possible version for requirement test-wrongdepb => test-wrongdepc (<1.2.3)',
    })
  })

  it('should not throw on invalid dependencies if the module is ignored', async () => {
    await expect(
      new DependencyResolver()
        .withPuppetFile(
          await new PuppetFile().fromText(`
forge 'http://localhost:${sb.getPort()}'

mod 'test-wrongdepa', '1.2.3'
mod 'test-wrongdepb', '1.2.3'
    `)
        )
        .withIgnoreList(['test-wrongdepc'])
        .resolve()
    ).resolves.toBeInstanceOf(PuppetFile)
  })

  it('should throw on deprecated dependencies', async () => {
    await expect(
      new DependencyResolver()
        .withPuppetFile(
          await new PuppetFile().fromText(`
forge 'http://localhost:${sb.getPort()}'

mod 'test-deprecated', '1.2.3'
    `)
        )
        .resolve()
    ).rejects.toMatchObject({
      message: `Module test-deprecated is deprecated: Module was deprecated at ${new Date(
        2021,
        29,
        12,
        14,
        14,
        0,
        0
      ).toISOString()} by other-module: some reason`,
    })
  })

  it('should not throw on deprecated dependencies with an ignored module', async () => {
    await expect(
      new DependencyResolver()
        .withPuppetFile(
          await new PuppetFile().fromText(`
forge 'http://localhost:${sb.getPort()}'

mod 'test-deprecated', '1.2.3'
    `)
        )
        .withIgnoreList(['test-deprecated'])
        .resolve()
    ).resolves.toBeInstanceOf(PuppetFile)
  })

  it('should throw on a wrong dependency of a module that is included as a dependency', async () => {
    const subject = await new DependencyResolver().withPuppetFile(
      await new PuppetFile().fromText(`
forge 'http://localhost:${sb.getPort()}'

mod 'test-wrongdepa', '1.2.3'
mod 'test-wrongdepc', '1.2.3'
    `)
    )

    await expect(subject.resolve()).rejects.toMatchObject({
      message: 'No possible version for requirement test-wrongdepc: >=1.2.3',
    })
  })

  it('should not throw on a wrong dependency of a module that is included as a dependency but ignored', async () => {
    const subject = await new DependencyResolver()
      .withPuppetFile(
        await new PuppetFile().fromText(`
forge 'http://localhost:${sb.getPort()}'

mod 'test-wrongdepa', '1.2.3'
mod 'test-wrongdepc', '1.2.3'
    `)
      )
      .withIgnoreList(['test-wrongdepc'])

    await expect(subject.resolve()).resolves.toBeInstanceOf(PuppetFile)
  })
})
