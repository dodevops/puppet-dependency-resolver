import { RequirementsStore } from '../lib/RequirementsStore'
import { PuppetFile } from '../lib/PuppetFile'
import { expect } from '@jest/globals'
import { Requirement, RequirementSource } from '../lib/Requirement'
import tmp from 'tmp-promise'
import simpleGit from 'simple-git'
import { writeFile } from 'fs/promises'
import path from 'path'
import { Stubborn } from 'stubborn-ws'
import { ModuleDeclaration } from '../lib/ModuleDeclaration'
import { Range } from 'semver'

const sb = new Stubborn()

let tmpDir: tmp.DirectoryResult

beforeAll(async () => {
  await sb.start()
})

afterAll(async () => {
  await sb.stop()
})

describe('The requirements store', function () {
  beforeEach(async () => {
    sb.get('/v3/releases/test-test1-1.2.3').setResponseBody({
      slug: 'test-test',
      metadata: {
        dependencies: [],
      },
    })
    sb.get('/v3/releases/test-test2-1.2.4').setResponseBody({
      slug: 'test-test2',
      metadata: {
        dependencies: [],
      },
    })
    sb.get('/v3/modules/test-test1').setResponseBody({
      slug: 'test-test',
      releases: [
        {
          version: '1.2.3',
        },
      ],
    })
    sb.get('/v3/modules/test-test2').setResponseBody({
      slug: 'test-test2',
      releases: [
        {
          version: '1.2.4',
        },
      ],
    })
    sb.get('/v3/modules/test-dependency').setResponseBody({
      slug: 'test-newline',
      releases: [
        {
          version: '1.2.4',
        },
      ],
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

  it('should load a puppetfile correctly', async () => {
    const subject = new RequirementsStore().withPuppetFile(
      await new PuppetFile().fromText(`
forge 'http://localhost:${sb.getPort()}'

mod 'test-test1', '1.2.3'

mod 'test-test2', '1.2.4'

mod 'test-git', :git => '${tmpDir.path}',
  :ref => 'test'

## dependencies

mod 'test-dependency', '1.2.4'
        `)
    )
    expect(subject.hasNextRequirement()).toBeTruthy()
    let nextRequirement = subject.getNextRequirement()
    expect(nextRequirement?.source).toEqual(RequirementSource.Puppetfile)
    expect(nextRequirement?.targetModule?.name).toEqual('test1')
    expect(nextRequirement?.targetModule?.author).toEqual('test')
    expect(nextRequirement?.targetModule?.version).toEqual('1.2.3')
    expect(nextRequirement?.dependencyRange?.range).toEqual('1.2.3')
    expect(subject.hasNextRequirement()).toBeTruthy()
    nextRequirement = subject.getNextRequirement()
    expect(nextRequirement?.source).toEqual(RequirementSource.Puppetfile)
    expect(nextRequirement?.targetModule?.name).toEqual('test2')
    expect(nextRequirement?.targetModule?.author).toEqual('test')
    expect(nextRequirement?.targetModule?.version).toEqual('1.2.4')
    expect(nextRequirement?.dependencyRange?.range).toEqual('1.2.4')
    expect(subject.hasNextRequirement()).toBeTruthy()
    nextRequirement = subject.getNextRequirement()
    expect(nextRequirement?.source).toEqual(RequirementSource.Puppetfile)
    expect(nextRequirement?.targetModule?.name).toEqual('git')
    expect(nextRequirement?.targetModule?.author).toEqual('test')
    expect(nextRequirement?.targetModule?.version).toEqual('0.1.2')
    expect(nextRequirement?.dependencyRange?.range).toEqual('0.1.2')
    expect(subject.hasNextRequirement()).toBeFalsy()
  })
  it('should allow to add a requirement', async () => {
    const subject = new RequirementsStore()
    subject.addRequirement(
      new Requirement()
        .withSource(RequirementSource.Dependency)
        .withSourceModule(
          await new ModuleDeclaration()
            .withForgeApiUrl(`http://localhost:${sb.getPort()}`)
            .fromText("mod 'test-test1', '1.2.3'")
        )
        .withTargetModule(
          await new ModuleDeclaration()
            .withForgeApiUrl(`http://localhost:${sb.getPort()}`)
            .fromText("mod 'test-test2', '1.2.4'")
        )
        .withDependencyRange(new Range('>=1.2.4'))
    )
    expect(subject.hasNextRequirement()).toBeTruthy()
    const nextRequirement = subject.getNextRequirement()
    expect(nextRequirement?.source).toEqual(RequirementSource.Dependency)
    expect(nextRequirement?.sourceModule?.name).toEqual('test1')
    expect(nextRequirement?.sourceModule?.author).toEqual('test')
    expect(nextRequirement?.targetModule?.name).toEqual('test2')
    expect(nextRequirement?.targetModule?.author).toEqual('test')
    expect(nextRequirement?.dependencyRange?.range).toEqual('>=1.2.4')
    expect(subject.hasNextRequirement()).toBeFalsy()
  })
})
