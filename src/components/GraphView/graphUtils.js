// Shared utilities for GraphView 2D & 3D

// Edge line colors — each type is visually distinct
export const EDGE_COLOR = {
  explicit: "#7c3aed", // explicit linked note (originNoteId) — violet-700
  link: "#57534e", // strong relation [[wiki link]] — stone-600
  tag: "#d1d5db", // shared tag — light gray
  content: "#d1d5db", // similar content — light gray
};

// ── Stop words for content similarity ────────────────────────────────────────

export const STOP_EN = new Set([
  "the",
  "and",
  "for",
  "are",
  "but",
  "not",
  "you",
  "all",
  "can",
  "was",
  "one",
  "our",
  "out",
  "day",
  "get",
  "has",
  "him",
  "his",
  "how",
  "its",
  "let",
  "new",
  "now",
  "old",
  "see",
  "two",
  "way",
  "who",
  "did",
  "she",
  "use",
  "had",
  "may",
  "this",
  "that",
  "with",
  "have",
  "from",
  "they",
  "will",
  "what",
  "your",
  "about",
  "would",
  "which",
  "when",
  "there",
  "their",
  "been",
  "just",
  "more",
  "also",
  "into",
  "some",
  "than",
  "then",
  "these",
  "them",
  "were",
  "said",
  "her",
  "we",
  "my",
  "me",
  "he",
  "it",
  "as",
  "at",
  "be",
  "by",
  "do",
  "go",
  "if",
  "in",
  "is",
  "no",
  "of",
  "on",
  "or",
  "so",
  "to",
  "up",
  "us",
  "an",
  "am",
  "any",
  "nor",
  "own",
  "per",
  "via",
  "yet",
]);

export const STOP_KO = new Set([
  "이",
  "그",
  "저",
  "것",
  "수",
  "있",
  "하",
  "되",
  "않",
  "없",
  "나",
  "우리",
  "이것",
  "그것",
  "저것",
  "여기",
  "거기",
  "저기",
  "에서",
  "에게",
  "으로",
  "에는",
  "이다",
  "이며",
  "이고",
  "것이",
  "하고",
  "하는",
  "하여",
  "하면",
  "하지",
  "때문",
  "대한",
  "위한",
  "통해",
  "따라",
  "있는",
  "있다",
  "없다",
  "한다",
  "된다",
  "된",
]);

export function tokenize(text) {
  const clean = text
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .toLowerCase();
  const tokens = Array.from(clean.match(/[가-힣]{2,}|[a-z]{3,}/g) || []);
  return tokens.filter((t) => !STOP_EN.has(t) && !STOP_KO.has(t));
}

// Build L2-normalised TF-IDF vectors for a pool of documents
export function buildTfIdf(docs) {
  const N = docs.length;
  if (N === 0) return new Map();

  const df = new Map();
  for (const { tokens } of docs) {
    for (const t of new Set(tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  }

  const vectors = new Map();
  for (const { id, tokens } of docs) {
    if (tokens.length === 0) {
      vectors.set(id, new Map());
      continue;
    }
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    const vec = new Map();
    for (const [t, count] of tf) {
      const idf = Math.log((N + 1) / ((df.get(t) ?? 0) + 1)) + 1;
      vec.set(t, (1 + Math.log(count)) * idf);
    }
    const norm = Math.sqrt(
      Array.from(vec.values()).reduce((s, v) => s + v * v, 0),
    );
    if (norm > 0) for (const [t, v] of vec) vec.set(t, v / norm);
    vectors.set(id, vec);
  }
  return vectors;
}

export function cosineSim(vecA, vecB) {
  if (!vecA || !vecB || !vecA.size || !vecB.size) return 0;
  const [small, large] = vecA.size <= vecB.size ? [vecA, vecB] : [vecB, vecA];
  let dot = 0;
  for (const [t, v] of small) {
    const u = large.get(t);
    if (u) dot += v * u;
  }
  return dot;
}
