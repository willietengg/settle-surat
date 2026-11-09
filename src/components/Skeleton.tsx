/** 加载中的占位卡片(比 "Loading…" 文字更平稳,内容出来时不会跳) */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="stack" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="card skel-card">
          <div className="skel" style={{ width: '42%', height: 18 }} />
          <div className="skel" style={{ width: '28%', height: 12 }} />
          <div className="skel" style={{ width: '86%', height: 12 }} />
        </div>
      ))}
    </div>
  )
}
