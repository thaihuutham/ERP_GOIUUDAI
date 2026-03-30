import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  UserCheck, 
  Calendar, 
  DollarSign, 
  Briefcase, 
  GraduationCap, 
  TrendingUp, 
  Heart, 
  Plus, 
  Search, 
  Filter, 
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Download,
  FileText,
  UserPlus,
  Target,
  Award,
  ShieldCheck,
  MoreVertical,
  Mail,
  Phone,
  MapPin
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
  orderBy,
  limit,
  getDocs,
  Timestamp
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useEmployee } from '../App';
import { toast } from 'sonner';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import Attendance from './Attendance';
import Leave from './Leave';
import Payroll from './Payroll';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Sub-components for HR Sections ---

const EmployeeList = ({ companyId }: { companyId: string }) => {
  const [employees, setEmployees] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const q = query(collection(db, 'employees'), where('companyId', '==', companyId));
    const unsub = onSnapshot(q, snap => {
      setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [companyId]);

  const filteredEmployees = employees.filter(emp => 
    emp.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.role?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Tìm kiếm nhân viên..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-md shadow-indigo-100">
          <UserPlus size={18} />
          <span>Thêm nhân viên</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-10 text-center text-slate-400 italic">Đang tải dữ liệu...</div>
        ) : filteredEmployees.length > 0 ? filteredEmployees.map(emp => (
          <div key={emp.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-xl border-2 border-white shadow-sm">
                  {emp.name?.[0]}
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{emp.name}</h4>
                  <p className="text-xs text-slate-500 font-medium">{emp.role} • {emp.department}</p>
                </div>
              </div>
              <button className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors">
                <MoreVertical size={18} />
              </button>
            </div>
            
            <div className="space-y-2 mb-6">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Mail size={14} className="text-slate-400" />
                <span>{emp.email}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Phone size={14} className="text-slate-400" />
                <span>{emp.phone || 'Chưa cập nhật'}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-50">
              <span className={cn(
                "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                emp.status === 'active' ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"
              )}>
                {emp.status === 'active' ? 'Đang làm việc' : 'Nghỉ việc'}
              </span>
              <button className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1">
                Chi tiết <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )) : (
          <div className="col-span-full py-10 text-center text-slate-400">Không tìm thấy nhân viên nào.</div>
        )}
      </div>
    </div>
  );
};

