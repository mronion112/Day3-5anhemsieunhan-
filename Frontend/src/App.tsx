import {
  useState, useRef, useEffect, useCallback, useLayoutEffect,
  type ReactNode,
} from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type AgentStatus = 'online' | 'processing' | 'offline'
type Phase = 'requesting' | 'thinking' | 'streaming' | 'completed' | 'error'

interface BackendLog { time_in: string; time_out: string }
interface BackendInteraction { id: string; label: string }
interface BackendResponse {
  thinking_process: string
  interaction: BackendInteraction
  input_token: number
  output_token: number
  title: string
  price: number
  currency: string
  log: BackendLog
  answer: string
}

interface AiMsg {
  id: string
  phase: Phase
  thinkingLines: string[]
  streamedAnswer: string
  response: BackendResponse | null
  userPrompt: string
}

interface ConvEntry { id: string; title: string; group: 'Today' | 'Yesterday' }

// ─────────────────────────────────────────────────────────────────────────────
// Mock data
// ─────────────────────────────────────────────────────────────────────────────

const THINK_STEPS = [
  'Phân tích câu hỏi của người dùng...',
  'Tìm kiếm cơ sở dữ liệu sách...',
  'Truy xuất siêu dữ liệu tác giả và xuất bản...',
  'Đối chiếu nội dung theo chủ đề...',
  'Đánh giá nhân vật và bối cảnh cốt truyện...',
  'Tổng hợp các thông tin quan trọng...',
  'Cấu trúc hóa phác thảo câu trả lời...',
  'Tạo câu trả lời cuối cùng...',
]

const ANSWERS: { match: string; text: string }[] = [
  {
    match: 'tóm tắt',
    text: `## Tóm tắt nội dung

Cuốn sách trình bày một hệ thống tư duy mới về thói quen và sự thay đổi cá nhân. Tác giả xây dựng luận điểm rằng **1% cải thiện mỗi ngày** sẽ tạo ra tác động khổng lồ theo thời gian.

**Cấu trúc chính của sách:**
* Phần 1: Nền tảng — Tại sao thói quen nhỏ tạo ra kết quả lớn
* Phần 2: Bốn quy luật thay đổi hành vi
* Phần 3: Nguyên lý Goldilocks và duy trì động lực
* Phần 4: Mặt tối của thói quen tốt

> "You do not rise to the level of your goals. You fall to the level of your systems."

Đây là một trong những cuốn sách phát triển bản thân được đánh giá cao nhất thập kỷ qua.`,
  },
  {
    match: 'nhân vật',
    text: `## Nhân vật chính

Cuốn sách này là tác phẩm **phi hư cấu** nên không có nhân vật theo nghĩa truyền thống. Tuy nhiên, tác giả **James Clear** là người dẫn dắt xuyên suốt thông qua:

* Câu chuyện cá nhân về chấn thương và quá trình phục hồi
* Nghiên cứu từ các vận động viên, doanh nhân, và nhà khoa học
* Ví dụ điển hình từ **Team Sky cycling** và British cycling

Các "nhân vật" đáng chú ý: Dave Brailsford, Jerry Uelsmann, và nhiều cá nhân thành công khác được trích dẫn trong sách.`,
  },
  {
    match: 'chủ đề',
    text: `## Chủ đề chính

Cuốn sách xây dựng xung quanh **ba chủ đề cốt lõi**:

### 1. Sức mạnh của thói quen nhỏ
Những thay đổi nhỏ, khi được duy trì nhất quán, tạo ra kết quả phi thường theo nguyên lý lãi kép.

### 2. Thay đổi dựa trên bản sắc
Thay vì đặt mục tiêu kết quả ("Tôi muốn đọc nhiều hơn"), hãy xây dựng bản sắc ("Tôi là người yêu sách").

### 3. Bốn quy luật hành vi
* **Cue** — Làm cho nó rõ ràng
* **Craving** — Làm cho nó hấp dẫn
* **Response** — Làm cho nó dễ dàng
* **Reward** — Làm cho nó thỏa mãn`,
  },
  {
    match: 'phù hợp',
    text: `## Đối tượng phù hợp

Cuốn sách này **phù hợp rộng rãi** với nhiều nhóm độc giả:

**Dành cho bạn nếu:**
* Bạn muốn xây dựng thói quen tốt và loại bỏ thói quen xấu
* Bạn quan tâm đến năng suất cá nhân và self-improvement
* Bạn là nhà quản lý muốn xây dựng văn hóa tổ chức tốt
* Bạn là vận động viên hoặc chuyên gia muốn cải thiện hiệu suất

**Không cần nền tảng gì đặc biệt** — ngôn ngữ dễ đọc, ví dụ thực tế, áp dụng ngay trong cuộc sống.

*Độ tuổi phù hợp: 16 trở lên.*`,
  },
]

