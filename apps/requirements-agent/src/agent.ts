import { BaseAgent, AgentConfig } from '@qa/agent-bus';
import {
  TestScenario, RequirementsOutput, RequirementsOutputSchema,
  TestScenarioSchema, SCHEMA_VERSION,
} from '@qa/schemas';
import { McpRegistry }              from '@qa/mcp-clients';
import { ChromaStore }               from './chroma-store.js';
import { scoreRequirementsQuality }  from './quality-gate.js';
import { REQUIREMENTS_TOOLS }        from './tools.js';
import { MOCK_JIRA_STORIES }         from './mock-jira.js';
import { randomUUID }                from 'crypto';
import { writeFile, readFile }       from 'fs/promises';
import { join }                      from 'path';
import pdfParse                      from 'pdf-parse';

const SYSTEM_PROMPT = `You are the Requirements Agent in an autonomous test automation pipeline.

Your job:
1. Fetch Jira stories from the project using get_jira_stories
   - If a PRD PDF path is provided, also call parse_prd_pdf to extract additional requirements
   - If a Confluence spec is available, call get_confluence_spec for supplementary context
2. For each story, call score_requirements_quality to evaluate its acceptance criteria
3. For stories with recommendation 'ingest' or 'ingest_with_warning':
   a. FIRST call search_similar_scenarios to retrieve existing related scenarios from ChromaDB (RAG)
   b. Use the retrieved scenarios as context examples to generate a BETTER, non-duplicate scenario
   c. Then call generate_test_scenario with the full Gherkin output
4. Once ALL scenarios are generated, call store_scenarios_in_chroma with the complete batch
5. Finally call save_scenarios_json to write the output file

Rules:
- NEVER skip the quality scoring step — it gates what gets ingested
- ALWAYS call search_similar_scenarios before generate_test_scenario (RAG step)
- Stories with recommendation 'skip' must NOT be converted to scenarios
- Always include the jiraStoryId in every scenario you generate
- Gherkin format: Feature / Scenario / Given / When / Then / And
- Tags must be from: @smoke @regression @e2e @api @visual
- One story may produce multiple scenarios (happy path + error cases)
- PDF and Confluence content should be used to enrich acceptance criteria context`;

export class RequirementsAgent extends BaseAgent {
  private chroma: ChromaStore;
  private mcp:    McpRegistry | null;
  private collectedScenarios: TestScenario[] = [];
  private skipped: RequirementsOutput['skippedStories'] = [];

  /**
   * @param cfg    - Agent config (id, bus). tools and systemPrompt are set internally.
   * @param mcp    - MCP registry. Pass null to fall back to built-in mock Jira data.
   * @param chroma - ChromaDB store (already connected).
   */
  constructor(
    cfg:    Omit<AgentConfig, 'tools' | 'systemPrompt'>,
    mcp:    McpRegistry | null,
    chroma: ChromaStore,
  ) {
    super({ ...cfg, tools: REQUIREMENTS_TOOLS, systemPrompt: SYSTEM_PROMPT });
    this.mcp    = mcp;
    this.chroma = chroma;
  }

