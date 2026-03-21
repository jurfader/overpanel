'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface CpuChartProps {
  data: { time: string; cpu: number; ram: number }[]
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload?.length) {
    return (
      <div className="glass-card rounded-xl p-3 text-xs border border-white/10 space-y-1">
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-[var(--text-secondary)]">{p.name}:</span>
            <span className="text-[var(--text-primary)] font-medium">{p.value.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    )
  }
  return null
}

export function CpuChart({ data }: CpuChartProps) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
        <defs>
          <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#E91E8C" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#E91E8C" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="ramGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#9B26D9" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#9B26D9" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="time"
          tick={{ fill: '#55556A', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: '#55556A', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="cpu"
          name="CPU"
          stroke="#E91E8C"
          strokeWidth={2}
          fill="url(#cpuGrad)"
          dot={false}
          activeDot={{ r: 4, fill: '#E91E8C' }}
        />
        <Area
          type="monotone"
          dataKey="ram"
          name="RAM"
          stroke="#9B26D9"
          strokeWidth={2}
          fill="url(#ramGrad)"
          dot={false}
          activeDot={{ r: 4, fill: '#9B26D9' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
