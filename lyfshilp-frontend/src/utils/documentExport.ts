function escapePdfText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function normalizeText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');
}

function wrapParagraph(paragraph: string, maxChars = 88): string[] {
  if (!paragraph.trim()) return [''];
  const words = paragraph.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }

  if (current) lines.push(current);
  return lines;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function downloadTextAsPdf(filename: string, title: string, content: string) {
  const normalized = normalizeText(content);
  const paragraphs = normalized.split('\n');
  const wrappedLines = paragraphs.flatMap((paragraph) => wrapParagraph(paragraph));
  const pages = chunk(wrappedLines.length ? wrappedLines : [''], 44);

  const objects: string[] = [];
  const pageIds: number[] = [];
  const fontObjectId = 3;
  let nextObjectId = 4;

  for (const pageLines of pages) {
    const pageId = nextObjectId++;
    const contentId = nextObjectId++;
    pageIds.push(pageId);

    const textCommands = [
      'BT',
      '/F1 18 Tf',
      '50 792 Td',
      `(${escapePdfText(title)}) Tj`,
      '0 -28 Td',
      '/F1 11 Tf',
      ...pageLines.map((line, index) => `${index === 0 ? '' : '0 -16 Td ' }(${escapePdfText(line)}) Tj`.trim()),
      'ET',
    ].join('\n');

    objects[pageId - 1] = `${pageId} 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentId} 0 R >>
endobj`;

    objects[contentId - 1] = `${contentId} 0 obj
<< /Length ${textCommands.length} >>
stream
${textCommands}
endstream
endobj`;
  }

  objects[0] = `1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj`;

  objects[1] = `2 0 obj
<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>
endobj`;

  objects[2] = `3 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj`;

  const pdfParts: string[] = ['%PDF-1.4'];
  const offsets: number[] = [0];

  for (const object of objects.filter(Boolean)) {
    offsets.push(pdfParts.join('\n').length + 1);
    pdfParts.push(object);
  }

  const xrefOffset = pdfParts.join('\n').length + 1;
  const xrefEntries = ['0000000000 65535 f '];
  for (let i = 1; i < offsets.length; i += 1) {
    xrefEntries.push(`${offsets[i].toString().padStart(10, '0')} 00000 n `);
  }

  pdfParts.push(`xref
0 ${offsets.length}
${xrefEntries.join('\n')}
trailer
<< /Size ${offsets.length} /Root 1 0 R >>
startxref
${xrefOffset}
%%EOF`);

  const blob = new Blob([pdfParts.join('\n')], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
