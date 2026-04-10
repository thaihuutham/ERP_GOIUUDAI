'use client';

import {
  BarChart as RechartsBar,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

type DataPoint = Record<string, string | number>;

type DualBarChartProps = {
  data: DataPoint[];
  xKey: string;
  bar1Key: string;
  bar2Key: string;
  bar1Label?: string;
  bar2Label?: string;
  bar1Color?: string;
  bar2Color?: string;
  height?: number;
  showGrid?: boolean;
  formatY?: (value: number) => string;
  barRadius?: number;
};

export function DualBarChart({
  data,
  xKey,
  bar1Key,
  bar2Key,
  bar1Label = 'Thu',
  bar2Label = 'Chi',
  bar1Color = '#10b981',
  bar2Color = '#f59e0b',
  height = 240,
  showGrid = true,
  formatY,
  barRadius = 4,
}: DualBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBar data={data} barGap={2} barCategoryGap="20%">
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
          formatter={formatY ? ((v: any, name: string) => [formatY(Number(v)), name]) as any : undefined}
        />
        <Legend
          wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
          iconType="circle"
          iconSize={8}
        />
        <Bar
          name={bar1Label}
          dataKey={bar1Key}
          fill={bar1Color}
          radius={[barRadius, barRadius, 0, 0]}
        />
        <Bar
          name={bar2Label}
          dataKey={bar2Key}
          fill={bar2Color}
          radius={[barRadius, barRadius, 0, 0]}
        />
      </RechartsBar>
    </ResponsiveContainer>
  );
}
