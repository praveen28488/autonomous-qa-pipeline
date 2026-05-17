import pdfParse from 'pdf-parse';
import { readFile } from 'fs/promises';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import Anthropic from '@anthropic-ai/sdk';

export interface PdfRequirement {
  section:            string;
  text:               string;
  impliedTestableAC?: string;
}

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize:    800,
  chunkOverlap: 100,
});

export const extractRequirementsFromPdf = async (
  pdfPath: string,
  claude: Anthropic
): Promise<PdfRequirement[]> => {
  const buffer = await readFile(pdfPath);
  const parsed = await pdfParse(buffer);
  console.log(`[pdf] extracted ${parsed.text.length} chars from ${pdfPath}`);

  const chunks = await splitter.splitText(parsed.text);
  console.log(`[pdf] split into ${chunks.length} chunks`);

  const allRequirements: PdfRequirement[] = [];

  for (const [i, chunk] of chunks.entries()) {
    const resp = await claude.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: `Extract testable software requirements from this document chunk.
Return JSON array only. Each item: { section, text, impliedTestableAC }
If no testable requirements found, return [].
Focus on: user flows, system behaviors, validations, error handling.
Ignore: formatting, legal text, version history.`,
      messages: [{ role: 'user', content: chunk }],
    });

    const text = resp.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('');

    try {
      const reqs = JSON.parse(text.replace(/```json|```/g, '').trim());
      if (Array.isArray(reqs)) allRequirements.push(...reqs);
    } catch {
      console.warn(`[pdf] chunk ${i}: could not parse JSON response`);
    }
  }

  console.log(`[pdf] extracted ${allRequirements.length} requirements from PDF`);
  return allRequirements;
};
