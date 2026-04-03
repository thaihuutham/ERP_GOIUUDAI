'use client';

import {
  AreaChart as RechartsArea,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

type DataPoint = Record<string, string | number>;

type SimpleAreaChartProps = {
  data: DataPoint[];
  xKey: string;
  yKey: string;
  color?: string;
  height?: number;
  showGrid?: boolean;
  formatY?: (value: number) => string;
};

export function SimpleAreaChart({
  data,
  xKey,
  yKey,
  color = 'var(--chart-green)',
  height = 200,
  showGrid = true,
  formatY,
}: SimpleAreaChartProps) {
  // Resolve CSS variable to hex for Recharts (which doesn't support CSS vars in gradients)
  const resolvedColor = color.startsWith('var(') ? '#10b981' : color;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsArea data={data}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />}
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
        <defs>
          <linearGradient id={`gradient-${yKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={resolvedColor} stopOpacity={0.2} />
            <stop offset="95%" stopColor={resolvedColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey={yKey}
          stroke={resolvedColor}
          strokeWidth={2}
          fill={`url(#gradient-${yKey})`}
        />
      </RechartsArea>
    </ResponsiveContainer>
  );
}
