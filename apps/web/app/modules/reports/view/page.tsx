'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Download, Printer, Table } from 'lucide-react';
import { apiRequest } from '../../../../lib/api-client';
import { StandardLineChart } from '../../../../components/charts/standard-line-chart';
import { StandardBarChart } from '../../../../components/charts/standard-bar-chart';
import { StandardPieChart } from '../../../../components/charts/standard-pie-chart';
import { StandardAreaChart } from '../../../../components/charts/standard-area-chart';
import { StandardComposedChart } from '../../../../components/charts/standard-composed-chart';
import { StandardRadarChart } from '../../../../components/charts/standard-radar-chart';
import { StandardScatterChart } from '../../../../components/charts/standard-scatter-chart';
import { StandardFunnelChart } from '../../../../components/charts/standard-funnel-chart';
import { Badge } from '../../../../components/ui';

export default function ReportDrillThroughPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center py-20"><span className="text-neutral-400">Đang tải...</span></div>}>
      <ReportDrillThroughContent />
    </Suspense>
  );
}

function ReportDrillThroughContent() {
  const searchParams = useSearchParams();
  const moduleName = searchParams.get('moduleName') || 'sales';
  const range = searchParams.get('range') || 'THIS_WEEK';
  const reportId = searchParams.get('reportId') || '';

  const [metrics, setMetrics] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [widgetConfig, setWidgetConfig] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportingToPdf, setExportingToPdf] = useState(false);
  
  const dashboardRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [metricsRes, tableRes, settingsRes] = await Promise.all([
        apiRequest(`/reports/metrics`, { query: { name: moduleName, range } }),
        apiRequest(`/reports/module`, { query: { name: moduleName, range, limit: 50 } }),
        apiRequest(`/settings/org_profile`).catch(() => null)
      ]);
      setMetrics((metricsRes as any)?.metrics || {});
      setRows((tableRes as any)?.items || []);
      
      const configArray = (settingsRes as any)?.settings?.dashboardWidgets?.[moduleName] || ['line', 'bar'];
      setWidgetConfig(configArray);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [moduleName, range]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const exportPDF = async () => {
    if (!dashboardRef.current) return;
    setExportingToPdf(true);
    try {
      // Dynamic import để bypass SSR
      const html2pdf = (await import('html2pdf.js')).default;
      const opt = {
        margin:       0.3,
        filename:     `${moduleName}-executive-${Date.now()}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'in', format: 'letter', orientation: 'landscape' }
      };
      await html2pdf().set(opt).from(dashboardRef.current).save();
    } catch (err) {
      console.error("Lỗi xuất PDF", err);
      alert('Không thể kết xuất PDF lúc này. Vui lòng thử lại.');
    } finally {
      setExportingToPdf(false);
    }
  };

  const renderModuleCharts = () => {
    if (!metrics) return null;
    
    // Chuẩn hóa dữ liệu mồi (Mock fallback nếu API chưa trả đúng định dạng chuẩn)
    const timeXData = metrics.revenueSeries || metrics.cashflowSeries || [];
    const catData = Array.isArray(metrics.orderStatusSeries) 
      ? metrics.orderStatusSeries 
      : Object.keys(metrics.orderStatusSeries || {}).map(k => ({ label: k, value: metrics.orderStatusSeries[k] }));

    if (timeXData.length === 0 && catData.length === 0) {
      // Default Fallback
      const stats = Object.keys(metrics).map(k => ({
        key: k,
        value: String(metrics[k])
      })).filter(x => x.value !== '[object Object]');
      
      return (
        <div className="flex gap-4 flex-wrap">
          {stats.map(s => (
            <div key={s.key} className="card p-4 border rounded-md bg-neutral-50 min-w-[200px] flex-1">
              <span className="block text-xs uppercase text-neutral-500">{s.key}</span>
              <span className="block text-2xl font-bold mt-1 text-neutral-800">{s.value}</span>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {widgetConfig.map((widget) => {
          switch(widget) {
            case 'line':
              return (
                <div key="line" className="card p-4 border rounded-md">
                  <h3 className="text-sm font-semibold mb-4 text-neutral-700 capitalize">Xu hướng {moduleName}</h3>
                  <StandardLineChart 
                    data={timeXData} 
                    xAxisKey={timeXData[0]?.label ? 'label' : 'month'} 
                    lines={[{ key: timeXData[0]?.value !== undefined ? 'value' : 'total', name: 'Giá trị', color: '#10b981' }]} 
                  />
                </div>
              );
            case 'bar':
              return (
                <div key="bar" className="card p-4 border rounded-md">
                   <h3 className="text-sm font-semibold mb-4 text-neutral-700 capitalize">Phân bổ {moduleName}</h3>
                   <StandardBarChart 
                     data={catData} 
                     xAxisKey={catData[0]?.status ? 'status' : 'label'} 
                     bars={[{ key: catData[0]?.count !== undefined ? 'count' : 'value', name: 'Số lượng', color: '#3b82f6' }]} 
                   />
                </div>
              );
            case 'pie':
              return (
                <div key="pie" className="card p-4 border rounded-md">
                   <h3 className="text-sm font-semibold mb-4 text-neutral-700 capitalize">Tỷ trọng {moduleName}</h3>
                   <StandardPieChart 
                     data={catData} 
                     nameKey={catData[0]?.status ? 'status' : 'label'} 
                     dataKey={catData[0]?.count !== undefined ? 'count' : 'value'} 
                   />
                </div>
              );
            case 'area':
              return (
                <div key="area" className="card p-4 border rounded-md">
                   <h3 className="text-sm font-semibold mb-4 text-neutral-700 capitalize">Tích lũy {moduleName}</h3>
                   <StandardAreaChart 
                     data={timeXData} 
                     xAxisKey={timeXData[0]?.label ? 'label' : 'month'} 
                     areas={[{ key: timeXData[0]?.value !== undefined ? 'value' : 'total', name: 'Giá trị', color: '#6366f1' }]} 
                   />
                </div>
              );
            case 'composed':
              return (
                <div key="composed" className="card p-4 border rounded-md col-span-1 md:col-span-2">
                   <h3 className="text-sm font-semibold mb-4 text-neutral-700 capitalize">Phân tích đa chiều {moduleName}</h3>
                   <StandardComposedChart 
                     data={timeXData} 
                     xAxisKey={timeXData[0]?.label ? 'label' : 'month'} 
                     bars={[{ key: timeXData[0]?.value !== undefined ? 'value' : 'total', name: 'Biểu đồ Cột', color: '#3b82f6' }]} 
                     lines={[{ key: timeXData[0]?.value !== undefined ? 'value' : 'total', name: 'Biểu đồ Tuyến', color: '#eab308' }]}
                   />
                </div>
              );
            case 'radar':
              return (
                <div key="radar" className="card p-4 border rounded-md">
                   <h3 className="text-sm font-semibold mb-4 text-neutral-700 capitalize">Mức độ hoàn thành {moduleName}</h3>
                   <StandardRadarChart 
                     data={catData} 
                     radarKey={catData[0]?.status ? 'status' : 'label'} 
                     radars={[{ key: catData[0]?.count !== undefined ? 'count' : 'value', name: 'Mức độ', color: '#14b8a6' }]} 
                   />
                </div>
              );
            case 'scatter':
              return (
                <div key="scatter" className="card p-4 border rounded-md">
                   <h3 className="text-sm font-semibold mb-4 text-neutral-700 capitalize">Mức độ phân tán {moduleName}</h3>
                   <StandardScatterChart 
                     data={timeXData} 
                     xAxisKey={timeXData[0]?.label ? 'label' : 'month'} 
                     yAxisKey={timeXData[0]?.value !== undefined ? 'value' : 'total'} 
                     scatters={[{ name: 'Quy mô', color: '#f43f5e' }]} 
                   />
                </div>
              );
            case 'funnel':
              return (
                <div key="funnel" className="card p-4 border rounded-md">
                   <h3 className="text-sm font-semibold mb-4 text-neutral-700 capitalize">Phễu chuyển đổi {moduleName}</h3>
                   <StandardFunnelChart 
                     data={catData} 
                     nameKey={catData[0]?.status ? 'status' : 'label'} 
                     dataKey={catData[0]?.count !== undefined ? 'count' : 'value'} 
                   />
                </div>
              );
            default:
              return null;
          }
        })}
      </div>
    );
  };

  const headers = rows.length > 0 ? Object.keys(rows[0]).slice(0, 7) : [];

  return (
    <div className="reports-view-page p-6 max-w-7xl mx-auto flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/modules/reports" className="btn btn-ghost" aria-label="Quay lại">
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-xl font-bold capitalize">Dashboard Chuyên Sâu: {moduleName}</h1>
            <p className="text-sm text-neutral-500">Mã tham chiếu: {reportId || 'N/A'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-primary" onClick={exportPDF} disabled={exportingToPdf || loading}>
            {exportingToPdf ? <Loader2 size={15} className="spin" /> : <Printer size={15} />}
            Xuất Executive PDF
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 size={30} className="spin text-neutral-400" />
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {/* Executive PDF Container */}
          <div ref={dashboardRef} className="dashboard-pdf-container flex flex-col gap-6 p-4 bg-white rounded-lg border shadow-sm">
            <div className="flex justify-between items-center pb-4 border-b">
              <h2 className="text-lg font-bold">Thống kê Tổng quan (Executive)</h2>
              <Badge variant="info">Mẫu in PDF</Badge>
            </div>
            
            <div className="charts-wrapper min-h-[350px]">
              {renderModuleCharts()}
            </div>
          </div>

          {/* Operational Data Grid (Not included in PDF) */}
          <div className="dashboard-operational-container p-4 bg-white rounded-lg border shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2"><Table size={18} /> Dữ liệu Chi tiết (50 dòng)</h2>
              <p className="text-xs text-neutral-400">*Bản xem trước. Quay lại màn List để tải toàn bộ Data Background Export.</p>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-neutral-50 border-b text-neutral-600">
                    {headers.map(h => (
                      <th key={h} className="p-3 font-medium capitalize truncate max-w-[200px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={headers.length || 1} className="p-8 text-center text-neutral-500">
                        Không có dữ liệu trong khoảng thời gian này
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, idx) => (
                      <tr key={row.id || idx} className="border-b last:border-0 hover:bg-neutral-50/50">
                        {headers.map(h => (
                          <td key={h} className="p-3 truncate max-w-[200px]" title={String(row[h])}>
                            {row[h] === null ? '--' : String(row[h])}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
