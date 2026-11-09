// 极简线性图标(24px 网格,1.8 描边),颜色跟随 currentColor
import type { SVGProps } from 'react'

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...p,
})

export const IconInbox = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 13.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4.5" /><path d="M4 13.5 6.4 5.6A2 2 0 0 1 8.3 4h7.4a2 2 0 0 1 1.9 1.6L20 13.5" /><path d="M4 13.5h4.5l1 2h5l1-2H20" /></svg>
)
export const IconPeople = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><circle cx="17" cy="9.5" r="2.4" /><path d="M16 14.2a4.5 4.5 0 0 1 4.5 4.8" /></svg>
)
export const IconShield = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 3.5 5 6v5.5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6l-7-2.5Z" /><path d="m9.2 12 2 2 3.8-4" /></svg>
)
export const IconLogout = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M14 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 16l-4-4 4-4" /><path d="M6 12h9" /></svg>
)
export const IconPlus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
)
export const IconCamera = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.3l1.4-2h5.6l1.4 2h1.3A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-8Z" /><circle cx="12" cy="12.5" r="3.5" /></svg>
)
export const IconClip = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="m20 11.5-7.8 7.8a5 5 0 0 1-7-7l8-8a3.3 3.3 0 0 1 4.7 4.7l-8 8a1.7 1.7 0 0 1-2.4-2.4l7.4-7.4" /></svg>
)
export const IconPin = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base({ width: 13, height: 13, strokeWidth: 2.2, ...p })}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" /></svg>
)
export const IconMail = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path d="m4.5 7 7.5 6 7.5-6" /></svg>
)
