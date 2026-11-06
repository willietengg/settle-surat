// 判断信上的收件人是不是家庭成员。纯函数,无任何运行时依赖(Deno 和 Node 都能用)。
// 设计取舍:宁可「误报警告」也不要「漏报警告」——诈骗/错投信件被当成家人的信才是真正的风险。
// 误报可以由用户一键更正(并把写法记为别名),所以宁严勿宽。

const TITLES = new Set([
  'mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'prof', 'sir', 'madam', 'mdm', 'mister',
  'shri', 'smt', 'sri', 'estate', 'of', 'the', 'late',
])

export interface MemberLike {
  id: string
  display_name: string
  aliases?: string[] | null
}

const HAS_CJK = /[㐀-鿿豈-﫿぀-ヿ가-힯]/

export function normalize(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter((t) => t && !TITLES.has(t))
}

/** small 的每个 token 都能在 large 里找到(各用一次):相等,或 small 是单字母缩写且是 large token 的开头。 */
function covered(small: string[], large: string[]): boolean {
  const used = new Set<number>()
  for (const t of small) {
    let found = -1
    for (let i = 0; i < large.length; i++) {
      if (used.has(i)) continue
      if (large[i] === t || (t.length === 1 && large[i].startsWith(t))) {
        found = i
        break
      }
    }
    if (found < 0) return false
    used.add(found)
  }
  return true
}

export function namesMatch(a: string, b: string): boolean {
  const ta = tokens(a)
  const tb = tokens(b)
  if (!ta.length || !tb.length) return false

  const ja = ta.join(' ')
  const jb = tb.join(' ')
  if (ja === jb) return true

  // 中日韩姓名没有空格:允许「陈大文先生」包含「陈大文」(至少 2 个字)
  if (HAS_CJK.test(ja) && HAS_CJK.test(jb)) {
    const [s, l] = ja.length <= jb.length ? [ja, jb] : [jb, ja]
    return s.replace(/ /g, '').length >= 2 && l.replace(/ /g, '').includes(s.replace(/ /g, ''))
  }

  // 拉丁姓名:较短的一方至少 2 个 token 才允许子集匹配(防止只写姓 "Teng" 就算匹配)
  const [small, large] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  if (small.length < 2) return false
  return covered(small, large)
}

export interface MatchResult {
  memberIds: string[]
  unmatchedNames: string[]
}

export function matchRecipients(recipientNames: string[], members: MemberLike[]): MatchResult {
  const memberIds = new Set<string>()
  const unmatchedNames: string[] = []
  for (const name of recipientNames) {
    if (!name || !name.trim()) continue
    let hit = false
    for (const m of members) {
      const candidates = [m.display_name, ...(m.aliases ?? [])]
      if (candidates.some((c) => c && namesMatch(name, c))) {
        memberIds.add(m.id)
        hit = true
      }
    }
    if (!hit) unmatchedNames.push(name)
  }
  return { memberIds: [...memberIds], unmatchedNames }
}
