
export type GuessResult = "correct" | "close" | "wrong";

// lower case, only letters/numbers/spaces, single spaces, no spaces at the ends
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Same as normalize, but with no spaces at all
function compact(text: string): string {
  return normalize(text).replace(/ /g, "");
}

// How many single-letter edits (add / remove / change) turn a into b
export function levenshtein(a: string, b: string): number {
  const dp: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    dp[i] = [i];
    for (let j = 1; j <= b.length; j++) {
      if (i === 0) {
        dp[i][j] = j;
        continue;
      }
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // remove a letter
        dp[i][j - 1] + 1, // add a letter
        dp[i - 1][j - 1] + cost, // change a letter
      );
    }
  }
  return dp[a.length][b.length];
}

export function checkGuess(guess: string, word: string): GuessResult {
  const g = compact(guess);
  const w = compact(word);
  if (!g) return "wrong";
  if (g === w) return "correct";

  // Typo tolerance only for words with 4+ letters ("cat" vs "car" is a different word)
  if (w.length >= 4 && levenshtein(g, w) === 1) return "close";

  // Partial: guessed one whole word of a multi-word answer
  const parts = normalize(word).split(" ");
  if (parts.length > 1 && parts.includes(normalize(guess))) return "close";

  return "wrong";
}

// Used to stop the drawer (or someone who already guessed) from typing the answer in chat
export function containsWord(message: string, word: string): boolean {
  return compact(message).includes(compact(word));
}