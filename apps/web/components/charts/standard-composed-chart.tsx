'use client';

import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

export type StandardComposedChartProps = {
  data: any[];
  xAxisKey: string;
  bars: Array<{ key: string; name: string; color: string; yAxisId?: string }>;
  lines: Array<{ key: string; name: string; color: string; yAxisId?: string }>;
  height?: number | `${number}%`;
};

export function StandardComposedChart({ data, xAxisKey, bars, lines, height = 300 }: StandardComposedChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500" style={{ height }}>
        Không có dữ liệu biểu đồ
      </div>
    );
  }

  // Tự động detect nếu có yêu cầu chia YAxis 2 bên (phổ biến ở ComposedChart)
  const hasRightAxis = [...bars, ...lines].some((item) => item.yAxisId === 'right');

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
        <XAxis 
          dataKey={xAxisKey} 
          axisLine={false} 
          tickLine={false} 
          tick={{ fontSize: 12, fill: '#666' }} 
          dy={10} 
        />
        <YAxis 
          yAxisId="left"
          axisLine={false} 
          tickLine={false} 
          tick={{ fontSize: 12, fill: '#666' }} 
          dx={-10}
        />
        {hasRightAxis && (
          <YAxis 
            yAxisId="right"
            orientation="right"
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 12, fill: '#666' }} 
            dx={10}
          />
        )}
        <Tooltip
          contentStyle={{ backgroundColor: 'var(--bg-popover)', borderRadius: '8px', border: '1px solid var(--border)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
          itemStyle={{ fontSize: '13px' }}
          labelStyle={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}
        />
        <Legend wrapperStyle={{ fontSize: '13px', paddingTop: '10px' }} />
        {bars.map((bar) => (
          <Bar
            key={`bar-${bar.key}`}
            yAxisId={bar.yAxisId || 'left'}
            dataKey={bar.key}
            name={bar.name}
            fill={bar.color}
            radius={[4, 4, 0, 0]}
            barSize={32}
          />
        ))}
        {lines.map((line) => (
          <Line
            key={`line-${line.key}`}
            yAxisId={line.yAxisId || 'left'}
            type="monotone"
            dataKey={line.key}
            name={line.name}
            stroke={line.color}
            strokeWidth={3}
            dot={{ r: 4, strokeWidth: 0, fill: line.color }}
            activeDot={{ r: 6, strokeWidth: 0 }}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
