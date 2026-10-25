import axios from "axios";
import { Module } from "../../lib/plugins.js";

// ─── Quote databases ──────────────────────────────────────────────────────────

const GITA_QUOTES = [
  {
    quote:
      "You have a right to perform your duty, but not to the fruits of your actions.",
    speaker: "Krishna",
    verse: "Bhagavad Gita 2.47",
  },
  {
    quote: "The soul is never born, nor does it ever die.",
    speaker: "Krishna",
    verse: "Bhagavad Gita 2.20",
  },
  {
    quote:
      "Just as a person changes worn-out clothes for new ones, the soul accepts new bodies.",
    speaker: "Krishna",
    verse: "Bhagavad Gita 2.22",
  },
  {
    quote:
      "Weapons cannot cut the soul, fire cannot burn it, water cannot wet it, and wind cannot dry it.",
    speaker: "Krishna",
    verse: "Bhagavad Gita 2.23",
  },
  {
    quote: "The soul is eternal, all-pervading, immovable and everlasting.",
    speaker: "Krishna",
    verse: "Bhagavad Gita 2.24",
  },
  {
    quote: "The unreal has no existence, while the real never ceases to exist.",
    speaker: "Krishna",
    verse: "Bhagavad Gita 2.16",
  },
  {
    quote: "The wise are not disturbed by pleasure and pain.",
    speaker: "Krishna",
    verse: "Bhagavad Gita 2.15",
  },
  {
    quote: "Perform your duty without attachment to the results.",
    speaker: "Krishna",
    verse: "Bhagavad Gita 2.47",
  },
  {
    quote: "Yoga is the state of equanimity.",
    speaker: "Krishna",
    verse: "Bhagavad Gita 2.48",
  },
  {
    quote:
      "When meditation is mastered, the mind is unwavering like the flame of a lamp in a windless place.",
    speaker: "Krishna",
    verse: "Bhagavad Gita 6.19",
  },
];

const RAMAYANA_QUOTES = [
  "Dharma is the path that remains right even when it is difficult.",
  "A promise is sacred when it is kept even at the cost of comfort.",
  "Lord Rama showed that righteousness is greater than power.",
  "True strength is remaining calm when anger would be easier.",
  "Courage is walking toward duty even when the road is uncertain.",
  "A noble heart chooses dharma over personal desire.",
  "Rama's life teaches that truth may be difficult, but it never loses its value.",
  "Hanuman teaches us that devotion can transform impossible tasks into possible ones.",
  "Where there is sincere devotion, fear becomes smaller.",
  "Strength becomes meaningful only when it is used for the protection of others.",
];

// ─── Gita & Krishna quotes ─────────────────────────────────────────────────────

Module({
  command: "gitaquotes",
  aliases: ["gita"],
  package: "devotion",
  description: "Get a random quote from the Bhagavad Gita",
})(async (message) => {
  try {
    await message.react("🕉️");
    const q = GITA_QUOTES[Math.floor(Math.random() * GITA_QUOTES.length)];
    await message.send(
      `📜 *Bhagavad Gita Quote*\n\n"${q.quote}"\n\n— _${q.speaker}_ (${q.verse})`,
    );
    await message.react("✅");
  } catch {
    await message.send("❌ *Error sharing quote!*");
  }
});

Module({
  command: "krishnaquotes",
  aliases: ["krishna"],
  package: "devotion",
  description: "Get a random Krishna quote",
})(async (message) => {
  try {
    await message.react("🦚");
    const q = GITA_QUOTES[Math.floor(Math.random() * GITA_QUOTES.length)];
    await message.send(
      `🦚 *Lord Krishna Says:*\n\n"${q.quote}"\n\n— _(${q.verse})_`,
    );
    await message.react("✅");
  } catch {
    await message.send("❌ *Error sharing quote!*");
  }
});

// ─── Ramayana quotes ──────────────────────────────────────────────────────────

Module({
  command: "ramayanaquotes.",
  aliases: ["ramayana"],
  package: "devotion",
  description: "Get a random quote from the Ramayana",
})(async (message) => {
  try {
    await message.react("🏹");
    const q =
      RAMAYANA_QUOTES[Math.floor(Math.random() * RAMAYANA_QUOTES.length)];
    await message.send(`🏹 *Ramayana Quote*\n\n"${q}"`);
    await message.react("✅");
  } catch {
    await message.send("❌ *Error sharing quote!*");
  }
});

// ─── Gita chapter & verse (API) ────────────────────────────────────────────────

