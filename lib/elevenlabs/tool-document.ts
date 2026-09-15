function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

// Read structured OpenJiuwen output, never URLs from the agent's spoken text.
// The current preview workspace holds one document, so select the first URL.
export function toolDocumentUrl(payload: string): string | null {
  let result: Record<string, unknown> | undefined;
  try {
    result = record(JSON.parse(payload));
  } catch {
    return null;
  }
  if (!result || result.ok !== true || result.error) return null;
  const handover = record(result.handover_details);
  if (handover?.status && handover.status !== 'succeeded') return null;
  const files = Array.isArray(handover?.files) ? handover.files : [];
  const outputs = Array.isArray(result.output_path) ? result.output_path : [];
  const candidates = [...files.map((file: unknown) => record(file)?.url), ...outputs];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    try {
      const url = new URL(candidate);
      if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) {
        return candidate;
      }
    } catch {
      // Skip local paths and malformed links.
    }
  }
  return null;
}
