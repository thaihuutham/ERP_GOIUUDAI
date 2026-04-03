'use client';

type SkeletonProps = {
  width?: string;
  height?: string;
  borderRadius?: string;
  className?: string;
};

export function Skeleton({
  width = '100%',
  height = '1rem',
  borderRadius = 'var(--radius-md)',
  className,
}: SkeletonProps) {
  return (
    <div
      className={`skeleton${className ? ` ${className}` : ''}`}
      style={{ width, height, borderRadius }}
      aria-hidden="true"
    />
  );
}

type SkeletonRowProps = {
  columns?: number;
  rows?: number;
};

/** Skeleton placeholder for data table loading */
export function SkeletonTable({ columns = 5, rows = 5 }: SkeletonRowProps) {
  return (
    <div className="skeleton-table" aria-busy="true" aria-label="Đang tải dữ liệu...">
      {/* Header */}
      <div className="skeleton-table-header">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`h-${i}`} height="0.8rem" width={i === 0 ? '40%' : '60%'} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={`r-${r}`} className="skeleton-table-row">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={`c-${c}`} height="0.85rem" width={c === 0 ? '50%' : '70%'} />
          ))}
        </div>
      ))}
    </div>
  );
}
