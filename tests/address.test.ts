import { describe, expect, it } from 'vitest'
import { parseAddress, sameAddress } from '../src/lib/address'

const HOME = 'No. 12, Jalan SS2/24, 47300 Petaling Jaya, Selangor'

describe('parseAddress', () => {
  it('拆出门牌 / 街道 / 邮编', () => {
    const p = parseAddress(HOME)
    expect(p.house).toBe('12')
    expect(p.street).toBe('jalanss2/24')
    expect(p.postcode).toBe('47300')
  })
  it('门牌和街道在同一段', () => {
    const p = parseAddress('12 Jln Bukit Bintang, 55100 Kuala Lumpur')
    expect(p.house).toBe('12')
    expect(p.street).toBe('jalanbukitbintang')
  })
  it('公寓单位号', () => {
    expect(parseAddress('A-3-5, Residensi Harmoni, Jalan Ampang, 50450 KL').house).toBe('a-3-5')
  })
})

describe('sameAddress', () => {
  it('缩写、大小写、标点不同仍算同一个', () => {
    expect(sameAddress(HOME, '12 JLN SS 2/24 47300 PETALING JAYA SELANGOR DARUL EHSAN')).toBe(true) // 没有逗号
    expect(sameAddress(HOME, '12, JLN SS 2/24, 47300 PETALING JAYA, SELANGOR DARUL EHSAN')).toBe(true)
  })
  it('没有邮编时比地区名', () => {
    expect(sameAddress('12, Jalan Mawar, Taman Melati, Kuala Lumpur', '12 Jalan Mawar, Tmn Melati')).toBe(true)
  })
  it('没有逗号、靠 Taman 断开街道', () => {
    expect(sameAddress('12 Jalan Mawar Taman Melati 53100 KL', '12, Jalan Mawar, Taman Melati, 53100 Kuala Lumpur')).toBe(true)
  })
  it('同一街道同门牌但不同 Taman(无邮编)→ 不同', () => {
    expect(sameAddress('12, Jalan 1, Taman Melati', '12, Jalan 1, Taman Bunga Raya')).toBe(false)
  })
  it('门牌不同 → 不同', () => {
    expect(sameAddress(HOME, 'No. 14, Jalan SS2/24, 47300 Petaling Jaya')).toBe(false)
  })
  it('街道不同 → 不同', () => {
    expect(sameAddress(HOME, 'No. 12, Jalan SS2/25, 47300 Petaling Jaya')).toBe(false)
  })
  it('邮编不同 → 不同', () => {
    expect(sameAddress('12, Jalan Mawar, 50000 KL', '12, Jalan Mawar, 81200 Johor Bahru')).toBe(false)
  })
  it('缺少门牌无法判断 → 不同', () => {
    expect(sameAddress('Jalan Mawar, 50000 KL', '12, Jalan Mawar, 50000 KL')).toBe(false)
  })
  it('完全一样的字符串(即使没有街道关键词)', () => {
    expect(sameAddress('Lot 5 Kampung Baru', 'lot 5 kampung baru')).toBe(true)
  })
  it('空值', () => {
    expect(sameAddress('', HOME)).toBe(false)
  })
})
