import React, { useState, useEffect } from 'react';
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
  limit,
  Timestamp
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useEmployee } from '../App';
import { toast } from 'sonner';
import { OperationType, handleFirestoreError } from '../utils/error-handler';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Clock, LogIn, LogOut, Calendar, UserCheck, Filter, Search, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const Attendance = () => {
  const employeeData = useEmployee();
  const [attendance, setAttendance] = useState<DocumentData[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  useEffect(() => {
    if (!employeeData) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const path = 'attendance';
    let q;
    
    if (employeeData.role === 'admin' || employeeData.role === 'manager') {
      // Managers see their hierarchy
      // For simplicity, we'll use companyId for now, but buildHierarchyQuery would be better
      q = query(
        collection(db, path),
        where('companyId', '==', employeeData.companyId),
        orderBy('date', 'desc'),
        limit(100)
      );
    } else {
      // Staff see only their own
      q = query(
        collection(db, path),
        where('employeeId', '==', auth.currentUser?.uid),
        orderBy('date', 'desc'),
        limit(50)
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAttendance(data);
      
      // Find today's record for current user
      const todayRecord = data.find(a => a.employeeId === auth.currentUser?.uid && a.date === todayStr);
      setTodayAttendance(todayRecord || null);
      
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });

    return unsubscribe;
  }, [employeeData]);

  const handleCheckIn = async () => {
    if (!employeeData) return;
    
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    // Check if late (after 8:30 AM)
    const lateTime = new Date();
    lateTime.setHours(8, 30, 0, 0);
    const status = now > lateTime ? 'late' : 'present';

    try {
      await addDoc(collection(db, 'attendance'), {
        employeeId: auth.currentUser?.uid,
        employeeName: employeeData.name,
        date: todayStr,
        checkIn: serverTimestamp(),
        status: status,
        companyId: employeeData.companyId,
        branchId: employeeData.branchId,
        departmentId: employeeData.departmentId,
        createdAt: serverTimestamp()
      });
      toast.success("Đã chấm công vào thành công!");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'attendance');
    }
  };

  const handleCheckOut = async () => {
    if (!todayAttendance) return;

    try {
      await updateDoc(doc(db, 'attendance', todayAttendance.id), {
        checkOut: serverTimestamp()
      });
      toast.success("Đã chấm công ra thành công!");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'attendance');
    }
  };

  const filteredAttendance = attendance.filter(a => {
    const matchesSearch = a.employeeName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || a.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '--:--';
    const d = timestamp instanceof Timestamp ? timestamp.toDate() : new Date(timestamp);
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Chấm công & Hiện diện</h1>
          <p className="text-slate-500">Theo dõi thời gian làm việc của nhân viên.</p>
        </div>
        
        <div className="flex items-center gap-3">
          {!todayAttendance ? (
            <button 
              onClick={handleCheckIn}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-100 font-bold"
            >
              <LogIn size={20} />
              <span>Chấm công VÀO</span>
            </button>
          ) : !todayAttendance.checkOut ? (
            <button 
              onClick={handleCheckOut}
              className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-amber-100 font-bold"
            >
              <LogOut size={20} />
              <span>Chấm công RA</span>
            </button>
          ) : (
            <div className="bg-slate-100 text-slate-500 px-6 py-2.5 rounded-xl flex items-center gap-2 font-bold border border-slate-200">
              <UserCheck size={20} />
              <span>Đã hoàn thành ngày công</span>
            </div>
          )}
        </div>
      </div>

      {/* Today Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
            <Clock size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Giờ vào hôm nay</p>
            <p className="text-xl font-bold text-slate-900">{formatTime(todayAttendance?.checkIn)}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
            <LogOut size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Giờ ra hôm nay</p>
            <p className="text-xl font-bold text-slate-900">{formatTime(todayAttendance?.checkOut)}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <Calendar size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Trạng thái</p>
            <p className={cn(
              "text-xl font-bold uppercase",
              todayAttendance?.status === 'present' ? "text-emerald-600" :
              todayAttendance?.status === 'late' ? "text-amber-600" :
              "text-slate-400"
            )}>
              {todayAttendance?.status === 'present' ? 'Đúng giờ' : 
               todayAttendance?.status === 'late' ? 'Đi muộn' : 'Chưa điểm danh'}
            </p>
          </div>
        </div>
      </div>

      {/* History Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h3 className="font-bold text-slate-900">Lịch sử chấm công</h3>
          
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text"
                placeholder="Tìm nhân viên..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 w-full md:w-64"
              />
            </div>
            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 py-2 px-4"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="present">Đúng giờ</option>
              <option value="late">Đi muộn</option>
              <option value="absent">Vắng mặt</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Nhân viên</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Ngày</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Giờ vào</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Giờ ra</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-400 italic">Đang tải dữ liệu...</td>
                </tr>
              ) : filteredAttendance.length > 0 ? filteredAttendance.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs uppercase">
                        {item.employeeName?.[0] || '?'}
                      </div>
                      <span className="text-sm font-bold text-slate-900">{item.employeeName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{formatDate(item.date)}</td>
                  <td className="px-6 py-4 text-sm font-mono text-slate-900">{formatTime(item.checkIn)}</td>
                  <td className="px-6 py-4 text-sm font-mono text-slate-900">{formatTime(item.checkOut)}</td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2 py-1 text-[10px] font-bold rounded-full uppercase",
                      item.status === 'present' ? "bg-emerald-50 text-emerald-600" :
                      item.status === 'late' ? "bg-amber-50 text-amber-600" :
                      "bg-red-50 text-red-600"
                    )}>
                      {item.status === 'present' ? 'Đúng giờ' : 
                       item.status === 'late' ? 'Đi muộn' : 'Vắng mặt'}
                    </span>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-400 italic">Không tìm thấy dữ liệu chấm công</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Attendance;
