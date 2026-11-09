import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

export interface PillItem { to: string; label: ReactNode; icon?: ReactNode; end?: boolean }

/** 分段导航:选中项下面有一块玻璃胶囊,切换时用弹簧滑过去(从当前位置出发,可中途改变方向)。 */
export function PillNav({ items, className = '' }: { items: PillItem[]; className?: string }) {
  const ref = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  const [ind, setInd] = useState({ x: 0, y: 0, w: 0, h: 0, ready: false })

  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const measure = () => {
      const a = root.querySelector<HTMLElement>('a.active')
      if (!a) return setInd((s) => ({ ...s, w: 0 }))
      setInd((s) => ({ x: a.offsetLeft, y: a.offsetTop, w: a.offsetWidth, h: a.offsetHeight, ready: s.ready || s.w > 0 }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    root.querySelectorAll('a').forEach((a) => ro.observe(a))
    return () => ro.disconnect()
  }, [pathname, items.length])

  return (
    <nav ref={ref} className={`pillnav ${className}`}>
      <span className="pill-indicator" data-ready={ind.ready} aria-hidden
        style={{ transform: `translate(${ind.x}px, ${ind.y}px)`, width: ind.w, height: ind.h, opacity: ind.w ? 1 : 0 }} />
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} end={i.end}>{i.icon}<span>{i.label}</span></NavLink>
      ))}
    </nav>
  )
}
