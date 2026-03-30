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
import { DollarSign, FileText, Filter, Search, ChevronRight, Check, X, Clock, AlertCircle, Download, CreditCard, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const GeneratePayrollModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  const employeeData = useEmployee();
  const [formData, setFormData] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear()
  });
  const [submitting, setSubmitting] = useState(false);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeData) return;
    setSubmitting(true);

    try {
      // 1. Fetch all employees in the hierarchy
      const employeesQuery = query(
        collection(db, 'employees'),
        where('companyId', '==', employeeData.companyId)
      );
      const employeesSnap = await getDocs(employeesQuery);
      const employees = employeesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // 2. Fetch attendance for the month
      const startOfMonth = new Date(formData.year, formData.month - 1, 1).toISOString().split('T')[0];
      const endOfMonth = new Date(formData.year, formData.month, 0).toISOString().split('T')[0];
      
      const attendanceQuery = query(
        collection(db, 'attendance'),
        where('companyId', '==', employeeData.companyId),
        where('date', '>=', startOfMonth),
        where('date', '<=', endOfMonth)
      );
      const attendanceSnap = await getDocs(attendanceQuery);
      const attendanceData = attendanceSnap.docs.map(doc => doc.data());

      // 3. Fetch approved leave requests for the month
      const leaveQuery = query(
        collection(db, 'leave_requests'),
        where('companyId', '==', employeeData.companyId),
        where('status', '==', 'approved')
      );
      const leaveSnap = await getDocs(leaveQuery);
      const leaveData = leaveSnap.docs.map(doc => doc.data());

      // 4. For each employee, create a payroll record
      const payrollPromises = employees.map(async (emp: any) => {
        const empAttendance = attendanceData.filter(a => a.employeeId === emp.id);
        const empLeave = leaveData.filter(l => l.employeeId === emp.id);

        const workingDays = empAttendance.filter(a => a.status === 'present' || a.status === 'late').length;
        const lateDays = empAttendance.filter(a => a.status === 'late').length;
        
        // Basic calculation: (Base Salary / 22 working days) * actual working days
        const baseSalary = emp.baseSalary || 10000000;
        const dailyRate = baseSalary / 22;
        
        // Deductions for lateness (e.g., 50k per late day)
        const lateDeduction = lateDays * 50000;
        
        // Unpaid leave deduction
        const unpaidLeaveDays = empLeave
          .filter(l => l.type === 'unpaid')
          .reduce((acc, l) => {
            const start = new Date(l.startDate);
            const end = new Date(l.endDate);
            const diff = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            return acc + diff;
          }, 0);
        const unpaidDeduction = unpaidLeaveDays * dailyRate;

        const allowances = 1000000; // Fixed allowance for now
        const deductions = lateDeduction + unpaidDeduction + 500000; // Fixed insurance 500k
        const netSalary = Math.max(0, (dailyRate * workingDays) + allowances - deductions);

        return addDoc(collection(db, 'payrolls'), {
          employeeId: emp.id,
          employeeName: emp.name,
          month: formData.month,
          year: formData.year,
          baseSalary,
          workingDays,
          lateDays,
          unpaidLeaveDays,
          allowances,
          deductions,
          netSalary,
          status: 'draft',
          companyId: employeeData.companyId,
          branchId: emp.branchId,
          departmentId: emp.departmentId,
          createdAt: serverTimestamp()
        });
      });

      await Promise.all(payrollPromises);
      toast.success(`Đã tạo bảng lương tháng ${formData.month}/${formData.year} thành công!`);
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'payrolls');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-emerald-600 text-white">
          <h2 className="text-xl font-bold">Tạo bảng lương tháng</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={20} /></button>
        </div>
        
        <form onSubmit={handleGenerate} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Tháng</label>
              <select 
                value={formData.month}
                onChange={(e) => setFormData({...formData, month: parseInt(e.target.value)})}
                className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
              >
                {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>Tháng {m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Năm</label>
              <select 
                value={formData.year}
                onChange={(e) => setFormData({...formData, year: parseInt(e.target.value)})}
                className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
              >
                {[2024, 2025, 2026].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 flex items-start gap-3">
            <AlertCircle className="text-emerald-600 shrink-0" size={20} />
            <p className="text-xs text-emerald-700 leading-relaxed">
              Hệ thống sẽ tự động tính toán lương dựa trên mức lương cơ bản, phụ cấp và các khoản giảm trừ của nhân viên.
            </p>
          </div>
          
          <div className="pt-4">
            <button 
              type="submit"
              disabled={submitting}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-emerald-100 disabled:opacity-50"
            >
              {submitting ? "Đang xử lý..." : "Tạo bảng lương"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

const Payroll = () => {
  const employeeData = useEmployee();
  const [payrolls, setPayrolls] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());

  useEffect(() => {
    if (!employeeData) return;

    const path = 'payrolls';
    let q;
    
    if (employeeData.role === 'admin' || employeeData.role === 'manager') {
      q = query(
        collection(db, path),
        where('companyId', '==', employeeData.companyId),
        where('month', '==', filterMonth),
        where('year', '==', filterYear),
        orderBy('createdAt', 'desc')
      );
    } else {
      q = query(
        collection(db, path),
        where('employeeId', '==', auth.currentUser?.uid),
        orderBy('createdAt', 'desc')
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPayrolls(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });

    return unsubscribe;
  }, [employeeData, filterMonth, filterYear]);

  const handlePay = async (id: string) => {
    try {
      await updateDoc(doc(db, 'payrolls', id), {
        status: 'paid',
        paidAt: serverTimestamp()
      });
      toast.success("Đã xác nhận thanh toán lương");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'payrolls');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  return (
    <div className="space-y-6">
      <GeneratePayrollModal isOpen={isGenerateModalOpen} onClose={() => setIsGenerateModalOpen(false)} />
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quản lý Tiền lương</h1>
          <p className="text-slate-500">Tính toán và chi trả lương cho nhân viên.</p>
        </div>
        
        {(employeeData?.role === 'admin' || employeeData?.role === 'manager') && (
          <button 
            onClick={() => setIsGenerateModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-100 font-bold"
          >
            <Plus size={20} />
            <span>Tạo bảng lương</span>
          </button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter size={18} className="text-slate-400" />
          <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">Bộ lọc:</span>
        </div>
        <select 
          value={filterMonth}
          onChange={(e) => setFilterMonth(parseInt(e.target.value))}
          className="bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 py-2 px-4"
        >
          {Array.from({length: 12}, (_, i) => i + 1).map(m => (
            <option key={m} value={m}>Tháng {m}</option>
          ))}
        </select>
        <select 
          value={filterYear}
          onChange={(e) => setFilterYear(parseInt(e.target.value))}
          className="bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 py-2 px-4"
        >
          {[2024, 2025, 2026].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Payroll List */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Nhân viên</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Kỳ lương</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Lương thực nhận</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Trạng thái</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-400 italic">Đang tải dữ liệu...</td>
                </tr>
              ) : payrolls.length > 0 ? payrolls.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs uppercase">
                        {item.employeeName?.[0] || '?'}
                      </div>
                      <span className="text-sm font-bold text-slate-900">{item.employeeName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">Tháng {item.month}/{item.year}</td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-900 text-right">{formatCurrency(item.netSalary)}</td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2 py-1 text-[10px] font-bold rounded-full uppercase",
                      item.status === 'paid' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                    )}>
                      {item.status === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-2 text-slate-400 hover:text-emerald-600" title="Tải phiếu lương">
                        <Download size={18} />
                      </button>
                      {item.status === 'draft' && (employeeData?.role === 'admin' || employeeData?.role === 'manager') && (
                        <button 
                          onClick={() => handlePay(item.id)}
                          className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors flex items-center gap-1"
                        >
                          <CreditCard size={14} />
                          Thanh toán
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-400 italic">Không tìm thấy dữ liệu lương</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Payroll;
