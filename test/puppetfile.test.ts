import { PuppetFile } from '../lib/PuppetFile'
import { Stubborn } from 'stubborn-ws'
import simpleGit from 'simple-git'
import tmp from 'tmp-promise'
import { writeFile } from 'fs/promises'
import path from 'path'

const sb = new Stubborn()

let tmpDir: tmp.DirectoryResult

beforeAll(async () => {
  await sb.start()
})

afterAll(async () => {
  await sb.stop()
})

describe('The PuppetFile parser', function () {
  beforeEach(async () => {
    sb.get('/v3/releases/test-default-1.2.3').setResponseBody({
      slug: 'test-default',
      metadata: {
        dependencies: [],
      },
    })
    sb.get('/v3/releases/test-newline-1.2.3').setResponseBody({
      slug: 'test-default',
      metadata: {
        dependencies: [],
      },
    })
    sb.get('/v3/modules/test-noversion').setResponseBody({
      slug: 'test-noversion',
      releases: [
        {
          version: '1.2.3',
        },
      ],
    })
    sb.get('/v3/modules/test-default').setResponseBody({
      slug: 'test-default',
      releases: [
        {
          version: '1.2.3',
        },
      ],
    })
    sb.get('/v3/modules/test-default2').setResponseBody({
      slug: 'test-default',
      releases: [
        {
          version: '1.2.3',
        },
      ],
    })
    sb.get('/v3/modules/test-newline').setResponseBody({
      slug: 'test-newline',
      releases: [
        {
          version: '1.2.3',
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

  it('returns a valid Puppetfile', async () => {
    const subject = await new PuppetFile().fromText(`
forge 'http://localhost:${sb.getPort()}'

mod 'test-default', '1.2.3'

mod 'test-noversion'

mod 'test-newline',
    '1.2.3'

mod 'test-git', :git => '${tmpDir.path}',
  :ref => 'test'

## dependencies

mod 'test-dependency', '1.2.4'
    `)
    expect(subject.forge).toEqual(`http://localhost:${sb.getPort()}`)
    expect(subject.modules).toHaveLength(4)

    expect(subject.getModule('test', 'default')).not.toBeNull()
    expect(subject.getModule('test', 'default')?.version).toEqual('1.2.3')
    expect(subject.getModule('test', 'default')?.forgeModule).toBeTruthy()

    expect(subject.getModule('test', 'noversion')).not.toBeNull()
    expect(subject.getModule('test', 'noversion')?.version).toEqual('1.2.3')
    expect(subject.getModule('test', 'noversion')?.forgeModule).toBeTruthy()

    expect(subject.getModule('test', 'newline')).not.toBeNull()
    expect(subject.getModule('test', 'newline')?.version).toEqual('1.2.3')
    expect(subject.getModule('test', 'newline')?.forgeModule).toBeTruthy()

    expect(subject.getModule('test', 'git')).not.toBeNull()
    expect(subject.getModule('test', 'git')?.version).toEqual('0.1.2')
    expect(subject.getModule('test', 'git')?.forgeModule).toBeFalsy()
    expect(subject.getModule('test', 'git')?.git).toEqual(tmpDir.path)
    expect(subject.getModule('test', 'git')?.ref).toEqual('test')

    expect(subject.dependentModules).toHaveLength(1)
    expect(subject.getDependentModule('test', 'dependency')).toBeDefined()
    expect(subject.getDependentModule('test', 'dependency')?.version).toEqual('1.2.4')
  })

  it('should work with another dependency indicator', async () => {
    const subject = await new PuppetFile().withDependencyIdentifier('## <<dependencies').fromText(`
forge 'http://localhost:${sb.getPort()}'

mod 'test-default', '1.2.3'

mod 'test-noversion'

mod 'test-newline',
    '1.2.3'

mod 'test-git', :git => '${tmpDir.path}',
  :ref => 'test'

## <<dependencies

mod 'test-dependency', '1.2.4'
    `)
    expect(subject.modules).toHaveLength(4)
    expect(subject.dependentModules).toHaveLength(1)
  })

  it('should generate the correct puppet file text', async () => {
    const puppetfile = `forge 'http://localhost:${sb.getPort()}'

# Git modules

mod 'test-git',
    :git => '${tmpDir.path}',
    :ref => 'test'

# Forge modules

mod 'test-default', '1.2.3'

# Some comment
# before the module
mod 'test-default2', '1.2.3'

## dependencies

mod 'test-dependency', '1.2.4'`

    const subject = await new PuppetFile().fromText(puppetfile)

    expect(subject.toText()).toEqual(puppetfile)
  })
})
