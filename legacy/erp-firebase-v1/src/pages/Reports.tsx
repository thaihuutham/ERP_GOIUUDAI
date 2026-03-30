import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { 
  FileText, Download, Filter, RefreshCw, TrendingUp, Users, 
  DollarSign, ShoppingBag, Briefcase, Truck, Package, Activity,
  Calendar, PieChart as PieChartIcon, BarChart as BarChartIcon,
  ChevronRight, Search, Plus
} from 'lucide-react';
import { 
  collection, query, where, getDocs, orderBy, limit, Timestamp 
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---

interface ReportData {
  id: string;
  [key: string]: any;
}

interface ModuleStats {
  title: string;
  value: string | number;
  change?: string;
  icon: React.ElementType;
  color: string;
}

// --- Components ---

const StatCard = ({ title, value, change, icon: Icon, color }: ModuleStats) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all"
  >
    <div className="flex items-center justify-between mb-4">
      <div className={cn("p-3 rounded-xl", color)}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      {change && (
        <span className={cn(
          "text-xs font-medium px-2 py-1 rounded-full",
          change.startsWith('+') ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
        )}>
          {change}
        </span>
      )}
    </div>
    <h3 className="text-sm font-medium text-gray-500 mb-1">{title}</h3>
    <p className="text-2xl font-bold text-gray-900">{value}</p>
  </motion.div>
);

