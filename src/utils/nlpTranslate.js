/**
 * Enterprise IT Translation & Grammar Engine
 * Calls Google Translate Neural Engine via backend /api/ai/translate
 */

export async function translateHinglishToEnglish(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return '';
  const str = rawInput.trim();
  if (!str) return '';

  // 1. Direct Backend Google Translate Neural API
  try {
    const res = await fetch('/api/ai/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: str })
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data && data.success && data.translatedText) {
        return data.translatedText;
      }
    }
  } catch (e) {
    console.warn("Backend translation API failed, trying direct public mirror...", e);
  }

  // 2. Direct Client-side Google Translate Mirror (Fail-safe)
  try {
    const directUrl = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=en&q=${encodeURIComponent(str)}`;
    const r2 = await fetch(directUrl);
    if (r2.ok) {
      const data = await r2.json();
      let trans = '';
      if (Array.isArray(data)) {
        trans = data.map(item => Array.isArray(item) ? item[0] : item).join(' ').trim();
      } else if (typeof data === 'string') {
        trans = data.trim();
      }
      if (trans) return trans;
    }
  } catch (e2) {
    console.warn("Direct Google neural mirror failed...", e2);
  }

  // 3. Direct MyMemory Mirror (Fail-safe 2)
  try {
    const memUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(str)}&langpair=hi|en`;
    const r3 = await fetch(memUrl);
    if (r3.ok) {
      const j3 = await r3.json();
      if (j3 && j3.responseData && j3.responseData.translatedText) {
        return j3.responseData.translatedText;
      }
    }
  } catch (e3) {}

  return str;
}
