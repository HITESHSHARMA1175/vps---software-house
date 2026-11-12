/**
 * Translation helper.
 * Calls only the backend /api/ai/translate route.
 * Response shape: { success, translatedText, translateStatus }
 * On disabled/failed/skipped, non-200, or network error the original text is returned silently.
 */

export async function translateHinglishToEnglish(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return '';
  const str = rawInput.trim();
  if (!str) return '';

  try {
    const res = await fetch('/api/ai/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: str })
    });
    if (!res.ok) return str;

    const data = await res.json();
    if (
      data &&
      data.success &&
      data.translateStatus === 'ok' &&
      typeof data.translatedText === 'string' &&
      data.translatedText
    ) {
      return data.translatedText;
    }
  } catch (e) {
    // Network/parse error: fall through to original text, no dialog.
  }

  return str;
}
