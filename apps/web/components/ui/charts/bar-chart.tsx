'use client';

import {
  BarChart as RechartsBar,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

type DataPoint = Record<string, string | number>;

type SimpleBarChartProps = {
  data: DataPoint[];
  xKey: string;
  yKey: string;
  color?: string;
  height?: number;
  showGrid?: boolean;
  formatY?: (value: number) => string;
  barRadius?: number;
};

export function SimpleBarChart({
  data,
  xKey,
  yKey,
  color = '#10b981',
  height = 200,
  showGrid = true,
  formatY,
  barRadius = 4,
}: SimpleBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBar data={data}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />}
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 12, fill: '#6b7280' }}
          axisLine={{ stroke: '#e5e7eb' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: '#6b7280' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={formatY}
        />
        <Tooltip
          contentStyle={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: '13px',
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={formatY ? ((v: any) => [formatY(Number(v))]) as any : undefined}
        />
        <Bar
          dataKey={yKey}
          fill={color}
          radius={[barRadius, barRadius, 0, 0]}
        />
      </RechartsBar>
    </ResponsiveContainer>
  );
}
