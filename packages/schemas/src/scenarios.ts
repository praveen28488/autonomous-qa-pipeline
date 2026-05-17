import { z } from 'zod';

// Quality scoring for raw Jira acceptance criteria
export const QualityScoreSchema = z.object({
  overall:         z.number().min(0).max(100),
  hasClearTitle:   z.boolean(),
  hasGherkin:      z.boolean(),
  hasTestableAC:   z.boolean(),
  hasPriority:     z.boolean(),
  missingFields:   z.array(z.string()),
  recommendation:  z.enum(['ingest', 'ingest_with_warning', 'skip']),
});
export type QualityScore = z.infer<typeof QualityScoreSchema>;

// A single test scenario ready for ChromaDB
export const TestScenarioSchema = z.object({
  id:           z.string().uuid(),
  jiraStoryId:  z.string().regex(/^[A-Z]+-\d+$/),
  title:        z.string().min(5),
  gherkin:      z.string().min(20),
  tags:         z.array(z.enum(['@smoke', '@regression', '@e2e', '@api', '@visual'])),
  priority:     z.enum(['critical', 'high', 'medium', 'low']),
  sourceType:   z.enum(['jira', 'confluence', 'pdf']),
  qualityScore: z.number().min(0).max(100),
  generatedAt:  z.string().datetime(),
  rawAC:        z.string().optional(),
});
export type TestScenario = z.infer<typeof TestScenarioSchema>;

// Batch output from the Requirements Agent
export const RequirementsOutputSchema = z.object({
  runId:          z.string().uuid(),
  totalIngested:  z.number().int().nonnegative(),
  totalSkipped:   z.number().int().nonnegative(),
  totalWarnings:  z.number().int().nonnegative(),
  scenarios:      z.array(TestScenarioSchema),
  skippedStories: z.array(z.object({
    jiraStoryId: z.string(),
    reason:      z.string(),
    score:       z.number(),
  })),
  completedAt: z.string().datetime(),
});
export type RequirementsOutput = z.infer<typeof RequirementsOutputSchema>;
