import { QualityScore } from '@qa/schemas';

interface StoryInput {
  jiraStoryId:        string;
  title:              string;
  acceptanceCriteria: string;
  description?:       string;
}

export const scoreRequirementsQuality = (story: StoryInput): QualityScore => {
  const missing: string[] = [];
  let score = 0;

  // Title quality (20 points)
  const hasClearTitle =
    story.title.length >= 10 &&
    !story.title.toLowerCase().startsWith('story') &&
    !story.title.toLowerCase().startsWith('as a user');
  if (hasClearTitle) score += 20;
  else missing.push('clear title (>10 chars, not generic)');

  // Acceptance criteria exist and are testable (25 points)
  const hasTestableAC =
    story.acceptanceCriteria?.length > 30 &&
    /should|must|shall|can|will|verify|confirm|ensure/i.test(story.acceptanceCriteria);
  if (hasTestableAC) score += 25;
  else missing.push('testable acceptance criteria (should/must/shall)');

  // Gherkin-compatible language (25 points)
  const hasGherkin = /given|when|then|scenario|feature/i.test(story.acceptanceCriteria);
  if (hasGherkin) score += 25;
  else missing.push('Given/When/Then structure in ACs');

  // Has description (15 points)
  const hasDescription = (story.description?.length ?? 0) > 20;
  if (hasDescription) score += 15;
  else missing.push('story description (>20 chars)');

  // Valid Jira story ID format (15 points)
  const hasPriority = /^[A-Z]+-\d+$/.test(story.jiraStoryId);
  if (hasPriority) score += 15;
  else missing.push('valid Jira story ID (e.g. QA-123)');

  const recommendation =
    score >= 70 ? 'ingest' :
    score >= 40 ? 'ingest_with_warning' :
                  'skip';

  return { overall: score, hasClearTitle, hasGherkin, hasTestableAC, hasPriority, missingFields: missing, recommendation };
};
