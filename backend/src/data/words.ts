// Word list, grouped by category (the PDF asks for categorised words)
import { WordMode } from "../types";
export const WORDS: Record<string, string[]> = {
  animals: [
    "cat", "dog", "elephant", "giraffe", "penguin", "kangaroo", "octopus", "snake",
    "lion", "zebra", "monkey", "rabbit", "turtle", "shark", "owl", "butterfly",
    "spider", "frog", "camel", "duck",
  ],
  food: [
    "pizza", "burger", "banana", "apple", "ice cream", "cake", "donut", "sandwich",
    "popcorn", "cookie", "carrot", "watermelon", "egg", "noodles", "samosa", "mango",
  ],
  objects: [
    "umbrella", "chair", "lamp", "clock", "phone", "laptop", "camera", "key",
    "scissors", "pencil", "book", "glasses", "candle", "guitar", "balloon", "kite",
    "ladder", "hammer", "toothbrush", "light bulb",
  ],
  actions: [
    "swimming", "dancing", "running", "sleeping", "jumping", "cooking", "reading",
    "singing", "fishing", "climbing", "crying", "laughing",
  ],
  places: [
    "beach", "castle", "school", "hospital", "airport", "library", "zoo", "park",
    "desert", "island", "bridge", "lighthouse",
  ],
  nature: [
    "sun", "moon", "star", "cloud", "rainbow", "tree", "flower", "mountain",
    "river", "volcano", "snowman", "lightning",
  ],
};

const ALL_WORDS = Object.values(WORDS).flat();

// Pick `count` different random words, avoiding ones already used this game
export function getRandomWords(count: number, used: Set<string>): string[] {
  let pool = ALL_WORDS.filter((w) => !used.has(w));
  if (pool.length < count) pool = ALL_WORDS; // ran out of fresh words

  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// Word options for the drawer. In "combination" mode each option is two words
// joined together (e.g. "banana robot"), which is harder to draw and to guess.
export function getWordOptions(count: number, used: Set<string>, mode: WordMode): string[] {
  if (mode !== "combination") return getRandomWords(count, used);

  const singles = getRandomWords(count * 2, used).filter((w) => !w.includes(" "));
  const options: string[] = [];
  for (let i = 0; i + 1 < singles.length && options.length < count; i += 2) {
    options.push(`${singles[i]} ${singles[i + 1]}`);
  }
  return options.length > 0 ? options : getRandomWords(count, used);
}