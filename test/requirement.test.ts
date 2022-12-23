import { Requirement, RequirementSource } from '../lib/Requirement'
import { ModuleDeclaration } from '../lib/ModuleDeclaration'
import { DependencyGraph } from '../lib/DependencyGraph'
import { Stubborn } from 'stubborn-ws'
import { Range } from 'semver'

const sb = new Stubborn()

beforeAll(async () => {
  await sb.start()
})

afterAll(async () => {
  await sb.stop()
})

describe('The requirement class', function () {
  beforeEach(async () => {
    sb.get('/v3/modules/test-target').setResponseBody({
      slug: 'test-target',
      releases: [
        {
          version: '0.9.0',
        },
        {
          version: '1.0.0',
        },
      ],
    })
  })
  it('should return no new version on a valid graph', async () => {
    const targetModule = new ModuleDeclaration().withAuthor('test').withName('target').withVersion('1.0.0')
    const requirementA = new Requirement()
      .withSource(RequirementSource.Dependency)
      .withSourceModule(new ModuleDeclaration().withAuthor('test').withName('source1'))
      .withTargetModule(targetModule)
      .withDependencyRange(new Range('>=1.0.0'))
    const requirementB = new Requirement()
      .withSource(RequirementSource.Dependency)
      .withSourceModule(new ModuleDeclaration().withAuthor('test').withName('source2'))
      .withTargetModule(targetModule)
      .withDependencyRange(new Range('>=1.0.0'))
    const graph = DependencyGraph.factory()
    graph.graph.clear()
    graph.graph.addNode(requirementA.targetModule?.getSlug())
    graph.graph.addNode(requirementA.sourceModule?.getSlug())
    graph.graph.addNode(requirementB.sourceModule?.getSlug())
    graph.graph.addDirectedEdgeWithKey(
      requirementA.getEdgeId(),
      requirementA.sourceModule?.getSlug(),
      requirementA.targetModule?.getSlug(),
      requirementA.getEdgeAttributes()
    )
    graph.graph.addDirectedEdgeWithKey(
      requirementB.getEdgeId(),
      requirementB.sourceModule?.getSlug(),
      requirementB.targetModule?.getSlug(),
      requirementB.getEdgeAttributes()
    )
    expect(requirementA.isValid()).toBeTruthy()
    expect(await requirementA.getNewVersion()).toEqual(targetModule.version)
    expect(requirementB.isValid()).toBeTruthy()
    expect(await requirementB.getNewVersion()).toEqual(targetModule.version)
  })
  it('should return a new version on an invalid graph', async () => {
    const targetModule = new ModuleDeclaration()
      .withForgeApiUrl(`http://localhost:${sb.getPort()}`)
      .withAuthor('test')
      .withName('target')
      .withVersion('0.9.0')
      .withAvailableVersions(['0.9.0', '1.0.0'])
    const requirementA = new Requirement()
      .withSource(RequirementSource.Dependency)
      .withSourceModule(new ModuleDeclaration().withAuthor('test').withName('source1'))
      .withTargetModule(targetModule)
      .withDependencyRange(new Range('>=0.9.0'))
    const requirementB = new Requirement()
      .withSource(RequirementSource.Dependency)
      .withSourceModule(new ModuleDeclaration().withAuthor('test').withName('source2'))
      .withTargetModule(targetModule)
      .withDependencyRange(new Range('>=1.0.0'))
    const graph = DependencyGraph.factory()
    graph.graph.clear()
    graph.graph.addNode(requirementA.targetModule?.getSlug())
    graph.graph.addNode(requirementA.sourceModule?.getSlug())
    graph.graph.addNode(requirementB.sourceModule?.getSlug())
    graph.graph.addDirectedEdgeWithKey(
      requirementA.getEdgeId(),
      requirementA.sourceModule?.getSlug(),
      requirementA.targetModule?.getSlug(),
      requirementA.getEdgeAttributes()
    )
    graph.graph.addDirectedEdgeWithKey(
      requirementB.getEdgeId(),
      requirementB.sourceModule?.getSlug(),
      requirementB.targetModule?.getSlug(),
      requirementB.getEdgeAttributes()
    )
    expect(requirementA.isValid()).toBeTruthy()
    expect(await requirementA.getNewVersion()).toEqual('1.0.0')
    expect(requirementB.isValid()).toBeTruthy()
    expect(await requirementB.getNewVersion()).toEqual('1.0.0')
  })
  it('should throw on an impossible graph', async () => {
    const targetModule = new ModuleDeclaration()
      .withForgeApiUrl(`http://localhost:${sb.getPort()}`)
      .withAuthor('test')
      .withName('target')
      .withVersion('0.9.0')
      .withAvailableVersions(['0.9.0', '1.0.0'])
    const requirementA = new Requirement()
      .withSource(RequirementSource.Dependency)
      .withSourceModule(new ModuleDeclaration().withAuthor('test').withName('source1'))
      .withTargetModule(targetModule)
      .withDependencyRange(new Range('>=0.9.0 <1.0.0'))
    const requirementB = new Requirement()
      .withSource(RequirementSource.Dependency)
      .withSourceModule(new ModuleDeclaration().withAuthor('test').withName('source2'))
      .withTargetModule(targetModule)
      .withDependencyRange(new Range('>=1.0.0'))
    const graph = DependencyGraph.factory()
    graph.graph.clear()
    graph.graph.addNode(requirementA.targetModule?.getSlug())
    graph.graph.addNode(requirementA.sourceModule?.getSlug())
    graph.graph.addNode(requirementB.sourceModule?.getSlug())
    graph.graph.addDirectedEdgeWithKey(
      requirementA.getEdgeId(),
      requirementA.sourceModule?.getSlug(),
      requirementA.targetModule?.getSlug(),
      requirementA.getEdgeAttributes()
    )
    graph.graph.addDirectedEdgeWithKey(
      requirementB.getEdgeId(),
      requirementB.sourceModule?.getSlug(),
      requirementB.targetModule?.getSlug(),
      requirementB.getEdgeAttributes()
    )
    expect(requirementA.isValid()).toBeTruthy()
    expect(requirementB.isValid()).toBeTruthy()
    await expect(requirementA.getNewVersion()).rejects.toMatchObject({
      message: 'No possible version for requirement test-source1 => test-target (>=0.9.0 <1.0.0)',
    })
    await expect(requirementB.getNewVersion()).rejects.toMatchObject({
      message: 'No possible version for requirement test-source2 => test-target (>=1.0.0)',
    })
  })
})
