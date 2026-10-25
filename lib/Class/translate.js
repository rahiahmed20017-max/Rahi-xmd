const TRANSLATE_URL = "https://translate.googleapis.com/translate_a/single";
const REQUEST_TIMEOUT_MS = 10_000;

export default class Translator {
  async translate(query = "", lang) {
    const text = String(query).trim();
    if (!text) return "";
    if (!lang || typeof lang !== "string") {
      return { status: 400, error: "A target language is required" };
    }

    try {
      const url = new URL(TRANSLATE_URL);
      url.search = new URLSearchParams({
        client: "gtx",
        sl: "auto",
        dt: "t",
        tl: lang,
        q: text,
      });
      const response = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok)
        throw new Error(`Translation service returned HTTP ${response.status}`);
      const data = await response.json();
      const translatedText = Array.isArray(data?.[0])
        ? data[0].map((segment) => segment?.[0] || "").join("")
        : "";
      if (!translatedText)
        throw new Error("Translation service returned no text");

      return {
        author: "naxor",
        status: 200,
        data: {
          originalText: text,
          translatedText,
          targetLanguage: lang,
          sourceLanguage: data[2] || "auto",
        },
      };
    } catch (error) {
      return { author: "naxor", status: 500, error: error.message };
    }
  }
}
