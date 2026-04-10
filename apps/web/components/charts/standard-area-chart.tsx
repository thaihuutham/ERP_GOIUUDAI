'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

export type StandardAreaChartProps = {
  data: any[];
  xAxisKey: string;
  areas: Array<{
    key: string;
    name: string;
    color: string;
  }>;
  height?: number | `${number}%`;
};

export function StandardAreaChart({ data, xAxisKey, areas, height = 300 }: StandardAreaChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500" style={{ height }}>
        Không có dữ liệu biểu đồ
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          {areas.map((area) => (
            <linearGradient key={`colorGradient-${area.key}`} id={`colorGradient-${area.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={area.color} stopOpacity={0.4} />
              <stop offset="95%" stopColor={area.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
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
          contentStyle={{ backgroundColor: 'var(--bg-popover)', borderRadius: '8px', border: '1px solid var(--border)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
          itemStyle={{ fontSize: '13px' }}
          labelStyle={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}
        />
        <Legend wrapperStyle={{ fontSize: '13px', paddingTop: '10px' }} />
        {areas.map((area) => (
          <Area
            key={area.key}
            type="monotone"
            dataKey={area.key}
            name={area.name}
            stroke={area.color}
            strokeWidth={2}
            fillOpacity={1}
            fill={`url(#colorGradient-${area.key})`}
            activeDot={{ r: 6, strokeWidth: 0 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
