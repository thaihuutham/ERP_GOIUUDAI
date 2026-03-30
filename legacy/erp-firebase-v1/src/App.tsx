import React, { StrictMode, useEffect, useState, useMemo, Component, type ReactNode, createContext, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  ShoppingCart, 
  Package, 
  Settings as SettingsIcon, 
  LogOut, 
  Menu, 
  X,
  Search,
  Bell,
  User as UserIcon,
  ChevronRight,
  TrendingUp,
  CreditCard,
  Plus,
  AlertCircle,
  TrendingDown,
  DollarSign,
  Clock,
  Shield,
  RefreshCw,
  Trash2,
  Monitor,
  Calendar,
  UserCheck,
  FileText,
  Briefcase,
  Truck,
  GitBranch,
  BarChart3,
  ClipboardCheck
} from 'lucide-react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc,
  serverTimestamp, 
  collection, 
  query, 
  onSnapshot, 
  orderBy, 
  limit, 
  getDocs,
  where,
  addDoc,
  deleteDoc,
  documentId,
  type DocumentData,
  type QueryConstraint
} from 'firebase/firestore';

import { Assets } from './pages/Assets';
import Projects from './pages/Projects';
import ProjectDetails from './pages/ProjectDetails';
import { Finance } from './pages/Finance';
import { SupplyChain } from './pages/SupplyChain';
import { Workflows } from './pages/Workflows';
import { HumanResources } from './pages/HumanResources';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

const buildHierarchyQuery = (path: string, employeeData: any, userUid: string, additionalConstraints: QueryConstraint[] = []) => {
  if (!employeeData) return query(collection(db, path), ...additionalConstraints);

  const constraints: QueryConstraint[] = [];
  
  const cId = employeeData.companyId || '';
  const bId = employeeData.branchId || '';
  const dId = employeeData.departmentId || '';
  const tId = employeeData.teamId || '';

  if (employeeData.role === 'admin') {
    // Admins can see everything
  } else if (employeeData.roleLevel <= 1) {
    constraints.push(where('companyId', '==', cId));
  } else if (employeeData.roleLevel <= 2) {
    constraints.push(where('companyId', '==', cId));
    constraints.push(where('branchId', '==', bId));
  } else if (employeeData.roleLevel <= 3) {
    constraints.push(where('companyId', '==', cId));
    constraints.push(where('branchId', '==', bId));
    constraints.push(where('departmentId', '==', dId));
  } else if (employeeData.roleLevel <= 4) {
    constraints.push(where('companyId', '==', cId));
    constraints.push(where('branchId', '==', bId));
    constraints.push(where('departmentId', '==', dId));
    constraints.push(where('teamId', '==', tId));
  } else {
    constraints.push(where('companyId', '==', cId));
    constraints.push(where('branchId', '==', bId));
    constraints.push(where('departmentId', '==', dId));
    constraints.push(where('teamId', '==', tId));
    if (path === 'employees') {
      constraints.push(where(documentId(), '==', userUid));
    } else {
      constraints.push(where('employeeId', '==', userUid));
    }
  }

  return query(collection(db, path), ...constraints, ...additionalConstraints);
};
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Toaster, toast } from 'sonner';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area 
} from 'recharts';
import { handleFirestoreError, OperationType } from './utils/error-handler';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Contexts ---
export const EmployeeContext = createContext<DocumentData | null>(null);
export const useEmployee = () => useContext(EmployeeContext);

