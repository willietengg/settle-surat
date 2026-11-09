import { useRef, useState, type PointerEvent } from 'react'

/**
 * Liquid-glass 开关(参考 iOS 26):
 * - 按下瞬间(pointer-down)圆钮拉长并变成玻璃透镜 → 即时反馈
 * - 按住左右拖动可以预览切换方向(1:1 跟手),松开才提交
 * - 松开后圆钮用带一点回弹的弹簧滑过去;CSS transition 从当前值重新出发,可随时反向
 * - 键盘(空格 / 回车)同样可用;role="switch" 给读屏软件
 */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  const [pressed, setPressed] = useState(false)
  const [preview, setPreview] = useState<boolean | null>(null)
  const start = useRef<number | null>(null)

  const end = () => { setPressed(false); setPreview(null); start.current = null }

  function down(e: PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = e.clientX
    setPressed(true)
  }
  function move(e: PointerEvent<HTMLButtonElement>) {
    if (start.current == null) return
    const dx = e.clientX - start.current
    setPreview(Math.abs(dx) > 8 ? dx > 0 : null) // ~8px 迟滞后才认定拖动方向
  }
  function up(e: PointerEvent<HTMLButtonElement>) {
    if (start.current == null) return
    const r = e.currentTarget.getBoundingClientRect()
    const pad = 16 // 手指稍微滑出边界仍算点击
    const inside = e.clientX > r.left - pad && e.clientX < r.right + pad && e.clientY > r.top - pad && e.clientY < r.bottom + pad
    const next = preview ?? (inside ? !checked : checked)
    end()
    if (next !== checked) {
      onChange(next)
      try { navigator.vibrate?.(8) } catch { /* 不支持就算了 */ }
    }
  }

  const on = preview ?? checked
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} title={label}
      className="gswitch" data-on={on} data-pressed={pressed}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={end}
      onClick={(e) => { if (e.detail === 0) onChange(!checked) }} // 只处理键盘触发的 click
    >
      <span className="gswitch-thumb" />
    </button>
  )
}
