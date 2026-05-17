import { ChromaClient, Collection } from 'chromadb';
import { TestScenario } from '@qa/schemas';

const COLLECTION_NAME = 'test-scenarios';

export class ChromaStore {
  private client: ChromaClient;
  private collection: Collection | null = null;

  constructor(url = 'http://localhost:8000') {
    this.client = new ChromaClient({ path: url });
  }

  /** Connect and get-or-create the scenarios collection. */
  async connect(): Promise<void> {
    this.collection = await this.client.getOrCreateCollection({
      name: COLLECTION_NAME,
      metadata: {
        description: 'Test scenarios generated from Jira stories',
        'hnsw:space': 'cosine',
      },
    });
    const count = await this.collection.count();
    console.log(`[chroma] connected — ${count} scenarios in store`);
  }

  /** Add a batch of test scenarios to the vector store. */
  async addScenarios(scenarios: TestScenario[]): Promise<void> {
    if (!this.collection) throw new Error('ChromaStore not connected');
    if (!scenarios.length) return;

    await this.collection.upsert({
      ids:       scenarios.map(s => s.id),
      documents: scenarios.map(s => `${s.title}\n\n${s.gherkin}`),
      metadatas: scenarios.map(s => ({
        jiraStoryId:  s.jiraStoryId,
        title:        s.title,
        tags:         s.tags.join(','),
        priority:     s.priority,
        generatedAt:  s.generatedAt,
        qualityScore: s.qualityScore,
      })),
    });
    console.log(`[chroma] upserted ${scenarios.length} scenarios`);
  }

  /** Semantic search — returns top-k most relevant scenarios. */
  async search(query: string, topK = 5, filter?: Record<string, unknown>) {
    if (!this.collection) throw new Error('ChromaStore not connected');
    return this.collection.query({
      queryTexts: [query],
      nResults:   topK,
      where:      filter as Parameters<typeof this.collection.query>[0]['where'],
    });
  }

  async count(): Promise<number> {
    if (!this.collection) return 0;
    return this.collection.count();
  }

  /** Reset the store — used by smoke tests only. */
  async reset(): Promise<void> {
    await this.client.deleteCollection({ name: COLLECTION_NAME });
    this.collection = null;
    await this.connect();
  }
}