const Recruitment = ({ companyId }: { companyId: string }) => {
  const [jobs, setJobs] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'recruitment'), where('companyId', '==', companyId));
    const unsub = onSnapshot(q, snap => {
      setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [companyId]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-slate-900">Quản lý tuyển dụng</h3>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
          <Plus size={18} />
          <span>Đăng tin tuyển dụng</span>
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {loading ? (
          <div className="col-span-full py-10 text-center text-slate-400 italic">Đang tải dữ liệu...</div>
        ) : jobs.length > 0 ? jobs.map(job => (
          <div key={job.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h4 className="font-bold text-slate-900">{job.jobTitle}</h4>
                <p className="text-xs text-slate-500">{job.department}</p>
              </div>
              <span className={cn(
                "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                job.status === 'open' ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"
              )}>
                {job.status === 'open' ? 'Đang mở' : 'Đã đóng'}
              </span>
            </div>
            
            <div className="flex items-center gap-6 mb-6">
              <div className="text-center">
                <p className="text-lg font-black text-slate-900">{job.candidates?.length || 0}</p>
                <p className="text-[10px] text-slate-400 uppercase font-bold">Ứng viên</p>
              </div>
              <div className="text-center border-l border-slate-100 pl-6">
                <p className="text-lg font-black text-indigo-600">{job.candidates?.filter((c: any) => c.status === 'interviewing').length || 0}</p>
                <p className="text-[10px] text-slate-400 uppercase font-bold">Phỏng vấn</p>
              </div>
            </div>

            <button className="w-full py-2 text-sm font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-indigo-100">
              Xem danh sách ứng viên
            </button>
          </div>
        )) : (
          <div className="col-span-full py-10 text-center text-slate-400">Chưa có tin tuyển dụng nào.</div>
        )}
      </div>
    </div>
  );
};

const TrainingAndPerformance = ({ companyId }: { companyId: string }) => {
  const [trainings, setTrainings] = useState<DocumentData[]>([]);
  const [performances, setPerformances] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const qT = query(collection(db, 'training'), where('companyId', '==', companyId));
    const qP = query(collection(db, 'performance'), where('companyId', '==', companyId));
    
    const unsubT = onSnapshot(qT, snap => setTrainings(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubP = onSnapshot(qP, snap => {
      setPerformances(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    
    return () => { unsubT(); unsubP(); };
  }, [companyId]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <GraduationCap size={20} className="text-indigo-600" />
          Đào tạo & Phát triển
        </h3>
        <div className="space-y-4">
          {trainings.length > 0 ? trainings.map(t => (
            <div key={t.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <h4 className="font-bold text-slate-900 text-sm">{t.title}</h4>
                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase">{t.status}</span>
              </div>
              <p className="text-xs text-slate-500 mb-4">{t.description}</p>
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase">
                <span>{t.startDate} - {t.endDate}</span>
                <span>{t.participants?.length || 0} Nhân viên</span>
              </div>
            </div>
          )) : (
            <div className="bg-white p-10 rounded-2xl border border-slate-100 text-center text-slate-400 text-sm italic">
              Chưa có chương trình đào tạo nào.
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Target size={20} className="text-rose-600" />
          Đánh giá hiệu suất (KPI)
        </h3>
        <div className="space-y-4">
          {performances.length > 0 ? performances.map(p => (
            <div key={p.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Kỳ đánh giá: {p.period}</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Nhân viên ID: {p.employeeId}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-rose-600">{p.score}/100</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">{p.status}</p>
                </div>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div className="bg-rose-500 h-full" style={{ width: `${p.score}%` }}></div>
              </div>
            </div>
          )) : (
            <div className="bg-white p-10 rounded-2xl border border-slate-100 text-center text-slate-400 text-sm italic">
              Chưa có dữ liệu đánh giá hiệu suất.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Benefits = ({ companyId }: { companyId: string }) => {
  const [benefits, setBenefits] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'benefits'), where('companyId', '==', companyId));
    const unsub = onSnapshot(q, snap => {
      setBenefits(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [companyId]);

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-slate-900">Quản lý phúc lợi & Bảo hiểm</h3>
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Nhân viên</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Loại phúc lợi</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Mức đóng/Hưởng</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Ngày bắt đầu</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center">Trạng thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400 italic">Đang tải dữ liệu...</td></tr>
            ) : benefits.length > 0 ? benefits.map(b => (
              <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4 text-sm font-bold text-slate-900">{b.employeeId}</td>
                <td className="px-6 py-4 text-sm text-slate-600 capitalize">{b.type.replace('_', ' ')}</td>
                <td className="px-6 py-4 text-sm font-bold text-slate-900">{b.amount?.toLocaleString()} ₫</td>
                <td className="px-6 py-4 text-sm text-slate-500">{b.startDate}</td>
                <td className="px-6 py-4 text-center">
                  <span className={cn(
                    "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                    b.status === 'active' ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"
                  )}>
                    {b.status === 'active' ? 'Hiệu lực' : 'Hết hạn'}
                  </span>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400">Chưa có dữ liệu phúc lợi.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- Main Human Resources Component ---

export const HumanResources = () => {
  const employeeData = useEmployee();
  const [activeTab, setActiveTab] = useState<'overview' | 'employees' | 'recruitment' | 'attendance' | 'payroll' | 'leave' | 'training' | 'benefits'>('overview');

  if (!employeeData) return null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Quản trị nhân sự (HRM)</h1>
          <p className="text-slate-500 text-sm">Quản lý toàn diện vòng đời nhân viên từ tuyển dụng đến phát triển.</p>
        </div>
        <div className="flex gap-2">
          <button className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-slate-50 transition-all">
            <Download size={18} />
            <span>Báo cáo HR</span>
          </button>
          <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-md shadow-indigo-100">
            <UserPlus size={18} />
            <span>Tuyển dụng mới</span>
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600">
              <Users size={24} />
            </div>
          </div>
          <h3 className="text-sm font-medium text-slate-500">Tổng nhân sự</h3>
          <p className="text-2xl font-black text-slate-900 mt-1">128</p>
          <p className="text-xs text-emerald-600 mt-1 font-bold">+4 trong tháng này</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
              <Briefcase size={24} />
            </div>
          </div>
          <h3 className="text-sm font-medium text-slate-500">Vị trí đang tuyển</h3>
          <p className="text-2xl font-black text-slate-900 mt-1">12</p>
          <p className="text-xs text-slate-400 mt-1">45 hồ sơ mới</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600">
              <UserCheck size={24} />
            </div>
          </div>
          <h3 className="text-sm font-medium text-slate-500">Tỷ lệ đi làm</h3>
          <p className="text-2xl font-black text-slate-900 mt-1">96.5%</p>
          <p className="text-xs text-emerald-600 mt-1 font-bold">Rất tốt</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 rounded-xl bg-rose-50 text-rose-600">
              <Heart size={24} />
            </div>
          </div>
          <h3 className="text-sm font-medium text-slate-500">Phúc lợi tháng</h3>
          <p className="text-2xl font-black text-slate-900 mt-1">450M</p>
          <p className="text-xs text-slate-400 mt-1">Bao gồm bảo hiểm & thưởng</p>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide border-b border-slate-100">
        <button 
          onClick={() => setActiveTab('overview')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap",
            activeTab === 'overview' ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" : "text-slate-600 hover:bg-slate-100"
          )}
        >
          <TrendingUp size={18} />
          <span>Tổng quan</span>
        </button>
        <button 
          onClick={() => setActiveTab('employees')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap",
            activeTab === 'employees' ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" : "text-slate-600 hover:bg-slate-100"
          )}
        >
          <Users size={18} />
          <span>Hồ sơ nhân viên</span>
        </button>
        <button 
          onClick={() => setActiveTab('recruitment')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap",
            activeTab === 'recruitment' ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" : "text-slate-600 hover:bg-slate-100"
          )}
        >
          <Briefcase size={18} />
          <span>Tuyển dụng</span>
        </button>
        <button 
          onClick={() => setActiveTab('attendance')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap",
            activeTab === 'attendance' ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" : "text-slate-600 hover:bg-slate-100"
          )}
        >
          <UserCheck size={18} />
          <span>Chấm công</span>
        </button>
        <button 
          onClick={() => setActiveTab('payroll')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap",
            activeTab === 'payroll' ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" : "text-slate-600 hover:bg-slate-100"
          )}
        >
          <DollarSign size={18} />
          <span>Tiền lương</span>
        </button>
        <button 
          onClick={() => setActiveTab('leave')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap",
            activeTab === 'leave' ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" : "text-slate-600 hover:bg-slate-100"
          )}
        >
          <Calendar size={18} />
          <span>Nghỉ phép</span>
        </button>
        <button 
          onClick={() => setActiveTab('training')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap",
            activeTab === 'training' ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" : "text-slate-600 hover:bg-slate-100"
          )}
        >
          <GraduationCap size={18} />
          <span>Đào tạo & Đánh giá</span>
        </button>
        <button 
          onClick={() => setActiveTab('benefits')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap",
            activeTab === 'benefits' ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" : "text-slate-600 hover:bg-slate-100"
          )}
        >
          <Heart size={18} />
          <span>Phúc lợi</span>
        </button>
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
                <h3 className="text-lg font-bold text-slate-900 mb-6">Biến động nhân sự</h3>
                <div className="h-64 flex items-end justify-between gap-2 px-4">
                  {[45, 52, 48, 61, 55, 67, 72, 68, 75, 82, 78, 85].map((val, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-2">
                      <div 
                        className="w-full bg-indigo-100 rounded-t-lg hover:bg-indigo-500 transition-all cursor-pointer relative group"
                        style={{ height: `${val}%` }}
                      >
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                          {val} nhân viên
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase">T{i+1}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 mb-6">Thông báo nội bộ</h3>
                <div className="space-y-4">
                  {[
                    { title: 'Cập nhật chính sách bảo hiểm mới 2024', time: '1 ngày trước', icon: ShieldCheck, color: 'text-emerald-600' },
                    { title: 'Lịch đào tạo kỹ năng mềm tháng 4', time: '2 ngày trước', icon: GraduationCap, color: 'text-indigo-600' },
                    { title: 'Chúc mừng sinh nhật 5 nhân viên trong tuần', time: '3 ngày trước', icon: Award, color: 'text-rose-600' }
                  ].map((n, i) => (
                    <div key={i} className="flex items-center gap-4 p-4 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer">
                      <div className={cn("p-2 rounded-lg bg-slate-100", n.color)}>
                        <n.icon size={20} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-900">{n.title}</p>
                        <p className="text-xs text-slate-500">{n.time}</p>
                      </div>
                      <ChevronRight size={16} className="text-slate-300" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 mb-6">Cơ cấu phòng ban</h3>
                <div className="space-y-4">
                  {[
                    { label: 'Kinh doanh', value: 45, color: 'bg-indigo-500' },
                    { label: 'Kỹ thuật', value: 32, color: 'bg-blue-500' },
                    { label: 'Marketing', value: 25, color: 'bg-emerald-500' },
                    { label: 'Hành chính', value: 15, color: 'bg-amber-500' },
                    { label: 'Khác', value: 11, color: 'bg-slate-400' }
                  ].map((d, i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-slate-600">{d.label}</span>
                        <span className="text-slate-900">{d.value}</span>
                      </div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div className={cn("h-full", d.color)} style={{ width: `${(d.value / 128) * 100}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'employees' && <EmployeeList companyId={employeeData.companyId} />}
        {activeTab === 'recruitment' && <Recruitment companyId={employeeData.companyId} />}
        {activeTab === 'attendance' && <Attendance />}
        {activeTab === 'payroll' && <Payroll />}
        {activeTab === 'leave' && <Leave />}
        {activeTab === 'training' && <TrainingAndPerformance companyId={employeeData.companyId} />}
        {activeTab === 'benefits' && <Benefits companyId={employeeData.companyId} />}
      </motion.div>
    </div>
  );
};
