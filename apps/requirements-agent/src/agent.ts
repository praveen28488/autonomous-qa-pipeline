import { BaseAgent, AgentConfig } from '@qa/agent-bus';
import {
  TestScenario, RequirementsOutput, RequirementsOutputSchema,
  TestScenarioSchema, SCHEMA_VERSION,
} from '@qa/schemas';
import { ChromaStore }               from './chroma-store.js';
import { scoreRequirementsQuality }  from './quality-gate.js';
import { REQUIREMENTS_TOOLS }        from './tools.js';
import { MOCK_JIRA_STORIES }         from './mock-jira.js';
import { randomUUID }                from 'crypto';
import { writeFile }                 from 'fs/promises';
import { join }                      from 'path';

const SYSTEM_PROMPT = `You are the Requirements Agent in an autonomous test automation pipeline.

Your job:
1. Fetch Jira stories from the project using get_jira_stories
2. For each story, call score_requirements_quality to evaluate its acceptance criteria
3. For stories with recommendation 'ingest' or 'ingest_with_warning',
   call generate_test_scenario to produce a full Gherkin scenario
4. If a Confluence spec URL is available, call get_confluence_spec for additional context
5. Once ALL scenarios are generated, call store_scenarios_in_chroma with the complete batch
6. Finally call save_scenarios_json to write the output file

Rules:
- NEVER skip the quality scoring step — it gates what gets ingested
- Stories with recommendation 'skip' must NOT be converted to scenarios
- Always include the jiraStoryId in every scenario you generate
- Gherkin format: Feature / Scenario / Given / When / Then / And
- Tags must be from: @smoke @regression @e2e @api @visual
- One story may produce multiple scenarios (happy path + error cases)`;

export class RequirementsAgent extends BaseAgent {
  private chroma: ChromaStore;
  private collectedScenarios: TestScenario[] = [];
  private skipped: RequirementsOutput['skippedStories'] = [];
  private useMockData: boolean;

  constructor(cfg: AgentConfig, chroma: ChromaStore, useMockData = false) {
    super({ ...cfg, tools: REQUIREMENTS_TOOLS, systemPrompt: SYSTEM_PROMPT });
    this.chroma      = chroma;
    this.useMockData = useMockData;
  }

  protected async executeTool(name: string, input: unknown): Promise<unknown> {
    const i = input as Record<string, unknown>;

    switch (name) {
      case 'get_jira_stories': {
        if (this.useMockData) {
          const maxResults = (i.maxResults as number | undefined) ?? 50;
          const stories = MOCK_JIRA_STORIES.slice(0, maxResults);
          console.log(`[req-agent] returning ${stories.length} mock Jira stories`);
          return { issues: stories, total: stories.length };
        }
        // Real Jira MCP call (requires configured JIRA_URL etc.)
        throw new Error('Real Jira not configured — set useMockData=true or provide JIRA credentials');
      }

      case 'get_confluence_spec': {
        if (this.useMockData) {
          return { content: 'Confluence spec not available in mock mode.', pageId: i.pageId ?? 'mock' };
        }
        throw new Error('Real Confluence not configured');
      }

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

      case 'store_scenarios_in_chroma': {
        await this.chroma.addScenarios(this.collectedScenarios);
        const total = await this.chroma.count();
        console.log(`[req-agent] ChromaDB now has ${total} total scenarios`);
        return { stored: this.collectedScenarios.length, totalInStore: total };
      }

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
