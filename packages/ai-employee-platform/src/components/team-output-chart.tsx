"use client"

import { useMemo, useState } from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

type RangeKey = "1W" | "1M" | "3M" | "YTD" | "ALL"

const ranges: Array<{ key: RangeKey; value: string; delta: string; path: string }> = [
  { key: "1W", value: "47", delta: "+12.4%", path: "M 0 94 C 70 94 86 94 109 94 C 146 94 156 34 195 34 L 620 34" },
  { key: "1M", value: "186", delta: "+18.9%", path: "M 0 102 C 70 102 92 80 128 80 C 178 80 184 54 230 54 C 306 54 322 28 390 28 C 482 28 532 42 620 18" },
  { key: "3M", value: "534", delta: "+21.7%", path: "M 0 104 C 84 104 112 90 158 90 C 206 90 220 70 262 68 C 316 66 338 42 392 42 C 472 42 520 24 620 22" },
  { key: "YTD", value: "1,842", delta: "+26.2%", path: "M 0 112 C 78 112 114 100 156 94 C 220 86 235 62 304 62 C 368 62 396 40 462 34 C 530 28 568 20 620 16" },
  { key: "ALL", value: "4,936", delta: "+34.8%", path: "M 0 116 C 92 114 128 96 180 88 C 232 80 256 58 318 56 C 396 54 426 32 492 28 C 548 24 584 14 620 10" },
]

export function TeamOutputChart() {
  const [activeRange, setActiveRange] = useState<RangeKey>("1W")
  const active = useMemo(() => ranges.find((range) => range.key === activeRange) ?? ranges[0], [activeRange])

  return (
    <div className="hero-banner card-shadow overflow-hidden px-5 py-5">
      <div className="relative z-10 flex items-center justify-between pb-4">
        <div>
          <p className="section-label">AI TEAM OUTPUT</p>
          <div className="mt-7 flex items-baseline gap-3">
            <p className="text-[42px] font-semibold leading-none tracking-[-0.05em] tabular">{active.value}</p>
            <p className="text-[15px] font-semibold text-emerald-700">{active.delta}</p>
          </div>
          <p className="mt-2 text-[13px] text-muted-foreground">Tasks completed across support, data and sales workflows.</p>
        </div>
        <button className="rounded-full border border-border bg-white px-3 py-2 text-[12px] font-semibold shadow-sm transition-colors hover:bg-muted">
          Forecast
          <ChevronRight className="ml-1 inline h-3 w-3" />
        </button>
      </div>

      <div className="relative z-0 pt-5">
        <div className="relative h-[170px] overflow-hidden">
          <svg viewBox="0 0 620 132" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="team-output-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgb(56 189 248)" stopOpacity="0.30" />
                <stop offset="100%" stopColor="rgb(56 189 248)" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <g>
              {[28, 58, 88, 118].map((y) => (
                <line key={y} x1="0" x2="620" y1={y} y2={y} stroke="rgb(222 217 207)" strokeDasharray="4 6" />
              ))}
            </g>
            <path d={`${active.path} L 620 132 L 0 132 Z`} fill="url(#team-output-area)" />
            <path d={active.path} fill="none" stroke="rgb(14 165 233)" strokeWidth="3" strokeLinecap="round" />
            <circle cx="620" cy={activeRange === "1W" ? 34 : activeRange === "1M" ? 18 : activeRange === "3M" ? 22 : activeRange === "YTD" ? 16 : 10} r="5" fill="rgb(14 165 233)" />
          </svg>
        </div>

        <div className="mt-4 flex justify-center gap-3 text-[13px] font-semibold text-muted-foreground sm:gap-5">
          {ranges.map((range) => (
            <button
              key={range.key}
              type="button"
              onClick={() => setActiveRange(range.key)}
              aria-pressed={activeRange === range.key}
              className={cn(
                "rounded-[9px] px-3 py-2 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                activeRange === range.key && "bg-muted text-foreground shadow-sm"
              )}
            >
              {range.key}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
