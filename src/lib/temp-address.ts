/**
 * Temporary addresses read like `alice-bob123`: a given name, a family name and
 * a three-digit suffix. Every combination satisfies the temporary prefix rules
 * (lowercase `a-z`, one `-`, at least 8 characters, no reserved words).
 */
const GIVEN_NAMES = [
  'alice',
  'amber',
  'andrew',
  'anna',
  'arthur',
  'bella',
  'ben',
  'brandon',
  'brian',
  'carol',
  'charlie',
  'chloe',
  'chris',
  'claire',
  'daniel',
  'david',
  'diana',
  'edward',
  'ella',
  'emily',
  'emma',
  'eric',
  'ethan',
  'frank',
  'george',
  'grace',
  'hannah',
  'harry',
  'helen',
  'henry',
  'isabel',
  'jack',
  'james',
  'jane',
  'jason',
  'jessica',
  'john',
  'julia',
  'kevin',
  'laura',
  'leo',
  'lily',
  'lucy',
  'mark',
  'martin',
  'mia',
  'michael',
  'nancy',
  'oliver',
  'peter',
] as const

const FAMILY_NAMES = [
  'adams',
  'allen',
  'baker',
  'barnes',
  'bell',
  'brooks',
  'brown',
  'butler',
  'campbell',
  'carter',
  'clark',
  'coleman',
  'collins',
  'cooper',
  'cox',
  'davis',
  'dixon',
  'edwards',
  'ellis',
  'evans',
  'fisher',
  'fleming',
  'ford',
  'foster',
  'graham',
  'grant',
  'gray',
  'green',
  'hall',
  'harris',
  'hayes',
  'hill',
  'holmes',
  'hughes',
  'hunt',
  'jackson',
  'jenkins',
  'johnson',
  'kelly',
  'king',
  'lee',
  'lewis',
  'marshall',
  'mason',
  'miller',
  'mitchell',
  'moore',
  'morgan',
  'murphy',
  'nelson',
] as const

const SUFFIX_START = 100
const SUFFIX_RANGE = 900

function pickIndex(length: number) {
  return crypto.getRandomValues(new Uint32Array(1))[0] % length
}

export function randomTempLocalPart(): string {
  const given = GIVEN_NAMES[pickIndex(GIVEN_NAMES.length)]
  const family = FAMILY_NAMES[pickIndex(FAMILY_NAMES.length)]
  const suffix = SUFFIX_START + pickIndex(SUFFIX_RANGE)
  return `${given}-${family}${suffix}`
}