const Reports = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'sales' | 'hr' | 'finance' | 'scm' | 'projects' | 'assets'>('overview');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ModuleStats[]>([]);
  const [reportData, setReportData] = useState<ReportData[]>([]);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | '1y'>('30d');
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      fetchOverviewStats();
    }
  }, [user]);

  useEffect(() => {
    if (user && activeTab !== 'overview') {
      fetchModuleData(activeTab);
    }
  }, [user, activeTab, timeRange]);

  const fetchOverviewStats = async () => {
    setLoading(true);
    try {
      // In a real app, these would be aggregated or fetched from a stats collection
      // For now, we'll fetch some counts to simulate
      const companyId = user?.uid; // Simplified for demo
      
      const salesQuery = query(collection(db, 'orders'), limit(100));
      const hrQuery = query(collection(db, 'employees'), limit(100));
      const financeQuery = query(collection(db, 'invoices'), limit(100));
      const scmQuery = query(collection(db, 'purchase_orders'), limit(100));

      const [salesSnap, hrSnap, financeSnap, scmSnap] = await Promise.all([
        getDocs(salesQuery),
        getDocs(hrQuery),
        getDocs(financeQuery),
        getDocs(scmQuery)
      ]);

      const totalRevenue = salesSnap.docs.reduce((sum, doc) => sum + (doc.data().totalAmount || 0), 0);
      const totalEmployees = hrSnap.size;
      const pendingInvoices = financeSnap.docs.filter(doc => doc.data().status === 'unpaid').length;
      const activePOs = scmSnap.docs.filter(doc => doc.data().status === 'ordered').length;

      setStats([
        { title: 'Doanh thu tổng', value: `$${totalRevenue.toLocaleString()}`, change: '+12.5%', icon: DollarSign, color: 'bg-blue-500' },
        { title: 'Tổng nhân sự', value: totalEmployees, change: '+2', icon: Users, color: 'bg-purple-500' },
        { title: 'Hóa đơn chưa thanh toán', value: pendingInvoices, change: '-5%', icon: FileText, color: 'bg-orange-500' },
        { title: 'Đơn mua hàng đang xử lý', value: activePOs, change: '+3', icon: ShoppingBag, color: 'bg-green-500' },
      ]);
    } catch (error) {
      console.error('Error fetching stats:', error);
      toast.error('Không thể tải dữ liệu tổng quan');
    } finally {
      setLoading(false);
    }
  };

  const fetchModuleData = async (module: string) => {
    setLoading(true);
    try {
      let collectionName = '';
      switch (module) {
        case 'sales': collectionName = 'orders'; break;
        case 'hr': collectionName = 'employees'; break;
        case 'finance': collectionName = 'invoices'; break;
        case 'scm': collectionName = 'purchase_orders'; break;
        case 'projects': collectionName = 'projects'; break;
        case 'assets': collectionName = 'assets'; break;
        default: return;
      }

      const q = query(collection(db, collectionName), limit(50));
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setReportData(data);
    } catch (error) {
      console.error(`Error fetching ${module} data:`, error);
      toast.error(`Không thể tải dữ liệu báo cáo ${module}`);
    } finally {
      setLoading(false);
    }
  };

  const renderOverview = () => (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, idx) => (stat && <StatCard key={idx} {...stat} />))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-500" />
            Xu hướng doanh thu
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={[
                { name: 'Tháng 1', revenue: 4000 },
                { name: 'Tháng 2', revenue: 3000 },
                { name: 'Tháng 3', revenue: 2000 },
                { name: 'Tháng 4', revenue: 2780 },
                { name: 'Tháng 5', revenue: 1890 },
                { name: 'Tháng 6', revenue: 2390 },
                { name: 'Tháng 7', revenue: 3490 },
              ]}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9ca3af'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9ca3af'}} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
            <PieChartIcon className="w-5 h-5 text-purple-500" />
            Phân bổ chi phí theo phòng ban
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Kỹ thuật', value: 400 },
                    { name: 'Kinh doanh', value: 300 },
                    { name: 'Nhân sự', value: 200 },
                    { name: 'Marketing', value: 278 },
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {[ '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981' ].map((color, index) => (
                    <Cell key={`cell-${index}`} fill={color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );

  const renderModuleReport = () => (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-6 border-bottom border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900 capitalize">Báo cáo {activeTab}</h3>
          <p className="text-sm text-gray-500">Dữ liệu chi tiết cho phân hệ {activeTab}</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-gray-50 text-gray-700 rounded-xl hover:bg-gray-100 transition-colors text-sm font-medium">
            <Filter className="w-4 h-4" />
            Bộ lọc
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm font-medium">
            <Download className="w-4 h-4" />
            Xuất báo cáo
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50/50">
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">ID</th>
              {reportData.length > 0 && Object.keys(reportData[0]).filter(k => k !== 'id' && typeof reportData[0][k] !== 'object').slice(0, 5).map(key => (
                <th key={key} className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider capitalize">{key}</th>
              ))}
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {reportData.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50 transition-colors group">
                <td className="px-6 py-4 text-sm text-gray-900 font-mono">#{item.id.slice(0, 8)}</td>
                {Object.keys(item).filter(k => k !== 'id' && typeof item[k] !== 'object').slice(0, 5).map(key => (
                  <td key={key} className="px-6 py-4 text-sm text-gray-600">
                    {typeof item[key] === 'number' ? item[key].toLocaleString() : String(item[key])}
                  </td>
                ))}
                <td className="px-6 py-4 text-right">
                  <button className="p-2 text-gray-400 hover:text-blue-600 transition-colors">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </td>
              </tr>
            ))}
            {reportData.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  Chưa có dữ liệu cho báo cáo này
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8f9fa] p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Trung tâm Báo cáo</h1>
            <p className="text-gray-500 mt-1">Phân tích và theo dõi hiệu suất toàn doanh nghiệp</p>
          </div>
          <div className="flex items-center gap-3">
            <select 
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as any)}
              className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="7d">7 ngày qua</option>
              <option value="30d">30 ngày qua</option>
              <option value="90d">90 ngày qua</option>
              <option value="1y">1 năm qua</option>
            </select>
            <button 
              onClick={() => activeTab === 'overview' ? fetchOverviewStats() : fetchModuleData(activeTab)}
              className="p-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <RefreshCw className={cn("w-5 h-5 text-gray-600", loading && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-2xl w-fit overflow-x-auto max-w-full no-scrollbar">
          {[
            { id: 'overview', label: 'Tổng quan', icon: Activity },
            { id: 'sales', label: 'Kinh doanh', icon: ShoppingBag },
            { id: 'hr', label: 'Nhân sự', icon: Users },
            { id: 'finance', label: 'Tài chính', icon: DollarSign },
            { id: 'scm', label: 'Chuỗi cung ứng', icon: Truck },
            { id: 'projects', label: 'Dự án', icon: Briefcase },
            { id: 'assets', label: 'Tài sản', icon: Package },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap",
                activeTab === tab.id 
                  ? "bg-white text-blue-600 shadow-sm" 
                  : "text-gray-500 hover:text-gray-700 hover:bg-white/50"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'overview' ? renderOverview() : renderModuleReport()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Reports;