function getAnswer(p: string): string {
  const l = p.toLowerCase()
  return ANSWERS.find((a) => l.includes(a.match))?.text ??
    `## Overview

This book explores the intersection of human psychology and behavioral patterns, offering a compelling framework for understanding personal growth.

**Key themes include:**
* The compound effect of small, consistent habits
* Identity-based change vs. outcome-based goals
* The role of environment in shaping behavior
* Systems thinking applied to daily routines

The author argues that lasting transformation comes not from dramatic shifts but from the **aggregation of marginal gains** — tiny improvements that compound over time into remarkable results.

This is an essential read for anyone interested in productivity, self-improvement, or behavioral science.`
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// async function* mockStream(prompt: string): AsyncGenerator<Partial<AiMsg>> {
//   const t0 = new Date().toISOString()

//   for (let i = 0; i < THINK_STEPS.length; i++) {
//     await sleep(240 + Math.random() * 180)
//     yield { phase: 'thinking', thinkingLines: THINK_STEPS.slice(0, i + 1) }
//   }

//   const full = getAnswer(prompt)
//   yield { phase: 'streaming', streamedAnswer: '' }
//   await sleep(200)

//   let streamed = ''
//   const chars = [...full]
//   for (let i = 0; i < chars.length; i += 5) {
//     await sleep(12 + Math.random() * 10)
//     streamed += chars.slice(i, i + 5).join('')
//     yield { phase: 'streaming', streamedAnswer: streamed }
//   }

//   const t1 = new Date().toISOString()
//   const inp = 720 + Math.floor(Math.random() * 800)
//   const out = 280 + Math.floor(Math.random() * 320)
//   yield {
//     phase: 'completed',
//     streamedAnswer: full,
//     response: {
//       thinking_process: THINK_STEPS.join('\n'),
//       interaction: {
//         id: `#${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
//         label: '1 request → 1 response',
//       },
//       input_token: inp,
//       output_token: out,
//       title: prompt.length > 46 ? prompt.slice(0, 46) + '…' : prompt,
//       price: Math.round((inp * 0.003 + out * 0.015) * 23000),
//       currency: '₫',
//       log: { time_in: t0, time_out: t1 },
//       answer: full,
//     },
//   }
// }


async function* realStream(prompt: string): AsyncGenerator<Partial<AiMsg>> {
  // const response = await fetch('http://localhost:8000/api/chat', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ user_prompt: prompt }),
  // })
  const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ user_prompt: prompt }),
  })

  if (!response.ok) {
    throw new Error(`HTTP Error status: ${response.status}`)
  }

  if (!response.body) {
    throw new Error('ReadableStream is not supported by backend response.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  
  let thinkingLines: string[] = []
  let accumulatedAnswer = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    // Đọc dữ liệu thô và ghép vào buffer
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    
    // Giữ lại phần chưa hoàn chỉnh cuối cùng vào buffer
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      try {
        const data = JSON.parse(trimmed)

        // 1. Trạng thái Backend đang suy nghĩ
        if (data.state === 'thinking') {
          thinkingLines = [...thinkingLines, data.message]
          yield {
            phase: 'thinking',
            thinkingLines,
          }
        } 
        // 2. Trạng thái Backend đang bắn câu trả lời dạng stream chunk
        else if (data.state === 'generating') {
          accumulatedAnswer += data.chunk
          yield {
            phase: 'streaming',
            streamedAnswer: accumulatedAnswer,
          }
        } 
        // 3. Trạng thái hoàn tất - Nhận Metadata (Token, Cost, Time)
        else if (data.state === 'completed') {
          yield {
            phase: 'completed',
            streamedAnswer: accumulatedAnswer,
            response: {
              thinking_process: data.thinking_process || thinkingLines.join('\n'),
              interaction: data.interaction || { id: 'req_live', label: '1 request → 1 response' },
              input_token: data.input_token || 0,
              output_token: data.output_token || 0,
              title: prompt.length > 40 ? prompt.slice(0, 40) + '…' : prompt,
              price: data.price?.amount || 0,
              currency: data.price?.currency === 'USD' ? '$' : '₫',
              log: data.log || { time_in: new Date().toISOString(), time_out: new Date().toISOString() },
              answer: accumulatedAnswer,
            },
          }
        } 
        // 4. Báo lỗi nếu Backend trả lỗi nội bộ
        else if (data.state === 'error') {
          throw new Error(data.message || 'Backend returned an error.')
        }
      } catch (err) {
        console.error('Lỗi parse dòng JSON:', trimmed, err)
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const fmtN = (n: number) => n.toLocaleString('en-US')
const fmtPrice = (p: number, c = '₫') =>
  p === 0 ? `0 ${c}` : p < 1 ? `${p.toFixed(6)} ${c}` : `${Math.round(p).toLocaleString('en-US')} ${c}`

function fmtTime(iso: string) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    const hms = d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    return `${hms}.${String(d.getMilliseconds()).padStart(3, '0')}`
  } catch { return iso }
}
function fmtDur(a: string, b: string) {
  try { return ((new Date(b).getTime() - new Date(a).getTime()) / 1000).toFixed(3) + 's' }
  catch { return '—' }
}

function mdToHtml(raw: string): string {
  let s = raw
  s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  s = s.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  s = s.replace(/^# (.+)$/gm, '<h1>$1</h1>')
  s = s.replace(/^\* (.+)$/gm, '<li>$1</li>')
  s = s.replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
  s = s.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
  s = s.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>')
  s = s.replace(/`(.+?)`/g, '<code>$1</code>')
  s = s.split('\n\n').map((b) => /^<[hbul]/.test(b.trim()) ? b : `<p>${b.trim()}</p>`).join('')
  return s
}

// ─────────────────────────────────────────────────────────────────────────────
// Atoms
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AgentStatus }) {
  const map = {
    online:     { dot: '#2d7a5c', label: 'Online',     shadow: '#2d7a5c40' },
    processing: { dot: '#d97706', label: 'Processing', shadow: '#d9770640' },
    offline:    { dot: '#b8b8b0', label: 'Offline',    shadow: 'transparent' },
  }
  const { dot, label, shadow } = map[status]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
        background: dot, boxShadow: `0 0 6px ${shadow}`,
        animation: status === 'processing' ? 'pulse 1.3s ease-in-out infinite' : 'none',
      }} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: dot, letterSpacing: '.05em' }}>
        {label}
      </span>
    </span>
  )
}

