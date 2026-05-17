import pdfParse from 'pdf-parse';
import { readFile } from 'fs/promises';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import OpenAI from 'openai';

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
  llm: OpenAI
): Promise<PdfRequirement[]> => {
  const buffer = await readFile(pdfPath);
  const parsed = await pdfParse(buffer);
  console.log(`[pdf] extracted ${parsed.text.length} chars from ${pdfPath}`);

  const chunks = await splitter.splitText(parsed.text);
  console.log(`[pdf] split into ${chunks.length} chunks`);

  const allRequirements: PdfRequirement[] = [];

  for (const [i, chunk] of chunks.entries()) {
    const resp = await llm.chat.completions.create({
      model: 'gemini-2.0-flash',
      messages: [
        {
          role: 'system',
          content: `Extract testable software requirements from this document chunk.
Return JSON array only. Each item: { section, text, impliedTestableAC }
If no testable requirements found, return [].
Focus on: user flows, system behaviors, validations, error handling.
Ignore: formatting, legal text, version history.`,
        },
        { role: 'user', content: chunk },
      ],
    });

    const text = resp.choices[0].message.content ?? '';
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
