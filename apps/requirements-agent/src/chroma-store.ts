import { ChromaClient, Collection, EmbeddingFunction } from 'chromadb';
import { TestScenario } from '@qa/schemas';

const COLLECTION_NAME = 'test-scenarios';

// Native Gemini REST endpoint for embeddings (text-embedding-004, 768 dimensions)
// The OpenAI-compat layer does NOT proxy the embedding endpoint, so we call it directly.
const GEMINI_EMBED_URL = (apiKey: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;

type GeminiEmbedResponse = { embedding: { values: number[] } };

/**
 * GeminiEmbeddingFunction — implements ChromaDB v3's EmbeddingFunction interface.
 * Calls the Gemini v1beta REST API directly for text-embedding-004.
 */
class GeminiEmbeddingFunction implements EmbeddingFunction {
  private readonly apiKey: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY ?? '';
    if (!this.apiKey) throw new Error('GEMINI_API_KEY env var is required for ChromaDB embeddings');
  }

  async generate(texts: string[]): Promise<number[][]> {
    // Gemini embedContent accepts one text at a time — fan out with Promise.all
    return Promise.all(
      texts.map(async (text) => {
        const res = await fetch(GEMINI_EMBED_URL(this.apiKey), {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            content:  { parts: [{ text }] },
            taskType: 'SEMANTIC_SIMILARITY',
          }),
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Gemini embed API error ${res.status}: ${err}`);
        }
        const data = await res.json() as GeminiEmbedResponse;
        return data.embedding.values;
      })
    );
  }
}

export class ChromaStore {
  private client:    ChromaClient;
  private embedFn:   GeminiEmbeddingFunction;
  private collection: Collection | null = null;

  constructor(url = 'http://localhost:8000') {
    // Parse the URL so we can pass host/port separately (chromadb v3 prefers this)
    const parsed = new URL(url);
    this.client  = new ChromaClient({
      host: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port, 10) : (parsed.protocol === 'https:' ? 443 : 8000),
      ssl:  parsed.protocol === 'https:',
    });
    this.embedFn = new GeminiEmbeddingFunction();
  }

  /** Connect and get-or-create the scenarios collection. */
  async connect(): Promise<void> {
    this.collection = await this.client.getOrCreateCollection({
      name:              COLLECTION_NAME,
      embeddingFunction: this.embedFn,
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
    try {
      await this.client.deleteCollection({ name: COLLECTION_NAME });
    } catch {
      // Collection may not exist yet — that's fine
    }
    this.collection = null;
    await this.connect();
  }
}