// --- Error Boundary ---
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends (Component as any) {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertCircle size={32} />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Đã có lỗi xảy ra</h2>
            <p className="text-slate-500 mb-6">Hệ thống gặp sự cố không mong muốn. Vui lòng tải lại trang hoặc liên hệ IT.</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors"
            >
              Tải lại trang
            </button>
            {process.env.NODE_ENV !== 'production' && (
              <pre className="mt-6 p-4 bg-slate-100 rounded-lg text-left text-xs overflow-auto max-h-40 text-red-600">
                {JSON.stringify(this.state.error, null, 2)}
              </pre>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// --- Components ---

const SidebarItem = ({ 
  icon: Icon, 
  label, 
  path, 
  subItems 
}: { 
  icon: any, 
  label: string, 
  path?: string, 
  subItems?: { label: string, path: string }[] 
}) => {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const active = path ? location.pathname === path : subItems?.some(item => location.pathname === item.path);
  
  useEffect(() => {
    if (subItems?.some(item => location.pathname === item.path)) {
      setIsOpen(true);
    }
  }, [location.pathname, subItems]);

  const content = (
    <div className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group cursor-pointer",
      active && !subItems
        ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200" 
        : isOpen && subItems
          ? "bg-white border border-slate-200 text-slate-900 shadow-sm"
          : "text-slate-600 hover:bg-emerald-50 hover:text-emerald-700"
    )}>
      <Icon size={20} className={cn("transition-transform group-hover:scale-110", active && !subItems ? "text-white" : isOpen && subItems ? "text-emerald-600" : "text-slate-400 group-hover:text-emerald-600")} />
      <span className="font-medium flex-1">{label}</span>
      {subItems && (
        <ChevronRight 
          size={16} 
          className={cn("transition-transform duration-200", isOpen && "rotate-90")} 
        />
      )}
      {active && !subItems && (
        <motion.div 
          layoutId="active-pill"
          className="ml-auto w-1.5 h-1.5 rounded-full bg-white"
        />
      )}
    </div>
  );

  return (
    <div className="space-y-1">
      {path ? (
        <Link to={path}>{content}</Link>
      ) : (
        <div onClick={() => setIsOpen(!isOpen)}>{content}</div>
      )}
      
      <AnimatePresence>
        {isOpen && subItems && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden pl-11 space-y-1"
          >
            {subItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "block py-2 text-sm transition-colors",
                  location.pathname === item.path
                    ? "text-emerald-600 font-bold"
                    : "text-slate-500 hover:text-emerald-600"
                )}
              >
                {item.label}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const NotificationBell = () => {
  const [notifications, setNotifications] = useState<DocumentData[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', auth.currentUser?.uid),
      orderBy('createdAt', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return unsubscribe;
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = async (id: string) => {
    await updateDoc(doc(db, 'notifications', id), { read: true });
  };

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-slate-500 hover:bg-slate-100 rounded-full relative transition-colors"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 rounded-full border-2 border-white text-[10px] text-white flex items-center justify-center font-bold">
            {unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50"
          >
            <div className="p-4 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm">Thông báo</h3>
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Mới nhất</span>
            </div>
            <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
              {notifications.length > 0 ? notifications.map((n) => (
                <div 
                  key={n.id} 
                  onClick={() => markAsRead(n.id)}
                  className={cn("p-4 hover:bg-slate-50 transition-colors cursor-pointer", !n.read && "bg-emerald-50/30")}
                >
                  <p className="text-sm font-bold text-slate-900 mb-0.5">{n.title}</p>
                  <p className="text-xs text-slate-600 leading-relaxed">{n.message}</p>
                  <p className="text-[10px] text-slate-400 mt-2">
                    {n.createdAt?.toDate ? n.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Vừa xong'}
                  </p>
                </div>
              )) : (
                <div className="p-10 text-center text-slate-400 italic text-sm">Không có thông báo nào</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const Navbar = ({ 
  user, 
  onLogout, 
  sidebarOpen, 
  setSidebarOpen 
}: { 
  user: User, 
  onLogout: () => void, 
  sidebarOpen: boolean, 
  setSidebarOpen: (open: boolean) => void 
}) => (
  <header className="h-16 border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-30 px-6 flex items-center justify-between">
    <div className="flex items-center gap-4 flex-1">
      <button 
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className={cn(
          "p-2 rounded-xl transition-all duration-300",
          sidebarOpen 
            ? "text-slate-400 hover:text-red-600 hover:bg-red-50" 
            : "bg-emerald-600 text-white shadow-lg shadow-emerald-200 hover:bg-emerald-700"
        )}
        title={sidebarOpen ? "Ẩn menu" : "Hiện menu"}
      >
        {sidebarOpen ? <X size={20} className="lg:hidden" /> : <Menu size={20} />}
        {sidebarOpen && <Menu size={20} className="hidden lg:block" />}
      </button>

      {!sidebarOpen && (
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-2"
        >
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-emerald-200">
            <LayoutDashboard size={18} />
          </div>
          <span className="text-lg font-black text-slate-900 tracking-tighter">RETAIL ERP</span>
        </motion.div>
      )}
      
      <div className="relative max-w-md w-full hidden md:block">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input 
          type="text" 
          placeholder="Tìm kiếm khách hàng, đơn hàng..." 
          className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-full text-sm focus:ring-2 focus:ring-emerald-500 transition-all"
        />
      </div>
    </div>
    
    <div className="flex items-center gap-4">
      <NotificationBell />
      
      <div className="h-8 w-px bg-slate-200 mx-2"></div>
      
      <div className="flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <p className="text-sm font-semibold text-slate-900">{user.displayName}</p>
          <p className="text-xs text-slate-500">Nhân viên</p>
        </div>
        <img 
          src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} 
          alt="Avatar" 
          className="w-9 h-9 rounded-full border-2 border-emerald-100"
          referrerPolicy="no-referrer"
        />
        <button 
          onClick={onLogout}
          className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
          title="Đăng xuất"
        >
          <LogOut size={20} />
        </button>
      </div>
    </div>
  </header>
);

// --- Pages ---

const Dashboard = () => {
  const employeeData = useEmployee();
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalCustomers: 0,
    totalOrders: 0,
    totalProducts: 0
  });
  const [recentOrders, setRecentOrders] = useState<DocumentData[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [hrStats, setHrStats] = useState({
    totalEmployees: 0,
    presentToday: 0,
    onLeave: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const statsPath = 'system/stats';
    const ordersPath = 'orders';
    
    // Initialize stats if not exists
    const initStats = async () => {
      const sDoc = await getDoc(doc(db, statsPath));
      if (!sDoc.exists()) {
        await setDoc(doc(db, statsPath), {
          totalRevenue: 0,
          totalCustomers: 0,
          totalOrders: 0,
          totalProducts: 0,
          lastUpdated: serverTimestamp()
        });
      }
    };
    initStats();

    // Fetch global stats
    const unsubscribeStats = onSnapshot(doc(db, statsPath), (snapshot) => {
      if (snapshot.exists()) {
        setStats(snapshot.data() as any);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, statsPath);
    });

    // Fetch recent orders
    const q = buildHierarchyQuery(ordersPath, employeeData, auth.currentUser?.uid || '');
    const unsubscribeOrders = onSnapshot(q, (snapshot) => {
      let orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      orders.sort((a: any, b: any) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setRecentOrders(orders.slice(0, 5));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, ordersPath);
    });

    // Fetch HR stats
    const fetchHrStats = async () => {
      if (!employeeData) return;
      try {
        const employeesSnap = await getDocs(query(collection(db, 'employees'), where('companyId', '==', employeeData.companyId)));
        const todayStr = new Date().toISOString().split('T')[0];
        const attendanceSnap = await getDocs(query(collection(db, 'attendance'), where('companyId', '==', employeeData.companyId), where('date', '==', todayStr)));
        const leaveSnap = await getDocs(query(collection(db, 'leave_requests'), where('companyId', '==', employeeData.companyId), where('status', '==', 'approved')));
        
        const onLeave = leaveSnap.docs.filter(doc => {
          const data = doc.data();
          const today = new Date(todayStr);
          return today >= new Date(data.startDate) && today <= new Date(data.endDate);
        }).length;

        setHrStats({
          totalEmployees: employeesSnap.size,
          presentToday: attendanceSnap.size,
          onLeave
        });
      } catch (error) {
        console.error("Error fetching HR stats:", error);
      }
    };
    fetchHrStats();

    // Mock data for chart
    setChartData([
      { name: 'T2', revenue: 4000 },
      { name: 'T3', revenue: 3000 },
      { name: 'T4', revenue: 2000 },
      { name: 'T5', revenue: 2780 },
      { name: 'T6', revenue: 1890 },
      { name: 'T7', revenue: 2390 },
      { name: 'CN', revenue: 3490 },
    ]);

    return () => {
      unsubscribeStats();
      unsubscribeOrders();
    };
  }, []);

  const refreshStats = async () => {
    const statsPath = 'system/stats';
    try {
      const customersSnap = await getDocs(collection(db, 'customers'));
      const ordersSnap = await getDocs(collection(db, 'orders'));
      const productsSnap = await getDocs(collection(db, 'products'));
      
      const totalRevenue = ordersSnap.docs.reduce((sum, doc) => sum + (doc.data().totalAmount || 0), 0);
      
      await setDoc(doc(db, statsPath), {
        totalRevenue,
        totalCustomers: customersSnap.size,
        totalOrders: ordersSnap.size,
        totalProducts: productsSnap.size,
        lastUpdated: serverTimestamp()
      });
      toast.success("Đã cập nhật số liệu hệ thống");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, statsPath);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tổng quan hệ thống</h1>
          <p className="text-slate-500">Chào mừng trở lại, đây là những gì đang diễn ra hôm nay.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={refreshStats}
            className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-50 transition-all"
          >
            <TrendingUp size={18} />
            <span>Cập nhật số liệu</span>
          </button>
          <Link to="/sales" className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-md shadow-emerald-100">
            <Plus size={20} />
            <span>Tạo đơn hàng mới</span>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: "Tổng doanh thu", value: `${stats.totalRevenue?.toLocaleString() || 0} ₫`, change: "+12.5%", icon: TrendingUp, color: "emerald" },
          { label: "Khách hàng", value: stats.totalCustomers?.toLocaleString() || "0", change: "+8.2%", icon: Users, color: "blue" },
          { label: "Đơn hàng", value: stats.totalOrders?.toLocaleString() || "0", change: "-2.4%", icon: ShoppingCart, color: "orange" },
          { label: "Sản phẩm", value: stats.totalProducts?.toLocaleString() || "0", change: "+4", icon: Package, color: "purple" },
        ].map((stat, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={cn("p-3 rounded-xl", 
                stat.color === 'emerald' ? "bg-emerald-50 text-emerald-600" :
                stat.color === 'blue' ? "bg-blue-50 text-blue-600" :
                stat.color === 'orange' ? "bg-orange-50 text-orange-600" :
                "bg-purple-50 text-purple-600"
              )}>
                <stat.icon size={24} />
              </div>
              <span className={cn("text-xs font-bold px-2 py-1 rounded-full", stat.change.startsWith('+') ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600")}>
                {stat.change}
              </span>
            </div>
            <p className="text-slate-500 text-sm font-medium">{stat.label}</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</h3>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <Users size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tổng nhân sự</p>
            <p className="text-xl font-bold text-slate-900">{hrStats.totalEmployees} người</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
            <UserCheck size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Hiện diện hôm nay</p>
            <p className="text-xl font-bold text-slate-900">{hrStats.presentToday} người</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
            <Calendar size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Đang nghỉ phép</p>
            <p className="text-xl font-bold text-slate-900">{hrStats.onLeave} người</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-slate-900">Biểu đồ doanh thu</h3>
            <select className="text-sm border-slate-200 rounded-lg focus:ring-emerald-500">
              <option>7 ngày qua</option>
              <option>30 ngày qua</option>
            </select>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ color: '#10b981', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <h3 className="font-bold text-slate-900 mb-6">Đơn hàng gần đây</h3>
          <div className="space-y-4">
            {recentOrders.length > 0 ? recentOrders.map((order, i) => (
              <div key={order.id} className="flex items-center gap-4 p-3 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold">
                  {order.customerName?.[0] || 'C'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{order.customerName || 'Khách lẻ'}</p>
                  <p className="text-xs text-slate-500">
                    {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Vừa xong'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-900">{order.totalAmount?.toLocaleString() || 0} ₫</p>
                  <p className={cn(
                    "text-[10px] font-bold uppercase",
                    order.status === 'completed' ? "text-emerald-600" : "text-orange-600"
                  )}>{order.status === 'completed' ? 'Xong' : 'Chờ'}</p>
                </div>
              </div>
            )) : (
              <div className="text-center py-10">
                <p className="text-slate-400 text-sm italic">Chưa có đơn hàng nào</p>
              </div>
            )}
          </div>
          <Link to="/sales" className="block w-full mt-6 py-2 text-center text-emerald-600 font-semibold text-sm hover:bg-emerald-50 rounded-lg transition-colors">
            Xem tất cả đơn hàng
          </Link>
        </div>
      </div>
    </div>
  );
};

// ... existing code ...

const AddCustomerModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  const employeeData = useEmployee();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    status: 'active'
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const path = 'customers';
    try {
      await addDoc(collection(db, path), {
        ...formData,
        totalSpent: 0,
        createdAt: serverTimestamp(),
        lastOrderDate: null,
        companyId: employeeData?.companyId || '',
        branchId: employeeData?.branchId || '',
        departmentId: employeeData?.departmentId || '',
        teamId: employeeData?.teamId || '',
        employeeId: employeeData?.id || ''
      });
      toast.success("Đã thêm khách hàng thành công");
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900">Thêm khách hàng mới</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Họ và tên</label>
            <input 
              required
              type="text" 
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all"
              placeholder="Nguyễn Văn A"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email</label>
            <input 
              required
              type="email" 
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all"
              placeholder="user@example.com"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Số điện thoại</label>
            <input 
              type="tel" 
              value={formData.phone}
              onChange={(e) => setFormData({...formData, phone: e.target.value})}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all"
              placeholder="0901234567"
            />
          </div>
          
          <div className="pt-4 flex gap-3">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 py-3 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              Hủy
            </button>
            <button 
              type="submit"
              disabled={submitting}
              className="flex-1 py-3 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-lg shadow-emerald-100 transition-all disabled:opacity-50"
            >
              {submitting ? "Đang xử lý..." : "Lưu khách hàng"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

const CRM = () => {
  const employeeData = useEmployee();
  const [customers, setCustomers] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const path = 'customers';
    const q = buildHierarchyQuery(path, employeeData, auth.currentUser?.uid || '');
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a: any, b: any) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setCustomers(data.slice(0, 50));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });

    return unsubscribe;
  }, [employeeData]);

  const filteredCustomers = customers.filter(c => 
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone?.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <AddCustomerModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quản lý khách hàng</h1>
          <p className="text-slate-500">Hệ thống hiện có {customers.length.toLocaleString()} khách hàng trong danh sách này.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-md shadow-emerald-100"
        >
          <Plus size={20} />
          <span>Thêm khách hàng</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-wrap gap-4 items-center justify-between">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Tìm theo tên, email, SĐT..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50">Bộ lọc</button>
            <button className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50">Xuất Excel</button>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold tracking-wider">
              <tr>
                <th className="px-6 py-4">Khách hàng</th>
                <th className="px-6 py-4">Trạng thái</th>
                <th className="px-6 py-4">Tổng chi tiêu</th>
                <th className="px-6 py-4">Đơn cuối</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-400 italic">Đang tải dữ liệu...</td>
                </tr>
              ) : filteredCustomers.length > 0 ? filteredCustomers.map((customer, i) => (
                <tr key={customer.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                        {customer.name?.[0] || 'K'}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{customer.name}</p>
                        <p className="text-xs text-slate-500">{customer.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded-full uppercase">Hoạt động</span>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-700">{customer.totalSpent?.toLocaleString() || 0} ₫</td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {customer.lastOrderDate?.toDate ? customer.lastOrderDate.toDate().toLocaleDateString() : 'Chưa có'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="p-2 text-slate-400 hover:text-emerald-600 transition-colors">
                      <ChevronRight size={18} />
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-400 italic">Không tìm thấy khách hàng nào</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        <div className="p-4 border-t border-slate-100 flex items-center justify-between text-sm text-slate-500">
          <p>Hiển thị {filteredCustomers.length} khách hàng</p>
          <div className="flex gap-2">
            <button className="px-3 py-1 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50" disabled>Trước</button>
            <button className="px-3 py-1 border border-emerald-600 bg-emerald-600 text-white rounded">1</button>
            <button className="px-3 py-1 border border-slate-200 rounded hover:bg-slate-50">Sau</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const AddProductModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  const employeeData = useEmployee();
  const [formData, setFormData] = useState({
    name: '',
    type: 'digital_product',
    price: 0,
    description: '',
    status: 'available'
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const path = 'products';
    try {
      await addDoc(collection(db, path), {
        ...formData,
        price: Number(formData.price),
        createdAt: serverTimestamp(),
        companyId: employeeData?.companyId || '',
        branchId: employeeData?.branchId || '',
        departmentId: employeeData?.departmentId || '',
        teamId: employeeData?.teamId || '',
        employeeId: employeeData?.id || ''
      });
      toast.success("Đã thêm sản phẩm thành công");
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900">Thêm sản phẩm mới</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tên sản phẩm</label>
            <input 
              required
              type="text" 
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all"
              placeholder="Tên sản phẩm số hoặc dịch vụ"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Loại</label>
              <select 
                value={formData.type}
                onChange={(e) => setFormData({...formData, type: e.target.value})}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all"
              >
                <option value="digital_product">Sản phẩm số</option>
                <option value="service">Dịch vụ</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Giá (₫)</label>
              <input 
                required
                type="number" 
                value={formData.price}
                onChange={(e) => setFormData({...formData, price: Number(e.target.value)})}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Mô tả</label>
            <textarea 
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all"
              rows={3}
              placeholder="Mô tả chi tiết sản phẩm..."
            />
          </div>
          
          <div className="pt-4 flex gap-3">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 py-3 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              Hủy
            </button>
            <button 
              type="submit"
              disabled={submitting}
              className="flex-1 py-3 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-lg shadow-emerald-100 transition-all disabled:opacity-50"
            >
              {submitting ? "Đang xử lý..." : "Lưu sản phẩm"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

const Products = () => {
  const employeeData = useEmployee();
  const [products, setProducts] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const path = 'products';
    // Products might be visible to the whole company, let's use buildHierarchyQuery but maybe adjust if needed.
    // In firestore.rules: allow read: if isStaff() && user.companyId == resource.data.companyId;
    // So we only need companyId filter for products!
    const q = employeeData?.role === 'admin' 
      ? query(collection(db, path))
      : query(collection(db, path), where('companyId', '==', employeeData?.companyId || ''));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a: any, b: any) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setProducts(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });

    return unsubscribe;
  }, [employeeData]);

  const filteredProducts = products.filter(p => 
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.type?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <AddProductModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quản lý sản phẩm & dịch vụ</h1>
          <p className="text-slate-500">Danh mục sản phẩm số và các gói dịch vụ hiện có.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-md shadow-emerald-100"
        >
          <Plus size={20} />
          <span>Thêm sản phẩm</span>
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm mb-6">
        <div className="relative max-w-md w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Tìm kiếm sản phẩm..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-20 text-center text-slate-400 italic">Đang tải sản phẩm...</div>
        ) : filteredProducts.length > 0 ? filteredProducts.map((product, i) => (
          <motion.div 
            key={product.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group"
          >
            <div className="flex justify-between items-start mb-4">
              <div className={cn("p-3 rounded-xl", product.type === "Digital" ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600")}>
                <Package size={24} />
              </div>
              <span className={cn("text-[10px] font-bold px-2 py-1 rounded-full uppercase", product.status === "Available" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500")}>
                {product.status || 'Available'}
              </span>
            </div>
            <h3 className="font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">{product.name}</h3>
            <p className="text-xs text-slate-500 mt-1">{product.type}</p>
            
            <div className="mt-6 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 font-medium">Giá bán</p>
                <p className="text-lg font-bold text-slate-900">{product.price?.toLocaleString() || 0} ₫</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400 font-medium">Đã bán</p>
                <p className="text-sm font-bold text-slate-700">{product.salesCount || 0}</p>
              </div>
            </div>
            
            <div className="mt-6 pt-4 border-t border-slate-50 flex gap-2">
              <button className="flex-1 py-2 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors">Chi tiết</button>
              <button className="flex-1 py-2 text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors">Chỉnh sửa</button>
            </div>
          </motion.div>
        )) : (
          <div className="col-span-full py-20 text-center text-slate-400 italic">Không tìm thấy sản phẩm nào</div>
        )}
      </div>
    </div>
  );
};

const AddOrderModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  const employeeData = useEmployee();
  const [customers, setCustomers] = useState<DocumentData[]>([]);
  const [products, setProducts] = useState<DocumentData[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedItems, setSelectedItems] = useState<{productId: string, productName: string, quantity: number, price: number}[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const fetchInitialData = async () => {
        const customersSnap = await getDocs(collection(db, 'customers'));
        setCustomers(customersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        const productsSnap = await getDocs(collection(db, 'products'));
        setProducts(productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      };
      fetchInitialData();
    }
  }, [isOpen]);

  const addItem = (product: DocumentData) => {
    const existing = selectedItems.find(i => i.productId === product.id);
    if (existing) {
      setSelectedItems(selectedItems.map(i => i.productId === product.id ? {...i, quantity: i.quantity + 1} : i));
    } else {
      setSelectedItems([...selectedItems, {
        productId: product.id,
        productName: product.name,
        quantity: 1,
        price: product.price
      }]);
    }
  };

  const removeItem = (productId: string) => {
    setSelectedItems(selectedItems.filter(i => i.productId !== productId));
  };

  const totalAmount = selectedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId || selectedItems.length === 0) {
      toast.error("Vui lòng chọn khách hàng và ít nhất một sản phẩm");
      return;
    }
    setSubmitting(true);
    const path = 'orders';
    try {
      const customer = customers.find(c => c.id === selectedCustomerId);
      await addDoc(collection(db, path), {
        customerId: selectedCustomerId,
        customerName: customer?.name || 'Unknown',
        items: selectedItems,
        totalAmount,
        status: 'pending',
        createdAt: serverTimestamp(),
        companyId: employeeData?.companyId || '',
        branchId: employeeData?.branchId || '',
        departmentId: employeeData?.departmentId || '',
        teamId: employeeData?.teamId || '',
        employeeId: employeeData?.id || ''
      });
      toast.success("Đã tạo đơn hàng thành công");
      onClose();
      setSelectedItems([]);
      setSelectedCustomerId('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl p-8 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900">Tạo đơn hàng mới</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Chọn khách hàng</label>
            <select 
              required
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all"
            >
              <option value="">-- Chọn khách hàng --</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Thêm sản phẩm</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
              {products.map(p => (
                <button 
                  key={p.id}
                  type="button"
                  onClick={() => addItem(p)}
                  className="text-left p-2 bg-white border border-slate-100 rounded-lg hover:border-emerald-500 hover:shadow-sm transition-all text-xs"
                >
                  <p className="font-bold text-slate-700 truncate">{p.name}</p>
                  <p className="text-emerald-600">{p.price?.toLocaleString()} ₫</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Sản phẩm đã chọn</label>
            <div className="space-y-2">
              {selectedItems.length === 0 ? (
                <p className="text-sm text-slate-400 italic py-4 text-center border-2 border-dashed border-slate-100 rounded-xl">Chưa có sản phẩm nào được chọn</p>
              ) : selectedItems.map(item => (
                <div key={item.productId} className="flex items-center justify-between bg-slate-50 p-3 rounded-xl">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{item.productName}</p>
                    <p className="text-xs text-slate-500">{item.price.toLocaleString()} ₫ x {item.quantity}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-bold text-emerald-600">{(item.price * item.quantity).toLocaleString()} ₫</p>
                    <button 
                      type="button"
                      onClick={() => removeItem(item.productId)}
                      className="p-1 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase">Tổng cộng</p>
              <p className="text-2xl font-black text-emerald-600">{totalAmount.toLocaleString()} ₫</p>
            </div>
            <div className="flex gap-3">
              <button 
                type="button"
                onClick={onClose}
                className="px-6 py-3 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Hủy
              </button>
              <button 
                type="submit"
                disabled={submitting || selectedItems.length === 0}
                className="px-6 py-3 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-lg shadow-emerald-100 transition-all disabled:opacity-50"
              >
                {submitting ? "Đang xử lý..." : "Tạo đơn hàng"}
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

const EditOrderModal = ({ isOpen, onClose, order }: { isOpen: boolean, onClose: () => void, order: DocumentData | null }) => {
  const employeeData = useEmployee();
  const [products, setProducts] = useState<DocumentData[]>([]);
  const [selectedItems, setSelectedItems] = useState<{productId: string, productName: string, quantity: number, price: number}[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [config, setConfig] = useState<any>(null);

  useEffect(() => {
    if (isOpen && order) {
      setSelectedItems(order.items || []);
      const fetchInitialData = async () => {
        const productsSnap = await getDocs(collection(db, 'products'));
        setProducts(productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        
        const configSnap = await getDoc(doc(db, 'system', 'config'));
        if (configSnap.exists()) setConfig(configSnap.data());
      };
      fetchInitialData();
    }
  }, [isOpen, order]);

  const addItem = (product: DocumentData) => {
    const existing = selectedItems.find(i => i.productId === product.id);
    if (existing) {
      setSelectedItems(selectedItems.map(i => i.productId === product.id ? {...i, quantity: i.quantity + 1} : i));
    } else {
      setSelectedItems([...selectedItems, {
        productId: product.id,
        productName: product.name,
        quantity: 1,
        price: product.price
      }]);
    }
  };

  const removeItem = (productId: string) => {
    setSelectedItems(selectedItems.filter(i => i.productId !== productId));
  };

  const totalAmount = selectedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order || selectedItems.length === 0) return;
    setSubmitting(true);
    
    const originalAmount = order.totalAmount || 0;
    const newAmount = totalAmount;
    
    let needsApproval = false;
    const orderSettings = config?.orderSettings;

    if (newAmount > originalAmount) {
      if (orderSettings && !orderSettings.allowIncreaseWithoutApproval) {
        needsApproval = true;
      }
    } else if (newAmount < originalAmount) {
      if (orderSettings && orderSettings.requireApprovalForDecrease) {
        needsApproval = true;
      }
    }

    try {
      if (needsApproval) {
        const approverId = orderSettings?.approverId;
        if (!approverId) {
          toast.error("Chưa cấu hình người quản lý phê duyệt. Vui lòng liên hệ Admin.");
          setSubmitting(false);
          return;
        }

        await addDoc(collection(db, 'approvals'), {
          type: 'order_edit',
          targetId: order.id,
          targetCollection: 'orders',
          requesterId: auth.currentUser?.uid,
          requesterName: employeeData?.name || 'Unknown',
          approverId: approverId,
          status: 'pending',
          data: {
            items: selectedItems,
            totalAmount: newAmount,
            originalAmount: originalAmount
          },
          companyId: employeeData?.companyId || '',
          createdAt: serverTimestamp()
        });

        await updateDoc(doc(db, 'orders', order.id), {
          status: 'pending_approval'
        });

        toast.info("Yêu cầu chỉnh sửa đã được gửi để phê duyệt.");
      } else {
        await updateDoc(doc(db, 'orders', order.id), {
          items: selectedItems,
          totalAmount: newAmount,
          updatedAt: serverTimestamp()
        });
        toast.success("Đã cập nhật đơn hàng thành công");
      }
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'orders');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !order) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl p-8 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900">Chỉnh sửa đơn hàng #{order.id.slice(-8).toUpperCase()}</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <p className="text-sm text-slate-600 mb-2">Khách hàng: <span className="font-bold">{order.customerName}</span></p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Thêm sản phẩm</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
              {products.map(p => (
                <button 
                  key={p.id}
                  type="button"
                  onClick={() => addItem(p)}
                  className="text-left p-2 bg-white border border-slate-100 rounded-lg hover:border-emerald-500 hover:shadow-sm transition-all text-xs"
                >
                  <p className="font-bold text-slate-700 truncate">{p.name}</p>
                  <p className="text-emerald-600">{p.price?.toLocaleString()} ₫</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Sản phẩm đã chọn</label>
            <div className="space-y-2">
              {selectedItems.map(item => (
                <div key={item.productId} className="flex items-center justify-between bg-slate-50 p-3 rounded-xl">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{item.productName}</p>
                    <p className="text-xs text-slate-500">{item.price.toLocaleString()} ₫ x {item.quantity}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-bold text-emerald-600">{(item.price * item.quantity).toLocaleString()} ₫</p>
                    <button 
                      type="button"
                      onClick={() => removeItem(item.productId)}
                      className="p-1 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase">Tổng cộng mới</p>
              <p className="text-2xl font-black text-emerald-600">{totalAmount.toLocaleString()} ₫</p>
              <p className="text-[10px] text-slate-400">Gốc: {order.totalAmount?.toLocaleString()} ₫</p>
            </div>
            <div className="flex gap-3">
              <button 
                type="button"
                onClick={onClose}
                className="px-6 py-3 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Hủy
              </button>
              <button 
                type="submit"
                disabled={submitting || selectedItems.length === 0}
                className="px-6 py-3 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-lg shadow-emerald-100 transition-all disabled:opacity-50"
              >
                {submitting ? "Đang xử lý..." : "Cập nhật đơn hàng"}
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

const Sales = () => {
  const employeeData = useEmployee();
  const [orders, setOrders] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState('Tất cả');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<DocumentData | null>(null);

  useEffect(() => {
    const path = 'orders';
    const q = buildHierarchyQuery(path, employeeData, auth.currentUser?.uid || '');
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a: any, b: any) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setOrders(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });

    return unsubscribe;
  }, [employeeData]);

  const filteredOrders = orders.filter(order => {
    const matchesSearch = order.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         order.customerName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTab = activeTab === 'Tất cả' || 
                      (activeTab === 'Chờ xử lý' && order.status === 'pending') ||
                      (activeTab === 'Hoàn thành' && order.status === 'completed') ||
                      (activeTab === 'Đã hủy' && order.status === 'cancelled');
    return matchesSearch && matchesTab;
  });

  return (
    <div className="space-y-6">
      <AddOrderModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      <EditOrderModal 
        isOpen={isEditModalOpen} 
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedOrder(null);
        }} 
        order={selectedOrder} 
      />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quản lý đơn hàng</h1>
          <p className="text-slate-500">Theo dõi và xử lý các giao dịch bán hàng.</p>
        </div>
        <div className="flex gap-3">
          <button className="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-50 transition-all">
            <CreditCard size={18} />
            <span>Báo cáo thuế</span>
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-md shadow-emerald-100"
          >
            <Plus size={20} />
            <span>Tạo đơn mới</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex gap-2">
            {['Tất cả', 'Chờ xử lý', 'Hoàn thành', 'Đã hủy'].map((tab) => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-4 py-2 text-sm font-bold rounded-lg transition-all",
                  activeTab === tab ? "bg-emerald-600 text-white" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="relative max-w-xs w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Tìm mã đơn, khách hàng..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold tracking-wider">
              <tr>
                <th className="px-6 py-4">Mã đơn</th>
                <th className="px-6 py-4">Khách hàng</th>
                <th className="px-6 py-4">Sản phẩm</th>
                <th className="px-6 py-4">Tổng tiền</th>
                <th className="px-6 py-4">Trạng thái</th>
                <th className="px-6 py-4">Ngày tạo</th>
                <th className="px-6 py-4">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-slate-400 italic">Đang tải đơn hàng...</td>
                </tr>
              ) : filteredOrders.length > 0 ? filteredOrders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-sm font-mono font-bold text-emerald-600">#{order.id.slice(-8).toUpperCase()}</td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold text-slate-900">{order.customerName || 'Khách lẻ'}</p>
                    <p className="text-xs text-slate-500">{order.customerEmail || 'N/A'}</p>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {order.items?.[0]?.productName} {order.items?.length > 1 ? `(+${order.items.length - 1})` : ''}
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-900">{order.totalAmount?.toLocaleString() || 0} ₫</td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2 py-1 text-[10px] font-bold rounded-full uppercase",
                      order.status === 'completed' ? "bg-emerald-50 text-emerald-600" :
                      order.status === 'pending' ? "bg-orange-50 text-orange-600" :
                      order.status === 'pending_approval' ? "bg-blue-50 text-blue-600" :
                      "bg-red-50 text-red-600"
                    )}>
                      {order.status === 'completed' ? 'Hoàn thành' : 
                       order.status === 'pending' ? 'Chờ xử lý' : 
                       order.status === 'pending_approval' ? 'Chờ phê duyệt' : 'Đã hủy'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : 'Vừa xong'}
                  </td>
                  <td className="px-6 py-4">
                    <button 
                      onClick={() => {
                        setSelectedOrder(order);
                        setIsEditModalOpen(true);
                      }}
                      className="text-xs font-bold text-emerald-600 hover:underline"
                    >
                      Sửa
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-slate-400 italic">Không tìm thấy đơn hàng nào</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const Approvals = () => {
  const [requests, setRequests] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(
      collection(db, 'approvals'),
      where('approverId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'approvals');
    });
    return unsubscribe;
  }, []);

  const handleAction = async (request: DocumentData, status: 'approved' | 'rejected') => {
    try {
      await updateDoc(doc(db, 'approvals', request.id), {
        status,
        updatedAt: serverTimestamp()
      });

      if (status === 'approved' && request.type === 'order_edit') {
        await updateDoc(doc(db, 'orders', request.targetId), {
          items: request.data.items,
          totalAmount: request.data.totalAmount,
          status: 'pending',
          updatedAt: serverTimestamp()
        });
        toast.success("Đã phê duyệt và cập nhật đơn hàng.");
      } else if (status === 'rejected' && request.type === 'order_edit') {
        await updateDoc(doc(db, 'orders', request.targetId), {
          status: 'pending'
        });
        toast.info("Đã từ chối yêu cầu chỉnh sửa.");
      }
    } catch (error) {
      toast.error("Thao tác thất bại.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Phê duyệt yêu cầu</h1>
          <p className="text-slate-500">Xem và xử lý các yêu cầu cần bạn phê duyệt.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <div className="py-20 text-center text-slate-400 italic">Đang tải yêu cầu...</div>
        ) : requests.length > 0 ? requests.map((req) => (
          <div key={req.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={cn(
                "p-3 rounded-xl",
                req.status === 'pending' ? "bg-blue-50 text-blue-600" :
                req.status === 'approved' ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
              )}>
                <ClipboardCheck size={24} />
              </div>
              <div>
                <p className="font-bold text-slate-900">
                  {req.type === 'order_edit' ? `Chỉnh sửa đơn hàng #${req.targetId.slice(-8).toUpperCase()}` : 'Yêu cầu phê duyệt'}
                </p>
                <p className="text-xs text-slate-500">Người yêu cầu: {req.requesterName} • {req.createdAt?.toDate()?.toLocaleString()}</p>
                {req.type === 'order_edit' && (
                  <div className="mt-2 text-xs text-slate-600">
                    Thay đổi giá trị: <span className="font-bold">{req.data.originalAmount?.toLocaleString()} ₫</span> → <span className="font-bold text-emerald-600">{req.data.totalAmount?.toLocaleString()} ₫</span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex gap-2">
              {req.status === 'pending' ? (
                <>
                  <button 
                    onClick={() => handleAction(req, 'rejected')}
                    className="px-4 py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-all"
                  >
                    Từ chối
                  </button>
                  <button 
                    onClick={() => handleAction(req, 'approved')}
                    className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-lg shadow-emerald-100 transition-all"
                  >
                    Phê duyệt
                  </button>
                </>
              ) : (
                <span className={cn(
                  "px-3 py-1 text-[10px] font-bold rounded-full uppercase",
                  req.status === 'approved' ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                )}>
                  {req.status === 'approved' ? 'Đã duyệt' : 'Đã từ chối'}
                </span>
              )}
            </div>
          </div>
        )) : (
          <div className="py-20 text-center text-slate-400 italic">Không có yêu cầu nào cần xử lý.</div>
        )}
      </div>
    </div>
  );
};

const Login = () => {
  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      // Check if employee exists by UID
      const empRef = doc(db, 'employees', user.uid);
      const empSnap = await getDoc(empRef);
      
      if (!empSnap.exists()) {
        // Check if employee exists by email (created by admin)
        let querySnapshot = { empty: true, docs: [] as any[] };
        if (user.email) {
          const q = query(collection(db, 'employees'), where('email', '==', user.email));
          querySnapshot = await getDocs(q);
        }
        
        if (!querySnapshot.empty) {
          // Link existing record
          const oldDoc = querySnapshot.docs[0];
          await setDoc(empRef, {
            ...oldDoc.data(),
            uid: user.uid,
            createdAt: oldDoc.data().createdAt || serverTimestamp()
          });
          // Delete old record
          await deleteDoc(oldDoc.ref);
        } else {
          // Check if this is the admin user
          const isAdminUser = user.email === 'mrtaotham@gmail.com';

          await setDoc(empRef, {
            name: user.displayName,
            email: user.email,
            role: isAdminUser ? 'admin' : 'staff',
            roleLevel: isAdminUser ? 1 : 5,
            department: 'Sales',
            companyId: '',
            branchId: '',
            departmentId: '',
            teamId: '',
            createdAt: serverTimestamp()
          });
        }
      }
    } catch (error: any) {
      console.error("Login failed:", error);
      toast.error(`Đăng nhập thất bại: ${error.message || 'Vui lòng thử lại.'}`);
    }
  };

  return (
    <div className="min-h-screen bg-emerald-600 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background patterns */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-white blur-3xl"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-white blur-3xl"></div>
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-10 relative z-10"
      >
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
            <LayoutDashboard size={40} />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Retail ERP</h1>
          <p className="text-slate-500 mt-2">Hệ thống quản lý nội bộ doanh nghiệp số</p>
        </div>

        <div className="space-y-6">
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white border-2 border-slate-100 hover:border-emerald-500 hover:bg-emerald-50 py-4 rounded-2xl font-bold text-slate-700 transition-all group"
          >
            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
            <span>Đăng nhập với Google</span>
          </button>
          
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-4 text-slate-400 font-bold">Chỉ dành cho nhân viên</span></div>
          </div>

          <p className="text-xs text-center text-slate-400 leading-relaxed">
            Bằng cách đăng nhập, bạn đồng ý với các quy định bảo mật nội bộ của công ty.
          </p>
        </div>
      </motion.div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [employeeData, setEmployeeData] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setLoading(false);
        setEmployeeData(null);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (user) {
      const unsubscribe = onSnapshot(doc(db, 'employees', user.uid), (docSnap) => {
        if (docSnap.exists()) {
          setEmployeeData({ id: docSnap.id, ...docSnap.data() });
        } else {
          setEmployeeData(null);
        }
        setLoading(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, `employees/${user.uid}`);
        setLoading(false);
      });
      return unsubscribe;
    }
  }, [user]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  if (!user || !employeeData) return <Login />;

  return (
    <ErrorBoundary>
      <EmployeeContext.Provider value={employeeData}>
        <Router>
          <div className="min-h-screen bg-slate-50 flex">
            <Toaster position="top-right" richColors />
            {/* Sidebar */}
            <aside className={cn(
              "fixed inset-y-0 left-0 z-40 w-72 bg-white border-r border-slate-200 transition-all duration-300 shadow-2xl lg:shadow-none",
              !sidebarOpen ? "-translate-x-full opacity-0" : "translate-x-0 opacity-100"
            )}>
              <div className="h-full flex flex-col p-6">
                <div className="flex items-center justify-between mb-10 px-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
                      <LayoutDashboard size={24} />
                    </div>
                    <span className="text-xl font-black text-slate-900 tracking-tighter">RETAIL ERP</span>
                  </div>
                  <button 
                    onClick={() => setSidebarOpen(false)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors lg:hidden"
                  >
                    <X size={20} />
                  </button>
                </div>

                <nav className="space-y-2 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  <SidebarItem icon={LayoutDashboard} label="Tổng quan" path="/" />
                  
                  <SidebarItem 
                    icon={Users} 
                    label="Kinh doanh" 
                    subItems={[
                      { label: "Khách hàng", path: "/crm" },
                      { label: "Đơn hàng", path: "/sales" },
                      { label: "Sản phẩm", path: "/products" }
                    ]} 
                  />

                  <SidebarItem 
                    icon={Briefcase} 
                    label="Vận hành" 
                    subItems={[
                      { label: "Nhân sự", path: "/hr" },
                      { label: "Tài sản", path: "/assets" },
                      { label: "Dự án", path: "/projects" },
                      { label: "Quy trình", path: "/workflows" }
                    ]} 
                  />

                  <SidebarItem 
                    icon={CreditCard} 
                    label="Tài chính" 
                    subItems={[
                      { label: "Tài chính", path: "/finance" },
                      { label: "Cung ứng", path: "/scm" }
                    ]} 
                  />

                  <SidebarItem 
                    icon={BarChart3} 
                    label="Báo cáo" 
                    subItems={[
                      { label: "Doanh số", path: "/reports?type=sales" },
                      { label: "Chi phí", path: "/reports?type=expenses" },
                      { label: "Chi phí và thu nhập", path: "/reports?type=pnl" },
                      { label: "Khách hàng mục tiêu", path: "/reports?type=customers" },
                      { label: "Tổng quan biểu đồ thời gian", path: "/reports?type=timeline" },
                      { label: "Kiến thức chuyên môn", path: "/reports?type=knowledge" }
                    ]} 
                  />

                  <SidebarItem 
                    icon={SettingsIcon} 
                    label="Hệ thống" 
                    subItems={[
                      { label: "Phê duyệt", path: "/approvals" },
                      { label: "Cài đặt", path: "/settings" }
                    ]} 
                  />
                </nav>

                <div className="mt-auto pt-6 border-t border-slate-100 space-y-4">
                  <div className="bg-emerald-50 rounded-2xl p-4">
                    <p className="text-xs font-bold text-emerald-700 uppercase mb-1">Hỗ trợ kỹ thuật</p>
                    <p className="text-xs text-emerald-600 leading-relaxed">Gặp sự cố? Liên hệ IT ngay qua kênh Slack nội bộ.</p>
                  </div>
                  <button 
                    onClick={() => setSidebarOpen(false)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all group hidden lg:flex"
                  >
                    <div className="p-1 rounded-lg bg-slate-100 group-hover:bg-emerald-100 transition-colors">
                      <ChevronRight size={16} className="rotate-180" />
                    </div>
                    <span className="text-sm font-bold">Thu gọn menu</span>
                  </button>
                </div>
              </div>
            </aside>

            {/* Main Content */}
            <div className={cn(
              "flex-1 flex flex-col min-w-0 transition-all duration-300",
              sidebarOpen ? "lg:pl-72" : "pl-0"
            )}>
              <Navbar 
                user={user} 
                onLogout={() => signOut(auth)} 
                sidebarOpen={sidebarOpen}
                setSidebarOpen={setSidebarOpen}
              />
              
              <main className="p-6 lg:p-10 max-w-7xl mx-auto w-full">
                <AnimatePresence mode="wait">
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/crm" element={<CRM />} />
                    <Route path="/sales" element={<Sales />} />
                    <Route path="/products" element={<Products />} />
                    <Route path="/hr" element={<HumanResources />} />
                    <Route path="/assets" element={<Assets />} />
                    <Route path="/projects" element={<Projects />} />
                    <Route path="/projects/:projectId" element={<ProjectDetails />} />
                    <Route path="/finance" element={<Finance />} />
                    <Route path="/scm" element={<SupplyChain />} />
                    <Route path="/workflows" element={<Workflows />} />
                    <Route path="/reports" element={<Reports />} />
                    <Route path="/approvals" element={<Approvals />} />
                    {employeeData?.role === 'admin' && (
                      <Route path="/settings" element={<Settings />} />
                    )}
                    <Route path="*" element={<Navigate to="/" />} />
                  </Routes>
                </AnimatePresence>
              </main>
            </div>
          </div>
        </Router>
      </EmployeeContext.Provider>
    </ErrorBoundary>
  );
}
