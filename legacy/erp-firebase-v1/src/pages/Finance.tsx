import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  DollarSign, 
  FileText, 
  TrendingUp, 
  TrendingDown, 
  PieChart, 
  Plus, 
  Search, 
  Filter, 
  Download,
  Building2,
  ArrowUpRight,
  ArrowDownRight,
  Calculator,
  Briefcase,
  History,
  CheckCircle2,
  Clock,
  AlertCircle
} from 'lucide-react';
import { 
  collection, 
  query, 
  onSnapshot, 
  where, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp, 
  DocumentData, 
  getDocs,
  orderBy,
  limit
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useEmployee } from '../App';
import { toast } from 'sonner';
import { OperationType, handleFirestoreError } from '../utils/error-handler';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const TabButton = ({ active, onClick, icon: Icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) => (
  <button 
    onClick={onClick}
    className={cn(
      "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap",
      active 
        ? "bg-emerald-600 text-white shadow-md shadow-emerald-100" 
        : "text-slate-600 hover:bg-slate-100"
    )}
  >
    <Icon size={18} />
    <span>{label}</span>
  </button>
);

const StatCard = ({ title, value, subValue, icon: Icon, trend, color }: { title: string, value: string, subValue?: string, icon: any, trend?: 'up' | 'down', color: string }) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
    <div className="flex justify-between items-start mb-4">
      <div className={cn("p-3 rounded-xl", color)}>
        <Icon size={24} />
      </div>
      {trend && (
        <div className={cn(
          "flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full",
          trend === 'up' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
        )}>
          {trend === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          <span>{trend === 'up' ? '+12%' : '-5%'}</span>
        </div>
      )}
    </div>
    <h3 className="text-sm font-medium text-slate-500">{title}</h3>
    <p className="text-2xl font-black text-slate-900 mt-1">{value}</p>
    {subValue && <p className="text-xs text-slate-400 mt-1">{subValue}</p>}
  </div>
);

// --- Sub-components for Sections ---

const GeneralLedger = ({ companyId }: { companyId: string }) => {
  const [entries, setEntries] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, 'journal_entries'),
      where('companyId', '==', companyId),
      orderBy('date', 'desc'),
      limit(50)
    );
    const unsub = onSnapshot(q, snap => {
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [companyId]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-slate-900">Sổ cái tổng hợp</h3>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2"
        >
          <Plus size={18} />
          <span>Bút toán mới</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Ngày</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Diễn giải</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Tham chiếu</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-right">Giá trị</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center">Trạng thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400 italic">Đang tải dữ liệu...</td></tr>
            ) : entries.length > 0 ? entries.map(entry => (
              <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4 text-sm text-slate-600">{entry.date}</td>
                <td className="px-6 py-4 text-sm font-medium text-slate-900">{entry.description}</td>
                <td className="px-6 py-4 text-sm text-slate-500">{entry.reference || '-'}</td>
                <td className="px-6 py-4 text-sm font-bold text-slate-900 text-right">
                  {entry.items?.reduce((sum: number, item: any) => sum + (item.debit || 0), 0).toLocaleString()} ₫
                </td>
                <td className="px-6 py-4 text-center">
                  <span className={cn(
                    "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                    entry.status === 'posted' ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"
                  )}>
                    {entry.status === 'posted' ? 'Đã ghi sổ' : 'Nháp'}
                  </span>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400">Chưa có bút toán nào.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const AccountsPayableReceivable = ({ companyId }: { companyId: string }) => {
  const [invoices, setInvoices] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'receivable' | 'payable'>('all');

  useEffect(() => {
    let q = query(collection(db, 'invoices'), where('companyId', '==', companyId));
    if (filter !== 'all') {
      q = query(q, where('type', '==', filter));
    }
    const unsub = onSnapshot(q, snap => {
      setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [companyId, filter]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-slate-900">Quản lý công nợ</h3>
        <div className="flex bg-slate-100 p-1 rounded-lg">
          {(['all', 'receivable', 'payable'] as const).map(f => (
            <button 
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1 text-xs font-bold rounded-md transition-all",
                filter === f ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              {f === 'all' ? 'Tất cả' : f === 'receivable' ? 'Phải thu' : 'Phải trả'}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Đối tác</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Loại</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Hạn thanh toán</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-right">Số tiền</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center">Trạng thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400 italic">Đang tải dữ liệu...</td></tr>
            ) : invoices.length > 0 ? invoices.map(inv => (
              <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4">
                  <p className="text-sm font-medium text-slate-900">{inv.partnerName}</p>
                  <p className="text-[10px] text-slate-400">Số: {inv.invoiceNumber}</p>
                </td>
                <td className="px-6 py-4">
                  <span className={cn(
                    "text-[10px] font-bold",
                    inv.type === 'receivable' ? "text-emerald-600" : "text-rose-600"
                  )}>
                    {inv.type === 'receivable' ? 'PHẢI THU' : 'PHẢI TRẢ'}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-slate-600">{inv.dueDate}</td>
                <td className="px-6 py-4 text-sm font-bold text-slate-900 text-right">{inv.totalAmount?.toLocaleString()} ₫</td>
                <td className="px-6 py-4 text-center">
                  <span className={cn(
                    "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                    inv.status === 'paid' ? "bg-emerald-50 text-emerald-600" : 
                    inv.status === 'overdue' ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"
                  )}>
                    {inv.status === 'paid' ? 'Đã thanh toán' : inv.status === 'overdue' ? 'Quá hạn' : 'Chờ thanh toán'}
                  </span>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400">Chưa có hóa đơn nào.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const BudgetManagement = ({ companyId }: { companyId: string }) => {
  const [budgets, setBudgets] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'budget_plans'), where('companyId', '==', companyId));
    const unsub = onSnapshot(q, snap => {
      setBudgets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [companyId]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-slate-900">Quản lý ngân sách</h3>
        <button className="text-emerald-600 text-sm font-bold hover:underline">Lập kế hoạch năm</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {loading ? (
          <div className="col-span-full py-10 text-center text-slate-400 italic">Đang tải ngân sách...</div>
        ) : budgets.length > 0 ? budgets.map(budget => {
          const percent = Math.min(100, (budget.actualAmount / budget.plannedAmount) * 100);
          return (
            <div key={budget.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="font-bold text-slate-900">{budget.category}</h4>
                  <p className="text-xs text-slate-500">Kỳ: {budget.period}</p>
                </div>
                <span className={cn(
                  "text-xs font-bold px-2 py-1 rounded-lg",
                  percent > 90 ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"
                )}>
                  {percent.toFixed(1)}%
                </span>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Thực tế: {budget.actualAmount?.toLocaleString()} ₫</span>
                  <span className="text-slate-900 font-bold">Kế hoạch: {budget.plannedAmount?.toLocaleString()} ₫</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${percent}%` }}
                    className={cn(
                      "h-full rounded-full",
                      percent > 90 ? "bg-rose-500" : "bg-emerald-500"
                    )}
                  />
                </div>
              </div>
            </div>
          );
        }) : (
          <div className="col-span-full py-10 text-center text-slate-400">Chưa có dữ liệu ngân sách.</div>
        )}
      </div>
    </div>
  );
};

const FixedAssets = ({ companyId }: { companyId: string }) => {
  const [assets, setAssets] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'assets'), where('companyId', '==', companyId));
    const unsub = onSnapshot(q, snap => {
      setAssets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [companyId]);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-slate-900">Tài sản cố định & Khấu hao</h3>
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Tài sản</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Nguyên giá</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Khấu hao lũy kế</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Giá trị còn lại</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Phương pháp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400 italic">Đang tải dữ liệu...</td></tr>
            ) : assets.length > 0 ? assets.map(asset => {
              const netValue = (asset.purchasePrice || 0) - (asset.accumulatedDepreciation || 0);
              return (
                <tr key={asset.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-slate-900">{asset.name}</p>
                    <p className="text-[10px] text-slate-400">{asset.code}</p>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-900 font-medium">{asset.purchasePrice?.toLocaleString()} ₫</td>
                  <td className="px-6 py-4 text-sm text-rose-600">-{asset.accumulatedDepreciation?.toLocaleString() || 0} ₫</td>
                  <td className="px-6 py-4 text-sm font-bold text-emerald-600">{netValue.toLocaleString()} ₫</td>
                  <td className="px-6 py-4 text-xs text-slate-500 uppercase">{asset.depreciationMethod || 'N/A'}</td>
                </tr>
              );
            }) : (
              <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400">Chưa có tài sản nào.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- Main Finance Component ---

export const Finance = () => {
  const employeeData = useEmployee();
  const [activeTab, setActiveTab] = useState<'overview' | 'ledger' | 'arap' | 'budget' | 'assets' | 'reports'>('overview');
  const [stats, setStats] = useState({
    cashBalance: 2450000000,
    receivables: 850000000,
    payables: 420000000,
    monthlyRevenue: 1200000000
  });

  if (!employeeData) return null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Tài chính & Kế toán</h1>
          <p className="text-slate-500 text-sm">Quản lý dòng tiền, công nợ và sức khỏe tài chính doanh nghiệp.</p>
        </div>
        <div className="flex gap-2">
          <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
            <Download size={20} />
          </button>
          <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
            <Filter size={20} />
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Số dư tiền mặt" 
          value={`${stats.cashBalance.toLocaleString()} ₫`} 
          icon={DollarSign} 
          color="bg-emerald-50 text-emerald-600" 
          trend="up"
        />
        <StatCard 
          title="Khoản phải thu (AR)" 
          value={`${stats.receivables.toLocaleString()} ₫`} 
          subValue="12 hóa đơn chưa thanh toán"
          icon={TrendingUp} 
          color="bg-blue-50 text-blue-600" 
        />
        <StatCard 
          title="Khoản phải trả (AP)" 
          value={`${stats.payables.toLocaleString()} ₫`} 
          subValue="5 hóa đơn đến hạn"
          icon={TrendingDown} 
          color="bg-rose-50 text-rose-600" 
        />
        <StatCard 
          title="Doanh thu tháng" 
          value={`${stats.monthlyRevenue.toLocaleString()} ₫`} 
          icon={PieChart} 
          color="bg-purple-50 text-purple-600" 
          trend="up"
        />
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide border-b border-slate-100">
        <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} icon={Building2} label="Tổng quan" />
        <TabButton active={activeTab === 'ledger'} onClick={() => setActiveTab('ledger')} icon={FileText} label="Kế toán tổng hợp" />
        <TabButton active={activeTab === 'arap'} onClick={() => setActiveTab('arap')} icon={History} label="Công nợ AR/AP" />
        <TabButton active={activeTab === 'budget'} onClick={() => setActiveTab('budget')} icon={Calculator} label="Ngân sách" />
        <TabButton active={activeTab === 'assets'} onClick={() => setActiveTab('assets')} icon={Briefcase} label="Tài sản cố định" />
        <TabButton active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} icon={PieChart} label="Báo cáo" />
      </div>

      {/* Tab Content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="min-h-[400px]"
      >
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 mb-6">Dòng tiền gần đây</h3>
                <div className="space-y-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="flex items-center gap-4">
                        <div className={cn("p-2 rounded-lg", i % 2 === 0 ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600")}>
                          {i % 2 === 0 ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{i % 2 === 0 ? 'Thanh toán từ khách hàng' : 'Thanh toán nhà cung cấp'}</p>
                          <p className="text-xs text-slate-500">27/03/2026 • Tham chiếu: #INV-00{i}</p>
                        </div>
                      </div>
                      <p className={cn("font-bold", i % 2 === 0 ? "text-emerald-600" : "text-rose-600")}>
                        {i % 2 === 0 ? '+' : '-'}{(i * 15000000).toLocaleString()} ₫
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 mb-6">Cảnh báo tài chính</h3>
                <div className="space-y-4">
                  <div className="flex gap-3 p-4 rounded-xl bg-rose-50 border border-rose-100">
                    <AlertCircle className="text-rose-600 shrink-0" size={20} />
                    <div>
                      <p className="text-sm font-bold text-rose-900">3 Hóa đơn quá hạn</p>
                      <p className="text-xs text-rose-600">Tổng giá trị: 125,000,000 ₫</p>
                    </div>
                  </div>
                  <div className="flex gap-3 p-4 rounded-xl bg-amber-50 border border-amber-100">
                    <Clock className="text-amber-600 shrink-0" size={20} />
                    <div>
                      <p className="text-sm font-bold text-amber-900">Ngân sách Marketing sắp hết</p>
                      <p className="text-xs text-amber-600">Đã sử dụng 92% kế hoạch tháng.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ledger' && <GeneralLedger companyId={employeeData.companyId} />}
        {activeTab === 'arap' && <AccountsPayableReceivable companyId={employeeData.companyId} />}
        {activeTab === 'budget' && <BudgetManagement companyId={employeeData.companyId} />}
        {activeTab === 'assets' && <FixedAssets companyId={employeeData.companyId} />}
        
        {activeTab === 'reports' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: 'Bảng cân đối kế toán', desc: 'Tóm tắt tài sản, nợ phải trả và vốn chủ sở hữu.', icon: Building2 },
              { title: 'Báo cáo kết quả KD (P&L)', desc: 'Doanh thu, chi phí và lợi nhuận ròng.', icon: TrendingUp },
              { title: 'Báo cáo lưu chuyển tiền tệ', desc: 'Dòng tiền vào và ra từ các hoạt động.', icon: DollarSign },
              { title: 'Sổ chi tiết tài khoản', desc: 'Chi tiết các giao dịch theo từng tài khoản.', icon: FileText },
              { title: 'Báo cáo tuổi nợ', desc: 'Phân tích các khoản nợ theo thời gian.', icon: Clock },
              { title: 'Báo cáo khấu hao tài sản', desc: 'Chi tiết khấu hao định kỳ hàng tháng.', icon: Calculator }
            ].map((report, idx) => (
              <div key={idx} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group cursor-pointer">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 rounded-xl bg-slate-50 text-slate-600 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors">
                    <report.icon size={24} />
                  </div>
                  <Download size={18} className="text-slate-300 group-hover:text-emerald-500 transition-colors" />
                </div>
                <h4 className="font-bold text-slate-900 mb-2">{report.title}</h4>
                <p className="text-xs text-slate-500 leading-relaxed">{report.desc}</p>
                <div className="mt-6 flex items-center gap-2 text-[10px] font-bold text-emerald-600 uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
                  <span>Xem báo cáo</span>
                  <ArrowUpRight size={12} />
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
};