function Dots({ color = '#2d7a5c' }: { color?: string }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{
          display: 'inline-block', width: 3, height: 3, borderRadius: '50%',
          background: color, animation: `pulse 1s ${i * 0.18}s ease-in-out infinite`,
        }} />
      ))}
    </span>
  )
}

function Spinner({ size = 13 }: { size?: number }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size,
      border: '1.5px solid var(--border)', borderTopColor: '#2d7a5c',
      borderRadius: '50%', animation: 'spin .7s linear infinite',
    }} />
  )
}

function Label({ children }: { children: ReactNode }) {
  return (
    <div style={{
      fontFamily: 'var(--font-mono)', fontSize: 9.5,
      letterSpacing: '.1em', textTransform: 'uppercase',
      color: 'var(--fg-ghost)', marginBottom: 8,
    }}>
      {children}
    </div>
  )
}

function MRow({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, gap: 8 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-ghost)' }}>{label}</span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 11,
        color: green ? 'var(--accent-green)' : 'var(--fg-muted)',
        fontWeight: green ? 500 : 400,
      }}>{value}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Thinking block
// ─────────────────────────────────────────────────────────────────────────────

function ThinkingBlock({ lines, phase }: { lines: string[]; phase: Phase }) {
  const [collapsed, setCollapsed] = useState(false)
  const isLive = phase === 'thinking' || phase === 'streaming'

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 10,
      overflow: 'hidden',
      marginBottom: 10,
      background: 'var(--bg-panel)',
    }}>
      <button
        onClick={() => setCollapsed((c) => !c)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 14px', background: 'transparent', border: 'none',
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 10, color: 'var(--fg-ghost)' }}>✦</span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.08em',
          textTransform: 'uppercase', color: 'var(--fg-ghost)',
        }}>
          Thinking Process
        </span>
        {isLive && <span style={{ marginLeft: 2 }}><Dots color="#9a9a90" /></span>}
        {!isLive && (
          <span style={{
            marginLeft: 'auto', fontFamily: 'var(--font-mono)',
            fontSize: 9.5, color: 'var(--fg-ghost)',
          }}>
            {lines.length} steps
          </span>
        )}
        <span style={{ marginLeft: isLive ? 'auto' : 0, color: 'var(--fg-ghost)', fontSize: 10 }}>
          {collapsed ? '▸' : '▾'}
        </span>
      </button>

      {!collapsed && (
        <div style={{
          padding: '8px 14px 12px',
          maxHeight: 160,
          overflowY: 'auto',
          borderTop: '1px solid var(--border)',
          maskImage: 'linear-gradient(to bottom, #000 50%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, #000 50%, transparent 100%)',
        }}>
          {lines.map((line, i) => {
            const fromEnd = lines.length - 1 - i
            const isLatest = fromEnd === 0
            const opacity = isLatest ? 0.65 : Math.max(0.1, 0.55 - fromEnd * 0.08)
            const blur = isLatest ? 0 : Math.min(fromEnd * 0.3, 1.4)
            return (
              <div key={i} className="think-line" style={{
                opacity, filter: blur > 0 ? `blur(${blur}px)` : 'none',
                color: isLatest ? 'var(--fg-muted)' : 'var(--fg-ghost)',
              }}>
                <span style={{
                  flexShrink: 0, fontSize: 8, marginTop: 3,
                  color: isLatest && isLive ? 'var(--accent-green)' : 'var(--fg-ghost)',
                  transition: 'color .3s',
                }}>
                  {isLatest && isLive ? '▸' : '·'}
                </span>
                {line}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Observability panel
// ─────────────────────────────────────────────────────────────────────────────

function ObsPanel({ r }: { r: BackendResponse }) {
  const [open, setOpen] = useState(false)
  const total = r.input_token + r.output_token
  const dur = fmtDur(r.log.time_in, r.log.time_out)
  const cur = r.currency ?? '₫'

  return (
    <div style={{ marginTop: 10 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 14px',
          background: open ? 'var(--bg-panel)' : 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: open ? '10px 10px 0 0' : 10,
          cursor: 'pointer', userSelect: 'none', transition: 'border-radius .15s',
        }}
      >
        <span style={{ fontSize: 10, color: 'var(--fg-ghost)' }}>◈</span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '.1em',
          textTransform: 'uppercase', color: 'var(--fg-ghost)',
        }}>
          Response Details
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--accent-green)', fontWeight: 500 }}>
            {fmtPrice(r.price, cur)}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-ghost)' }}>
            {fmtN(total)} tok
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-ghost)' }}>
            {dur}
          </span>
          <span style={{ color: 'var(--fg-ghost)', fontSize: 10 }}>{open ? '▴' : '▾'}</span>
        </span>
      </button>

      {open && (
        <div className="fade-in" style={{
          background: '#fafaf8',
          border: '1px solid var(--border)', borderTop: 'none',
          borderRadius: '0 0 10px 10px',
          padding: '16px 16px 14px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '0 24px',
        }}>
          {/* Tokens */}
          <div>
            <Label>Tokens</Label>
            <MRow label="Input" value={`${fmtN(r.input_token)} tok`} />
            <MRow label="Output" value={`${fmtN(r.output_token)} tok`} />
            <MRow label="Total" value={`${fmtN(total)} tok`} green />
          </div>

          {/* Cost + Interaction */}
          <div>
            <Label>Cost</Label>
            <MRow label="Amount" value={fmtPrice(r.price, cur)} green />
            <div style={{ marginTop: 12 }}>
              <Label>Interaction</Label>
              <MRow label="ID" value={r.interaction.id} />
              <MRow label="Flow" value={r.interaction.label} />
            </div>
          </div>

          {/* Log */}
          <div>
            <Label>Execution Log</Label>
            <MRow label="Time In" value={fmtTime(r.log.time_in)} />
            <MRow label="Time Out" value={fmtTime(r.log.time_out)} />
            <MRow label="Duration" value={dur} green />
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// User message
// ─────────────────────────────────────────────────────────────────────────────

function UserMessage({ content }: { content: string }) {
  return (
    <div className="fade-up" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
      <div style={{
        maxWidth: '72%',
        background: 'var(--bg-user)',
        border: '1px solid var(--border)',
        borderRadius: '14px 14px 4px 14px',
        padding: '11px 16px',
        fontSize: 14,
        lineHeight: 1.65,
        color: 'var(--fg)',
        wordBreak: 'break-word',
        boxShadow: 'var(--shadow-sm)',
      }}>
        {content}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AI message
// ─────────────────────────────────────────────────────────────────────────────

function AiMessage({ msg, onRetry }: { msg: AiMsg; onRetry: () => void }) {
  const { phase, thinkingLines, streamedAnswer, response } = msg
  const showThink = ['thinking', 'streaming', 'completed'].includes(phase) && thinkingLines.length > 0
  const showAnswer = phase === 'streaming' || phase === 'completed'

  return (
    <div className="fade-up" style={{ marginBottom: 28 }}>
      {/* AI avatar row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          background: 'var(--bg-white)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, boxShadow: 'var(--shadow-sm)',
        }}>
          📚
        </div>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.07em',
          textTransform: 'uppercase', color: 'var(--fg-ghost)',
        }}>
          Book AI
        </span>
        {response?.title && (
          <span style={{
            fontSize: 11.5, color: 'var(--fg-ghost)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300,
          }}>
            — {response.title}
          </span>
        )}
      </div>

      {/* Requesting */}
      {phase === 'requesting' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 0', fontFamily: 'var(--font-mono)',
          fontSize: 12, color: 'var(--fg-muted)', letterSpacing: '.03em',
        }}>
          <Spinner />
          AI is preparing…
        </div>
      )}

      {/* Thinking */}
      {showThink && <ThinkingBlock lines={thinkingLines} phase={phase} />}

      {/* Answer card */}
      {showAnswer && (
        <div style={{
          background: 'var(--bg-white)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)',
        }}>
          {/* Answer header */}
          <div style={{
            padding: '9px 16px',
            borderBottom: '1px solid var(--border)',
            background: '#fafaf8',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 10, color: 'var(--accent-green)', opacity: 0.8 }}>✦</span>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '.1em',
              textTransform: 'uppercase', color: 'var(--fg-muted)',
            }}>
              Answer
            </span>
            {phase === 'streaming' && (
              <span style={{ marginLeft: 4 }}><Dots /></span>
            )}
          </div>
          {/* Answer body */}
          <div style={{ padding: '18px 20px' }}>
            <div
              className={`prose${phase === 'streaming' ? ' cursor' : ''}`}
              dangerouslySetInnerHTML={{ __html: mdToHtml(streamedAnswer) }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && (
        <div style={{
          background: 'var(--red-bg)', border: '1px solid #f0d0cc',
          borderRadius: 10, padding: '16px 20px',
        }}>
          <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--red)', marginBottom: 5 }}>
            Something went wrong.
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11.5, color: '#a05050', marginBottom: 14,
          }}>
            We couldn't generate an answer. Please try again.
          </div>
          <button
            onClick={onRetry}
            style={{
              background: 'var(--bg-white)', border: '1px solid #d0b0b0',
              borderRadius: 6, color: 'var(--red)', fontSize: 12,
              fontFamily: 'var(--font-mono)', padding: '6px 14px',
              cursor: 'pointer', letterSpacing: '.05em', transition: 'all .18s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#fff0ee' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-white)' }}
          >
            ↺ Retry
          </button>
        </div>
      )}

      {/* Observability */}
      {phase === 'completed' && response && <ObsPanel r={response} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  'Tóm tắt nội dung của cuốn sách này',
  'Nhân vật chính trong sách là ai?',
  'Chủ đề chính của cuốn sách là gì?',
  'Cuốn sách này phù hợp với ai?',
]

function EmptyState({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '48px 24px', gap: 36, animation: 'fadeIn .4s ease',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 60, height: 60, borderRadius: 16,
          background: 'var(--bg-white)', border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-md)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26, margin: '0 auto 20px',
        }}>
          📚
        </div>
        <h1 style={{
          margin: '0 0 10px', fontSize: 22, fontWeight: 600,
          letterSpacing: '-.025em', color: 'var(--fg)',
        }}>
          Book AI
        </h1>
        <p style={{
          margin: 0, fontFamily: 'var(--font-mono)', fontSize: 12,
          color: 'var(--fg-muted)', letterSpacing: '.03em',
        }}>
          Ask anything about books.
        </p>
      </div>

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8,
        justifyContent: 'center', maxWidth: 520,
      }}>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            style={{
              background: 'var(--bg-white)', border: '1px solid var(--border)',
              borderRadius: 100, padding: '8px 16px',
              fontSize: 13, color: 'var(--fg-dim)', cursor: 'pointer',
              fontFamily: 'var(--font-sans)', lineHeight: 1.4,
              boxShadow: 'var(--shadow-sm)', transition: 'all .18s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-hi)'
              e.currentTarget.style.boxShadow = 'var(--shadow-md)'
              e.currentTarget.style.color = 'var(--fg)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
              e.currentTarget.style.color = 'var(--fg-dim)'
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────────────────────────────────────

const DEMO_CONVS: ConvEntry[] = [
  { id: 'c1', title: 'What is Atomic Habits?', group: 'Today' },
  { id: 'c2', title: 'Understanding the Dune universe', group: 'Today' },
  { id: 'c3', title: 'Harry Potter character analysis', group: 'Yesterday' },
  { id: 'c4', title: "Sapiens — key takeaways", group: 'Yesterday' },
]

function Sidebar({
  convs, activeId, onSelect, onNew, onClose,
}: {
  convs: ConvEntry[]; activeId: string | null
  onSelect: (id: string) => void; onNew: () => void; onClose?: () => void
}) {
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--bg-white)', borderRight: '1px solid var(--border)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 14px 12px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '.1em',
          textTransform: 'uppercase', color: 'var(--fg-ghost)',
        }}>
          History
        </span>
        {onClose && (
          <button onClick={onClose} aria-label="Close" style={{
            background: 'none', border: 'none', color: 'var(--fg-muted)',
            cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1,
          }}>✕</button>
        )}
      </div>

      {/* New chat */}
      <div style={{ padding: '10px 10px 6px', flexShrink: 0 }}>
        <button
          onClick={onNew}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', background: 'var(--bg)',
            border: '1px solid var(--border)', borderRadius: 8,
            color: 'var(--fg-dim)', fontSize: 12.5, cursor: 'pointer',
            fontFamily: 'var(--font-sans)', transition: 'all .18s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-hi)'
            e.currentTarget.style.color = 'var(--fg)'
            e.currentTarget.style.background = 'var(--bg-panel)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.color = 'var(--fg-dim)'
            e.currentTarget.style.background = 'var(--bg)'
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1, fontWeight: 300 }}>+</span>
          New Chat
        </button>
      </div>

      {/* Conv list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0 16px' }}>
        {(['Today', 'Yesterday'] as const).map((g) => {
          const items = convs.filter((c) => c.group === g)
          if (!items.length) return null
          return (
            <div key={g}>
              <div style={{
                padding: '10px 14px 4px',
                fontFamily: 'var(--font-mono)', fontSize: 9.5,
                letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--fg-ghost)',
              }}>
                {g}
              </div>
              {items.map((c) => {
                const active = c.id === activeId
                return (
                  <button
                    key={c.id}
                    onClick={() => { onSelect(c.id); onClose?.() }}
                    style={{
                      width: '100%', textAlign: 'left', display: 'block',
                      padding: '8px 14px',
                      background: active ? 'var(--bg-panel)' : 'transparent',
                      borderLeft: `2px solid ${active ? 'var(--accent-green)' : 'transparent'}`,
                      border: 'none', borderLeftWidth: 2, borderLeftStyle: 'solid',
                      borderLeftColor: active ? 'var(--accent-green)' : 'transparent',
                      color: active ? 'var(--fg)' : 'var(--fg-muted)',
                      fontSize: 12.5, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                      lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap', transition: 'all .15s',
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = 'var(--fg-dim)' }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = 'var(--fg-muted)' }}
                  >
                    {c.title}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat input
// ─────────────────────────────────────────────────────────────────────────────

function ChatInput({
  value, onChange, onSend, disabled,
}: {
  value: string; onChange: (v: string) => void
  onSend: () => void; disabled: boolean
}) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const [focused, setFocused] = useState(false)

  useLayoutEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 132)}px`
  }, [value])

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() }
  }

  const canSend = value.trim().length > 0 && !disabled

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 10,
        background: 'var(--bg-input)',
        border: `1px solid ${focused ? 'var(--border-focus)' : 'var(--border)'}`,
        borderRadius: 12,
        padding: '10px 10px 10px 16px',
        boxShadow: focused
          ? '0 0 0 3px rgba(45,122,92,.08), var(--shadow-sm)'
          : 'var(--shadow-sm)',
        transition: 'border-color .2s, box-shadow .2s',
      }}>
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={disabled}
          placeholder="Ask anything about books…"
          rows={1}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            resize: 'none', color: disabled ? 'var(--fg-ghost)' : 'var(--fg)',
            fontSize: 14, lineHeight: 1.6, fontFamily: 'var(--font-sans)',
            caretColor: 'var(--accent-green)',
            maxHeight: 132, overflowY: 'auto', scrollbarWidth: 'none',
          }}
        />
        <button
          onClick={onSend}
          disabled={!canSend}
          aria-label="Send message"
          style={{
            flexShrink: 0, width: 36, height: 36, borderRadius: 9,
            background: canSend ? 'var(--fg)' : 'var(--bg-panel)',
            border: `1px solid ${canSend ? 'var(--fg)' : 'var(--border)'}`,
            cursor: canSend ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all .18s, transform .1s',
            color: canSend ? '#fff' : 'var(--fg-ghost)', fontSize: 14,
          }}
          onMouseDown={(e) => { if (canSend) e.currentTarget.style.transform = 'scale(.93)' }}
          onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
        >
          {disabled ? <Spinner size={12} /> : '➤'}
        </button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, padding: '0 2px' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--fg-ghost)' }}>
          Enter to send · Shift+Enter for newline
        </span>
        {disabled && (
          <span className="fade-in" style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--fg-muted)' }}>
            Processing…
          </span>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  const [convs, setConvs] = useState<ConvEntry[]>(DEMO_CONVS)
  const [activeId, setActiveId] = useState<string | null>(null)

  type Msg = { role: 'user'; content: string } | { role: 'ai'; aiMsg: AiMsg }
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<AgentStatus>('online')
  const [processing, setProcessing] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  const handleSend = useCallback(async (prompt: string) => {
    if (!prompt.trim() || processing) return
    setInput('')
    setProcessing(true)
    setStatus('processing')

    setMsgs((m) => [...m, { role: 'user', content: prompt }])

    const aiId = `ai-${Date.now()}`
    const init: AiMsg = {
      id: aiId, phase: 'requesting', thinkingLines: [],
      streamedAnswer: '', response: null, userPrompt: prompt,
    }
    setMsgs((m) => [...m, { role: 'ai', aiMsg: init }])

    if (!activeId) {
      const nc: ConvEntry = {
        id: `conv-${Date.now()}`,
        title: prompt.length > 40 ? prompt.slice(0, 40) + '…' : prompt,
        group: 'Today',
      }
      setConvs((c) => [nc, ...c])
      setActiveId(nc.id)
    }

    try {
      // for await (const patch of realStream(prompt)) {
      //   setMsgs((prev) => prev.map((m) =>
      //     m.role === 'ai' && m.aiMsg.id === aiId
      //       ? { ...m, aiMsg: { ...m.aiMsg, ...patch } }
      //       : m,
      //   ))
      // }
      for await (const patch of realStream(prompt)) {
  setMsgs((prev) => prev.map((m) =>
    m.role === 'ai' && m.aiMsg.id === aiId
      ? { ...m, aiMsg: { ...m.aiMsg, ...patch } }
      : m,
  ))
}
    } catch {
      setMsgs((prev) => prev.map((m) =>
        m.role === 'ai' && m.aiMsg.id === aiId
          ? { ...m, aiMsg: { ...m.aiMsg, phase: 'error' } }
          : m,
      ))
    } finally {
      setProcessing(false)
      setStatus('online')
    }
  }, [processing, activeId])

  const handleRetry = useCallback((aiId: string) => {
    const m = msgs.find((m) => m.role === 'ai' && m.aiMsg.id === aiId)
    if (m?.role === 'ai') {
      setMsgs((prev) => prev.filter((x) => !(x.role === 'ai' && x.aiMsg.id === aiId)))
      handleSend(m.aiMsg.userPrompt)
    }
  }, [msgs, handleSend])

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Desktop sidebar */}
      {!isMobile && (
        <div style={{ width: 232, flexShrink: 0, height: '100%' }}>
          <Sidebar convs={convs} activeId={activeId}
            onSelect={(id) => { setActiveId(id); setMsgs([]) }}
            onNew={() => { setActiveId(null); setMsgs([]); setInput('') }}
          />
        </div>
      )}

      {/* Mobile drawer */}
      {isMobile && drawerOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex' }}
          onClick={() => setDrawerOpen(false)}
        >
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.25)' }} />
          <div
            style={{ position: 'relative', width: 264, height: '100%', zIndex: 61, animation: 'fadeIn .2s ease' }}
            onClick={(e) => e.stopPropagation()}
          >
            <Sidebar convs={convs} activeId={activeId}
              onSelect={(id) => { setActiveId(id); setMsgs([]); setDrawerOpen(false) }}
              onNew={() => { setActiveId(null); setMsgs([]); setInput(''); setDrawerOpen(false) }}
              onClose={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', minWidth: 0 }}>
        {/* Header */}
        <header style={{
          flexShrink: 0, height: 54,
          background: 'var(--bg-white)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center',
          padding: '0 20px', gap: 10,
          boxShadow: '0 1px 0 var(--border)',
        }}>
          {isMobile && (
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Open history"
              style={{
                background: 'none', border: 'none', color: 'var(--fg-muted)',
                cursor: 'pointer', fontSize: 19, padding: 0, lineHeight: 1, marginRight: 4,
              }}
            >
              ☰
            </button>
          )}
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'var(--bg)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
            boxShadow: 'var(--shadow-sm)',
          }}>
            📚
          </div>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg)', letterSpacing: '-.015em', lineHeight: 1.25 }}>
              Book AI Chatbot
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--fg-ghost)', letterSpacing: '.04em' }}>
              Ask questions about books
            </div>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <StatusBadge status={status} />
          </div>
        </header>

        {/* Chat */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {msgs.length === 0 ? (
            <EmptyState onPick={(s) => { setInput(s); setTimeout(() => handleSend(s), 40) }} />
          ) : (
            <div style={{ maxWidth: 752, width: '100%', margin: '0 auto', padding: '28px 20px 12px' }}>
              {msgs.map((m, i) =>
                m.role === 'user'
                  ? <UserMessage key={i} content={m.content} />
                  : <AiMessage key={m.aiMsg.id} msg={m.aiMsg} onRetry={() => handleRetry(m.aiMsg.id)} />,
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* Input bar */}
        <div style={{
          flexShrink: 0,
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-white)',
          padding: '14px 20px 18px',
        }}>
          <div style={{ maxWidth: 752, margin: '0 auto' }}>
            <ChatInput value={input} onChange={setInput} onSend={() => handleSend(input)} disabled={processing} />
          </div>
        </div>
      </div>
    </div>
  )
}
