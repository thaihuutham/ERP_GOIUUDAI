'use client';

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

export type StandardPieChartProps = {
  data: any[];
  nameKey: string;
  dataKey: string;
  colors?: string[];
  height?: number | `${number}%`;
};

const DEFAULT_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#06b6d4'];

export function StandardPieChart({ data, nameKey, dataKey, colors = DEFAULT_COLORS, height = 300 }: StandardPieChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500" style={{ height }}>
        Không có dữ liệu biểu đồ
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius="50%" // Tạo dạng Donut Chart, set 0 để hiển thị Pie tròn đặc
          outerRadius="80%"
          paddingAngle={5}
          dataKey={dataKey}
          nameKey={nameKey}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={colors[index % colors.length]} strokeWidth={0} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ backgroundColor: 'var(--bg-popover)', borderRadius: '8px', border: '1px solid var(--border)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
          itemStyle={{ fontSize: '13px' }}
          labelStyle={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}
        />
        <Legend wrapperStyle={{ fontSize: '13px', paddingTop: '10px' }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