Module({
  command: "gitachapter",
  aliases: ["readgita"],
  package: "devotion",
  description: "Read a specific chapter summary from Bhagavad Gita",
})(async (message, match) => {
  const chapterNum = (match || "").trim().split(/\s+/)[0];

  if (!chapterNum || isNaN(chapterNum) || chapterNum < 1 || chapterNum > 18) {
    return message.send("*_Example: .gitachapter 1_*");
  }

  try {
    await message.react("📖");
    const res = await axios.get(
      `https://vedicscriptures.github.io/chapter/${chapterNum}`,
    );

    if (res.data && res.data.summary) {
      const title = res.data.translation || res.data.name;
      const summaryText = res.data.summary.en;
      await message.send(
        `📖 *Bhagavad Gita - Chapter ${chapterNum}*\n*${title}*\n\n${summaryText}`,
      );
      await message.react("✅");
    }
  } catch {
    await message.react("❌");
    await message.send("❌ *Chapter not found or API Error!*");
  }
});

Module({
  command: "gitaverse",
  aliases: ["gitashlok"],
  package: "devotion",
  description: "Read a specific verse from Bhagavad Gita",
})(async (message, match) => {
  const [chapter, verse] = (match || "").trim().split(/\s+/);

  if (!chapter || !verse || isNaN(chapter) || isNaN(verse)) {
    return message.send("*_Example: .gitaverse 1  (Chapter 1, Verse 1)_*");
  }

  try {
    await message.react("🔍");
    const res = await axios.get(
      `https://vedicscriptures.github.io/slok/${chapter}/${verse}`,
    );

    if (res.data && res.data.slok) {
      const shlok = res.data.slok;
      const translation = res.data.siva
        ? res.data.siva.et
        : res.data.purohit.et;
      await message.send(
        `📜 *Bhagavad Gita - ${chapter}:${verse}*\n\n${shlok}\n\n*Translation:*\n${translation}`,
      );
      await message.react("✅");
    }
  } catch {
    await message.react("❌");
    await message.send(
      "❌ *Verse not found. Check Chapter and Verse numbers.*",
    );
  }
});

// ─── Quran commands ───────────────────────────────────────────────────────────

Module({
  command: "quranverse",
  aliases: ["qverse", "ayat"],
  package: "devotion",
  description: "Get a specific Quran verse in English",
})(async (message, match) => {
  const [surah, ayat] = (match || "").trim().split(/\s+/);

  if (!surah || !ayat || isNaN(surah) || isNaN(ayat)) {
    return message.send("*_Example: .quranverse 2 255_*");
  }

  try {
    await message.react("☪️");
    const res = await axios.get(
      `https://api.alquran.cloud/v1/ayah/${surah}:${ayat}/en.asad`,
      { timeout: 15_000 },
    );

    if (res.data && res.data.data) {
      const surahName = res.data.data.surah.englishName;
      const verseText = res.data.data.text;
      await message.send(
        `📖 *The Noble Quran*\n\n*Surah ${surahName} (${surah}), Ayat ${ayat}*\n"${verseText}"`,
      );
      await message.react("✅");
    }
  } catch {
    await message.react("❌");
    await message.send("❌ *Verse not found. Check Surah and Ayat numbers.*");
  }
});

Module({
  command: "quranchapter",
  aliases: ["quran", "surah"],
  package: "devotion",
  description: "Read a full Surah (Chapter) from the Quran in English",
})(async (message, match) => {
  const chapter = (match || "").trim().split(/\s+/)[0];

  if (!chapter || isNaN(chapter) || chapter < 1 || chapter > 114) {
    return message.send("*_Example: .quranchapter 1_*");
  }

  try {
    await message.react("📖");
    const res = await axios.get(
      `https://api.alquran.cloud/v1/surah/${chapter}/en.asad`,
      { timeout: 20_000 },
    );

    if (res.data && res.data.data && res.data.data.ayahs) {
      const surahName = res.data.data.englishName;
      const versesText = res.data.data.ayahs
        .map((v) => `*${v.numberInSurah}.* ${v.text}`)
        .join("\n\n");
      await message.send(
        `📖 *The Noble Quran - Surah ${surahName}*\n\n${versesText}`,
      );
      await message.react("✅");
    }
  } catch {
    await message.react("❌");
    await message.send("❌ *Could not fetch the Surah API.*");
  }
});

// ─── Holy Bible ───────────────────────────────────────────────────────────────

Module({
  command: "bibleverse",
  aliases: ["verse", "bible"],
  package: "devotion",
  description: "Get a specific Bible verse or chapter",
})(async (message, match) => {
  const query = (match || "").trim();

  if (!query) {
    return message.send(
      "*_Example: .bibleverse John 3:16_\n_Example: .bibleverse Genesis 1_*",
    );
  }

  try {
    await message.react("✝️");
    const res = await axios.get(
      `https://bible-api.com/${encodeURIComponent(query)}`,
      { timeout: 15_000 },
    );

    if (res.data && res.data.text) {
      const reference = res.data.reference;
      const text = res.data.text.trim();
      await message.send(`📖 *Holy Bible*\n\n*${reference}*\n"${text}"`);
      await message.react("✅");
    }
  } catch {
    await message.react("❌");
    await message.send(
      "❌ *Verse/Chapter not found. Please check the spelling.*",
    );
  }
});
