'use client';

import React from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback UI. If not provided, default error card is shown. */
  fallback?: ReactNode;
  /** Module name for error context (e.g., 'CRM', 'HR'). */
  moduleName?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary for ERP modules.
 *
 * Catches render errors in child component tree and displays
 * a user-friendly error card with retry option.
 * Prevents a single module crash from taking down the entire app.
 *
 * Usage:
 *   <ErrorBoundary moduleName="CRM">
 *     <CrmOperationsBoard />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to console in dev, can be extended to external error tracking
    console.error(
      `[ErrorBoundary${this.props.moduleName ? `:${this.props.moduleName}` : ''}]`,
      error,
      info.componentStack,
    );
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="error-boundary-fallback">
          <div className="error-boundary-icon">⚠️</div>
          <h3 className="error-boundary-title">
            Đã xảy ra lỗi{this.props.moduleName ? ` trong ${this.props.moduleName}` : ''}
          </h3>
          <p className="error-boundary-message">
            Hệ thống gặp sự cố khi hiển thị nội dung này. Vui lòng thử lại hoặc liên hệ quản trị viên.
          </p>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details className="error-boundary-details">
              <summary>Chi tiết lỗi (chỉ hiện ở môi trường dev)</summary>
              <pre>{this.state.error.message}</pre>
              <pre>{this.state.error.stack}</pre>
            </details>
          )}
          <button className="error-boundary-retry" onClick={this.handleRetry}>
            🔄 Thử lại
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
