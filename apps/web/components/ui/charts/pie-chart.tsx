'use client';

import {
  PieChart as RechartsPie,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

type PieDataPoint = {
  name: string;
  value: number;
};

const DEFAULT_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316'];

type SimplePieChartProps = {
  data: PieDataPoint[];
  colors?: string[];
  height?: number;
  showLegend?: boolean;
  innerRadius?: number;
};

export function SimplePieChart({
  data,
  colors = DEFAULT_COLORS,
  height = 200,
  showLegend = true,
  innerRadius = 0,
}: SimplePieChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsPie>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius={70}
          paddingAngle={2}
          strokeWidth={0}
        >
          {data.map((_, idx) => (
            <Cell key={idx} fill={colors[idx % colors.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: '13px',
          }}
        />
        {showLegend && (
          <Legend
            wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
          />
        )}
      </RechartsPie>
    </ResponsiveContainer>
  );
}
