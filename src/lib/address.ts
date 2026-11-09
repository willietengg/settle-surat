// 判断两个地址是不是「同一个地方」。
// 规则(按用户要求):门牌号 + 街道(Jalan xxx)+ 地区 都对得上,就算同一个。
//   - 地区:两边都有 5 位邮编就比邮编;否则比地区名字(Taman / 城市)是否有共同的词。
//   - 缩写会统一:Jln→Jalan、Lrg→Lorong、Tmn→Taman 等;大小写、标点、空格不影响。

const ABBR: Record<string, string> = {
  jln: 'jalan', jl: 'jalan', lrg: 'lorong', tmn: 'taman', kg: 'kampung', kpg: 'kampung',
  bdr: 'bandar', psn: 'persiaran', lbh: 'lebuh', lbhrya: 'lebuhraya', rd: 'road', st: 'street',
  ave: 'avenue', dr: 'drive', ln: 'lane', blvd: 'boulevard', cres: 'crescent', apt: 'apartment',
}
const DROP = new Set(['no', 'number', 'unit', 'lot', 'blok', 'block', 'tingkat', 'level', 'floor'])
const STREET = new Set([
  'jalan', 'lorong', 'persiaran', 'lebuh', 'lebuhraya', 'lingkaran', 'lengkok', 'medan',
  'road', 'street', 'avenue', 'lane', 'drive', 'boulevard', 'crescent', 'way', 'close', 'place',
])
// 街道名读到这些词(或邮编)就结束,后面算地区
const AREA_START = new Set([
  'taman', 'bandar', 'kampung', 'seksyen', 'section', 'desa', 'pangsapuri', 'kondominium',
  'residensi', 'apartment', 'flat', 'pusat', 'presint', 'precinct',
])
const GENERIC_AREA = new Set([
  'taman', 'bandar', 'kampung', 'seksyen', 'section', 'malaysia', 'wilayah', 'persekutuan', 'wp', 'darul', 'ehsan', 'takzim', 'aman', 'ridzuan',
  'khusus', 'naim', 'makmur', 'state', 'of', 'the', 'and',
])

const POSTCODE = /(?<!\d)\d{5}(?!\d)/

function tokenize(part: string): string[] {
  return part
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\-/\s]/gu, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[-/]+|[-/]+$/g, ''))
    .map((t) => ABBR[t] ?? t)
    .filter((t) => t && !DROP.has(t))
}

const hasDigit = (t: string) => /\d/.test(t)

export interface ParsedAddress {
  house: string        // 门牌(可能是 12、12a、a-3-5)
  street: string       // 例如 jalanss2/24
  postcode: string
  area: string[]       // 街道之后的地区词
  flat: string         // 整个地址规范化后的字符串
}

export function parseAddress(raw: string): ParsedAddress {
  const text = raw ?? ''
  const postcode = text.match(POSTCODE)?.[0] ?? ''
  const parts = text.split(/[,\n;]+/).map(tokenize).filter((p) => p.length)
  const flat = parts.map((p) => p.join(' ')).join(' ')

  const si = parts.findIndex((p) => p.some((t) => STREET.has(t)))
  if (si < 0) return { house: '', street: '', postcode, area: [], flat }

  const sp = parts[si]
  const ki = sp.findIndex((t) => STREET.has(t))
  const houseTokens = [
    ...parts.slice(0, si).flat().filter(hasDigit),
    ...sp.slice(0, ki).filter(hasDigit),
  ].filter((t) => t !== postcode)

  // 街道:从关键词开始,遇到邮编或地区起始词为止(兼容没有逗号的地址)
  let end = sp.length
  for (let i = ki + 2; i < sp.length; i++) { // 关键词后第一个词一定属于街名(如 Jalan Desa 3)
    if (sp[i] === postcode || AREA_START.has(sp[i])) { end = i; break }
  }
  const street = sp.slice(ki, end).join('')
  const area = [...sp.slice(end), ...parts.slice(si + 1).flat()]
    .filter((t) => t !== postcode && !hasDigit(t) && t.length >= 3 && !GENERIC_AREA.has(t))

  return { house: houseTokens.join(' '), street, postcode, area, flat }
}

export function sameAddress(a: string, b: string): boolean {
  const pa = parseAddress(a)
  const pb = parseAddress(b)
  if (!pa.flat || !pb.flat) return false
  if (pa.flat === pb.flat) return true
  if (!pa.house || !pb.house || !pa.street || !pb.street) return false
  if (pa.house !== pb.house || pa.street !== pb.street) return false
  if (pa.postcode && pb.postcode) return pa.postcode === pb.postcode
  if (pa.area.length && pb.area.length) return pa.area.some((t) => pb.area.includes(t))
  return true
}

/** 在家庭登记的地址里找出和信件地址相同的那一个。 */
export function findAddress<T extends { address: string }>(letterAddress: string | null, saved: T[]): T | null {
  if (!letterAddress) return null
  return saved.find((s) => sameAddress(letterAddress, s.address)) ?? null
}