  /** executeTool is called by BaseAgent for every tool call Claude makes. */
  protected async executeTool(name: string, input: unknown): Promise<unknown> {
    const i = input as Record<string, unknown>;

    switch (name) {
      // ── get_jira_stories ─────────────────────────────────────
      case 'get_jira_stories': {
        const maxResults = (i.maxResults as number | undefined) ?? 50;

        if (this.mcp) {
          // Real path: delegate to the Jira MCP server
          const jql = i.epicId
            ? `project=${i.projectKey} AND "Epic Link"=${i.epicId}`
            : `project=${i.projectKey} ORDER BY created DESC`;
          const result = await this.mcp.jira.callTool({
            name: 'jira_search_issues',
            arguments: {
              jql,
              maxResults,
              fields: ['summary', 'description', 'customfield_10016', 'priority', 'labels'],
            },
          });
          console.log(`[req-agent] fetched Jira stories via MCP`);
          return result;
        }

        // Fallback: built-in mock stories (when Jira credentials not configured)
        const stories = MOCK_JIRA_STORIES.slice(0, maxResults);
        console.log(`[req-agent] returning ${stories.length} mock Jira stories`);
        return { issues: stories, total: stories.length };
      }

      // ── get_confluence_spec ───────────────────────────────────
      case 'get_confluence_spec': {
        if (this.mcp) {
          const result = await this.mcp.jira.callTool({
            name:      i.pageId ? 'confluence_get_page' : 'confluence_search',
            arguments: i.pageId ? { pageId: i.pageId } : { query: i.pageTitle, spaceKey: i.spaceKey },
          });
          return result;
        }
        return { content: 'Confluence spec not available (MCP not configured).', pageId: i.pageId ?? 'mock' };
      }

      // ── search_similar_scenarios (RAG retrieval) ─────────────
      case 'search_similar_scenarios': {
        const query = i.query as string;
        const topK  = (i.topK as number | undefined) ?? 3;
        const results = await this.chroma.search(query, topK);
        const docs = results.documents?.[0] ?? [];
        const metas = results.metadatas?.[0] ?? [];
        console.log(`[req-agent] RAG: retrieved ${docs.length} similar scenarios for "${query}"`);
        return {
          count: docs.length,
          scenarios: docs.map((doc, idx) => ({
            content:  doc,
            metadata: metas[idx] ?? {},
          })),
        };
      }

      // ── parse_prd_pdf ─────────────────────────────────────────
      case 'parse_prd_pdf': {
        const filePath = i.filePath as string;
        const fullPath = join(process.cwd(), filePath);
        try {
          const buffer = await readFile(fullPath);
          const parsed = await pdfParse(buffer);
          console.log(`[req-agent] PDF parsed: ${parsed.numpages} pages, ${parsed.text.length} chars — ${filePath}`);
          return {
            text:     parsed.text,
            pages:    parsed.numpages,
            filePath,
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[req-agent] PDF parse error for ${filePath}: ${msg}`);
          return { error: msg, filePath };
        }
      }

      // ── score_requirements_quality ────────────────────────────
      case 'score_requirements_quality': {
        const score = scoreRequirementsQuality({
          jiraStoryId:        i.jiraStoryId as string,
          title:              i.title as string,
          acceptanceCriteria: i.acceptanceCriteria as string,
          description:        i.description as string | undefined,
        });
        console.log(`[req-agent] ${i.jiraStoryId} quality: ${score.overall} → ${score.recommendation}`);
        if (score.recommendation === 'skip') {
          this.skipped.push({
            jiraStoryId: i.jiraStoryId as string,
            reason:      score.missingFields.join(', '),
            score:       score.overall,
          });
        }
        return score;
      }

      // ── generate_test_scenario ────────────────────────────────
      case 'generate_test_scenario': {
        const raw = {
          id:           randomUUID(),
          jiraStoryId:  i.jiraStoryId as string,
          title:        i.title as string,
          gherkin:      (i.gherkin as string | undefined) ?? '',
          tags:         (i.tags as string[] | undefined) ?? ['@regression'],
          priority:     (i.priority as string | undefined) ?? 'medium',
          sourceType:   'jira' as const,
          qualityScore: (i.qualityScore as number | undefined) ?? 70,
          generatedAt:  new Date().toISOString(),
          rawAC:        i.acceptanceCriteria as string | undefined,
        };
        const parsed = TestScenarioSchema.safeParse(raw);
        if (parsed.success) {
          this.collectedScenarios.push(parsed.data);
          console.log(`[req-agent] scenario ready: ${parsed.data.title}`);
          return { ok: true, id: parsed.data.id };
        } else {
          console.warn('[req-agent] scenario failed Zod validation:', parsed.error.issues);
          return { ok: false, errors: parsed.error.issues };
        }
      }

      // ── store_scenarios_in_chroma ─────────────────────────────
      case 'store_scenarios_in_chroma': {
        await this.chroma.addScenarios(this.collectedScenarios);
        const total = await this.chroma.count();
        console.log(`[req-agent] ChromaDB now has ${total} total scenarios`);
        return { stored: this.collectedScenarios.length, totalInStore: total };
      }

      // ── save_scenarios_json ───────────────────────────────────
      case 'save_scenarios_json': {
        const outputPath = (i.outputPath as string | undefined) ?? 'test-scenarios.json';
        const fullPath   = join(process.cwd(), outputPath);
        await writeFile(fullPath, JSON.stringify(this.collectedScenarios, null, 2), 'utf-8');
        console.log(`[req-agent] saved ${this.collectedScenarios.length} scenarios → ${fullPath}`);
        return { path: fullPath, count: this.collectedScenarios.length };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /** Publish the 'done' signal to the bus once all work is complete. */
  protected async emitNode(_state: unknown): Promise<void> {
    const output: RequirementsOutput = {
      runId:          randomUUID(),
      totalIngested:  this.collectedScenarios.length,
      totalSkipped:   this.skipped.length,
      totalWarnings:  this.collectedScenarios.filter(s => s.qualityScore < 70).length,
      scenarios:      this.collectedScenarios,
      skippedStories: this.skipped,
      completedAt:    new Date().toISOString(),
    };

    RequirementsOutputSchema.parse(output); // hard validate before publishing

    await this.cfg.bus.publish('agents:requirements:orchestrator:done', {
      id:            randomUUID(),
      agentId:       'requirements',
      type:          'done',
      schemaVersion: SCHEMA_VERSION,
      timestamp:     new Date().toISOString(),
      payload:       output as unknown as Record<string, unknown>,
    });

    console.log(
      `[req-agent] published done — ` +
      `${output.totalIngested} ingested, ${output.totalSkipped} skipped`
    );
  }
}
