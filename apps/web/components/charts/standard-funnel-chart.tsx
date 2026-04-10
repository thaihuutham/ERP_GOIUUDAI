'use client';

import {
  Funnel,
  FunnelChart,
  Tooltip,
  LabelList,
  ResponsiveContainer
} from 'recharts';

export type StandardFunnelChartProps = {
  data: any[];
  dataKey: string;
  nameKey: string;
  colors?: string[];
  height?: number | `${number}%`;
};

const DEFAULT_COLORS = ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe'];

export function StandardFunnelChart({ data, dataKey, nameKey, colors = DEFAULT_COLORS, height = 300 }: StandardFunnelChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500" style={{ height }}>
        Không có dữ liệu biểu đồ
      </div>
    );
  }

  // Gắn màu vào từng data point vì thẻ <Funnel> ở Recharts 2.x support mapping màu qua mảng data
  const dataWithColor = data.map((item, index) => ({
    ...item,
    fill: colors[index % colors.length]
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <FunnelChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
        <Tooltip
          contentStyle={{ backgroundColor: 'var(--bg-popover)', borderRadius: '8px', border: '1px solid var(--border)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
          itemStyle={{ fontSize: '13px' }}
          labelStyle={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}
        />
        <Funnel
          dataKey={dataKey}
          data={dataWithColor}
          isAnimationActive
        >
          <LabelList position="right" fill="#333" stroke="none" dataKey={nameKey} style={{ fontSize: 12, fontWeight: 500 }} />
        </Funnel>
      </FunnelChart>
    </ResponsiveContainer>
  );
}
