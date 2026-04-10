'use client';

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

export type StandardScatterChartProps = {
  data: any[];
  xAxisKey: string;
  yAxisKey: string;
  zAxisKey?: string; // Tên biến để quyết định độ lớn của chấm (Bubble)
  scatters: Array<{ name: string; color: string; dataKey?: string }>; // dataKey để map nếu có nhiều cục data trên 1 chart
  height?: number | `${number}%`;
};

export function StandardScatterChart({ data, xAxisKey, yAxisKey, zAxisKey, scatters, height = 300 }: StandardScatterChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500" style={{ height }}>
        Không có dữ liệu biểu đồ
      </div>
    );
  }

  const defaultScatterKey = scatters[0]?.dataKey || 'value';

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
        <XAxis type="number" dataKey={xAxisKey} name={xAxisKey} tick={{ fontSize: 12, fill: '#666' }} />
        <YAxis type="number" dataKey={yAxisKey} name={yAxisKey} tick={{ fontSize: 12, fill: '#666' }} />
        <Tooltip
          cursor={{ strokeDasharray: '3 3' }}
          contentStyle={{ backgroundColor: 'var(--bg-popover)', borderRadius: '8px', border: '1px solid var(--border)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
          itemStyle={{ fontSize: '13px' }}
          labelStyle={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}
        />
        <Legend wrapperStyle={{ fontSize: '13px', paddingTop: '10px' }} />
        {scatters.map((scatter) => (
          <Scatter 
            key={`scatter-${scatter.name}`} 
            name={scatter.name} 
            data={data} 
            fill={scatter.color}
          />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}
