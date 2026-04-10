'use client';

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

export type StandardRadarChartProps = {
  data: any[];
  radarKey: string;
  radars: Array<{ key: string; name: string; color: string; fillOpacity?: number }>;
  height?: number | `${number}%`;
};

export function StandardRadarChart({ data, radarKey, radars, height = 300 }: StandardRadarChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500" style={{ height }}>
        Không có dữ liệu biểu đồ
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
        <PolarGrid stroke="#e5e5e5" />
        <PolarAngleAxis dataKey={radarKey} tick={{ fontSize: 12, fill: '#666' }} />
        <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={{ fontSize: 11, fill: '#999' }} />
        <Tooltip
          contentStyle={{ backgroundColor: 'var(--bg-popover)', borderRadius: '8px', border: '1px solid var(--border)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
          itemStyle={{ fontSize: '13px' }}
          labelStyle={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}
        />
        <Legend wrapperStyle={{ fontSize: '13px', paddingTop: '10px' }} />
        {radars.map((radar) => (
          <Radar
            key={`radar-${radar.key}`}
            name={radar.name}
            dataKey={radar.key}
            stroke={radar.color}
            fill={radar.color}
            fillOpacity={radar.fillOpacity ?? 0.5}
            strokeWidth={2}
          />
        ))}
      </RadarChart>
    </ResponsiveContainer>
  );
}
