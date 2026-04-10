'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

export type StandardBarChartProps = {
  data: any[];
  xAxisKey: string;
  bars: Array<{
    key: string;
    name: string;
    color: string;
  }>;
  height?: number | `${number}%`;
};

export function StandardBarChart({ data, xAxisKey, bars, height = 300 }: StandardBarChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500" style={{ height }}>
        Không có dữ liệu biểu đồ
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
        <XAxis 
          dataKey={xAxisKey} 
          axisLine={false} 
          tickLine={false} 
          tick={{ fontSize: 12, fill: '#666' }} 
          dy={10} 
        />
        <YAxis 
          axisLine={false} 
          tickLine={false} 
          tick={{ fontSize: 12, fill: '#666' }} 
          dx={-10}
        />
        <Tooltip
          cursor={{ fill: 'var(--bg-muted)', opacity: 0.4 }}
          contentStyle={{ backgroundColor: 'var(--bg-popover)', borderRadius: '8px', border: '1px solid var(--border)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
          itemStyle={{ fontSize: '13px' }}
          labelStyle={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}
        />
        <Legend wrapperStyle={{ fontSize: '13px', paddingTop: '10px' }} />
        {bars.map((bar) => (
          <Bar
            key={bar.key}
            dataKey={bar.key}
            name={bar.name}
            fill={bar.color}
            radius={[4, 4, 0, 0]}
            maxBarSize={50}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
