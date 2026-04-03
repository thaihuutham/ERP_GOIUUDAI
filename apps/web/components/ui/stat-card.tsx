'use client';

import { type ReactNode } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

type StatCardProps = {
  label: string;
  value: string | number;
  icon?: ReactNode;
  trend?: number; // percentage change, positive = up, negative = down
  color?: string;
  className?: string;
};

export function StatCard({ label, value, icon, trend, color, className }: StatCardProps) {
  const trendColor = trend === undefined ? undefined : trend > 0 ? 'var(--success)' : trend < 0 ? 'var(--danger)' : 'var(--text-muted)';
  const TrendIcon = trend === undefined ? null : trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;

  return (
    <article className={`stat-card${className ? ` ${className}` : ''}`}>
      <div className="stat-card-header">
        {icon && <span className="stat-card-icon" style={{ color: color || 'var(--primary)' }}>{icon}</span>}
        <h2 className="stat-card-label">{label}</h2>
      </div>
      <div className="stat-card-body">
        <p className="stat-card-value">{value}</p>
        {trend !== undefined && TrendIcon && (
          <span className="stat-card-trend" style={{ color: trendColor }}>
            <TrendIcon size={14} />
            <span>{Math.abs(trend)}%</span>
          </span>
        )}
      </div>
    </article>
  );
}
