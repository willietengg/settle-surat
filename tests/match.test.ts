import { describe, expect, it } from 'vitest'
import { matchRecipients, namesMatch } from '../supabase/functions/_shared/match'

describe('namesMatch', () => {
  it('忽略大小写、标点、称谓', () => {
    expect(namesMatch('MR. WILLIE TENG', 'Willie Teng')).toBe(true)
  })
  it('姓名顺序不同也算', () => {
    expect(namesMatch('Teng Willie', 'Willie Teng')).toBe(true)
  })
  it('单字母缩写', () => {
    expect(namesMatch('W Teng', 'Willie Teng')).toBe(true)
    expect(namesMatch('W. Teng', 'Willie Teng')).toBe(true)
  })
  it('只有姓不算匹配(宁可误报)', () => {
    expect(namesMatch('Teng', 'Willie Teng')).toBe(false)
  })
  it('同姓不同名不匹配', () => {
    expect(namesMatch('John Teng', 'Willie Teng')).toBe(false)
  })
  it('单 token 名字需完全相等', () => {
    expect(namesMatch('Madonna', 'Madonna')).toBe(true)
    expect(namesMatch('Madonna', 'Madonna Ciccone')).toBe(false)
  })
  it('中文姓名', () => {
    expect(namesMatch('陈大文先生', '陈大文')).toBe(true)
    expect(namesMatch('陈小明', '陈大文')).toBe(false)
  })
  it('空值', () => {
    expect(namesMatch('', 'Willie Teng')).toBe(false)
  })
})

describe('matchRecipients', () => {
  const members = [
    { id: 'a', display_name: 'Willie Teng', aliases: ['Teng Wei Li'] },
    { id: 'b', display_name: 'Mary Chan', aliases: [] },
  ]
  it('匹配多个收件人并报告未匹配的', () => {
    const r = matchRecipients(['Mr W Teng', 'Mary Chan', 'Stranger Person'], members)
    expect(r.memberIds.sort()).toEqual(['a', 'b'])
    expect(r.unmatchedNames).toEqual(['Stranger Person'])
  })
  it('别名生效', () => {
    expect(matchRecipients(['TENG WEI LI'], members).memberIds).toEqual(['a'])
  })
  it('"Current Resident" 不匹配任何人', () => {
    const r = matchRecipients(['The Current Resident'], members)
    expect(r.memberIds).toEqual([])
    expect(r.unmatchedNames).toEqual(['The Current Resident'])
  })
})
