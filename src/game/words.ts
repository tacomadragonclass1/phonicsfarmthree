/**
 * Three-letter consonant-vowel-consonant words a five-year-old knows.
 * Grouped by vowel so a missing word is easy to spot. No proper nouns.
 */
const WORDS: readonly string[] = [
  // a
  'ant', 'arm', 'ask', 'ash', 'bag', 'ban', 'bar', 'bat', 'cab', 'cam',
  'can', 'cat', 'dad', 'dab', 'dam', 'fan', 'fat', 'gap', 'gas', 'had',
  'ham', 'has', 'hat', 'jab', 'jam', 'lab', 'lad', 'lag', 'lap', 'mad',
  'man', 'map', 'mat', 'nab', 'nag', 'nap', 'pad', 'pal', 'pan', 'par',
  'pat', 'rag', 'ram', 'ran', 'rap', 'rat', 'sad', 'sag', 'sap', 'sat',
  'tab', 'tag', 'tam', 'tan', 'tap', 'tar', 'tat', 'wag', 'wax', 'yam',
  'zap',
  // e
  'bed', 'beg', 'bet', 'den', 'fed', 'get', 'hem', 'her', 'jet', 'keg',
  'led', 'let', 'men', 'met', 'net', 'new', 'peg', 'pen', 'pet', 'red',
  'set', 'ten', 'vet', 'web', 'wet', 'yet', 'yep',
  // i
  'big', 'bib', 'bid', 'bin', 'bit', 'did', 'dig', 'dim', 'din', 'dip',
  'fit', 'fix', 'gig', 'hip', 'hit', 'kid', 'kin', 'kit', 'lip', 'lit',
  'mix', 'nip', 'nit', 'pig', 'pin', 'pit', 'rib', 'rid', 'rig', 'rim',
  'rip', 'sim', 'sin', 'sip', 'sit', 'six', 'tin', 'tip', 'wit', 'zip',
  // o
  'bob', 'bog', 'bow', 'box', 'cob', 'cod', 'cog', 'con', 'cop', 'cot',
  'cow', 'dog', 'dot', 'fog', 'got', 'hog', 'hop', 'hot', 'job', 'jog',
  'jot', 'log', 'mob', 'mom', 'nod', 'not', 'pod', 'pop', 'pot', 'rob',
  'rod', 'rot', 'sob', 'sod', 'son', 'sop', 'ton', 'top', 'tot', 'toy',
  // u
  'bud', 'bug', 'bun', 'bus', 'but', 'buy', 'cub', 'cut', 'dud', 'dug',
  'fun', 'gum', 'gun', 'gut', 'hug', 'hum', 'hut', 'jug', 'lug', 'mud',
  'mug', 'nub', 'nut', 'pun', 'pup', 'put', 'rub', 'rug', 'run', 'rut',
  'sun', 'tub', 'tug',
  // y as the first consonant
  'yak', 'yap', 'yes',
];

/** Three-letter words a five-year-old knows, lowercase. */
export const CVC_WORDS: ReadonlySet<string> = new Set(WORDS);

export function isWord(letters: string): boolean {
  return CVC_WORDS.has(letters.toLowerCase());
}
