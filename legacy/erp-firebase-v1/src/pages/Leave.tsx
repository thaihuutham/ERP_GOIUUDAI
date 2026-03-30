import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  where, 
  addDoc, 
  updateDoc, 
  getDoc,
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
import { Calendar, Plus, Filter, Search, ChevronRight, Check, X, Clock, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const AddLeaveModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  const employeeData = useEmployee();
  const [formData, setFormData] = useState({
    type: 'annual',
    startDate: '',
    endDate: '',
    reason: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeData) return;
    setSubmitting(true);

    try {
      await addDoc(collection(db, 'leave_requests'), {
        employeeId: auth.currentUser?.uid,
        employeeName: employeeData.name,
        type: formData.type,
        startDate: formData.startDate,
        endDate: formData.endDate,
        reason: formData.reason,
        status: 'pending',
        companyId: employeeData.companyId,
        branchId: employeeData.branchId,
        departmentId: employeeData.departmentId,
        createdAt: serverTimestamp()
      });
      toast.success("Đã gửi đơn xin nghỉ phép thành công!");
      onClose();
      setFormData({ type: 'annual', startDate: '', endDate: '', reason: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'leave_requests');
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
          <h2 className="text-xl font-bold">Đơn xin nghỉ phép</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={20} /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Loại nghỉ phép</label>
            <select 
              required
              value={formData.type}
              onChange={(e) => setFormData({...formData, type: e.target.value})}
              className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
            >
              <option value="annual">Nghỉ phép năm</option>
              <option value="sick">Nghỉ ốm</option>
              <option value="unpaid">Nghỉ không lương</option>
              <option value="other">Khác</option>
            </select>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Từ ngày</label>
              <input 
                type="date"
                required
                value={formData.startDate}
                onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Đến ngày</label>
              <input 
                type="date"
                required
                value={formData.endDate}
                onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Lý do</label>
            <textarea 
              required
              rows={3}
              value={formData.reason}
              onChange={(e) => setFormData({...formData, reason: e.target.value})}
              placeholder="Nhập lý do nghỉ phép..."
              className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>
          
          <div className="pt-4">
            <button 
              type="submit"
              disabled={submitting}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-emerald-100 disabled:opacity-50"
            >
              {submitting ? "Đang gửi..." : "Gửi đơn xin nghỉ"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

const Leave = () => {
  const employeeData = useEmployee();
  const [requests, setRequests] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");

  useEffect(() => {
    if (!employeeData) return;

    const path = 'leave_requests';
    let q;
    
    if (employeeData.role === 'admin' || employeeData.role === 'manager') {
      q = query(
        collection(db, path),
        where('companyId', '==', employeeData.companyId),
        orderBy('createdAt', 'desc'),
        limit(100)
      );
    } else {
      q = query(
        collection(db, path),
        where('employeeId', '==', auth.currentUser?.uid),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRequests(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });

    return unsubscribe;
  }, [employeeData]);

  const handleApprove = async (id: string, employeeId: string, startDate: string, endDate: string, type: string) => {
    try {
      // Calculate days
      const start = new Date(startDate);
      const end = new Date(endDate);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

      await updateDoc(doc(db, 'leave_requests', id), {
        status: 'approved',
        approvedBy: auth.currentUser?.uid
      });

      // Create notification for employee
      await addDoc(collection(db, 'notifications'), {
        userId: employeeId,
        title: "Đơn nghỉ phép đã được duyệt",
        message: `Đơn nghỉ phép từ ${formatDate(startDate)} đến ${formatDate(endDate)} đã được phê duyệt.`,
        read: false,
        createdAt: serverTimestamp()
      });

      // Update leave balance if it's annual leave
      if (type === 'annual') {
        const empRef = doc(db, 'employees', employeeId);
        const empSnap = await getDoc(empRef);
        if (empSnap.exists()) {
          const currentBalance = empSnap.data().leaveBalance || 0;
          await updateDoc(empRef, {
            leaveBalance: Math.max(0, currentBalance - diffDays)
          });
        }
      }

      toast.success("Đã phê duyệt đơn nghỉ phép");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'leave_requests');
    }
  };

  const handleReject = async (id: string, employeeId: string) => {
    try {
      await updateDoc(doc(db, 'leave_requests', id), {
        status: 'rejected',
        approvedBy: auth.currentUser?.uid
      });

      // Create notification for employee
      await addDoc(collection(db, 'notifications'), {
        userId: employeeId,
        title: "Đơn nghỉ phép bị từ chối",
        message: "Đơn xin nghỉ phép của bạn không được phê duyệt.",
        read: false,
        createdAt: serverTimestamp()
      });

      toast.success("Đã từ chối đơn nghỉ phép");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'leave_requests');
    }
  };

  const filteredRequests = requests.filter(r => filterStatus === "all" || r.status === filterStatus);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const getLeaveTypeLabel = (type: string) => {
    switch(type) {
      case 'annual': return 'Nghỉ phép năm';
      case 'sick': return 'Nghỉ ốm';
      case 'unpaid': return 'Nghỉ không lương';
      default: return 'Khác';
    }
  };

  return (
    <div className="space-y-6">
      <AddLeaveModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quản lý Nghỉ phép</h1>
          <p className="text-slate-500">Đăng ký và phê duyệt đơn xin nghỉ phép.</p>
        </div>
        
        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-100 font-bold"
        >
          <Plus size={20} />
          <span>Tạo đơn xin nghỉ</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <Calendar size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Phép năm còn lại</p>
            <p className="text-xl font-bold text-slate-900">{employeeData?.leaveBalance || 12} ngày</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
            <Clock size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Đang chờ duyệt</p>
            <p className="text-xl font-bold text-slate-900">{requests.filter(r => r.status === 'pending').length}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
            <Check size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Đã phê duyệt</p>
            <p className="text-xl font-bold text-slate-900">{requests.filter(r => r.status === 'approved').length}</p>
          </div>
        </div>
      </div>

      {/* Requests List */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h3 className="font-bold text-slate-900">Danh sách đơn xin nghỉ</h3>
          <select 
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 py-2 px-4"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="pending">Đang chờ duyệt</option>
            <option value="approved">Đã phê duyệt</option>
            <option value="rejected">Đã từ chối</option>
          </select>
        </div>

        <div className="divide-y divide-slate-50">
          {loading ? (
            <div className="p-10 text-center text-slate-400 italic">Đang tải dữ liệu...</div>
          ) : filteredRequests.length > 0 ? filteredRequests.map((item) => (
            <div key={item.id} className="p-6 hover:bg-slate-50/50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                  item.status === 'pending' ? "bg-amber-50 text-amber-600" :
                  item.status === 'approved' ? "bg-emerald-50 text-emerald-600" :
                  "bg-red-50 text-red-600"
                )}>
                  {item.status === 'pending' ? <Clock size={20} /> : 
                   item.status === 'approved' ? <Check size={20} /> : <X size={20} />}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-slate-900">{item.employeeName}</span>
                    <span className="text-xs text-slate-400">•</span>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{getLeaveTypeLabel(item.type)}</span>
                  </div>
                  <p className="text-sm text-slate-600 mb-2">{item.reason}</p>
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><Calendar size={14} /> {formatDate(item.startDate)} - {formatDate(item.endDate)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {item.status === 'pending' && (employeeData?.role === 'admin' || employeeData?.role === 'manager') && (
                  <>
                    <button 
                      onClick={() => handleReject(item.id, item.employeeId)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Từ chối"
                    >
                      <X size={20} />
                    </button>
                    <button 
                      onClick={() => handleApprove(item.id, item.employeeId, item.startDate, item.endDate, item.type)}
                      className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-700 transition-colors flex items-center gap-2"
                    >
                      <Check size={16} />
                      Phê duyệt
                    </button>
                  </>
                )}
                {item.status !== 'pending' && (
                  <span className={cn(
                    "px-3 py-1 text-xs font-bold rounded-full uppercase",
                    item.status === 'approved' ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                  )}>
                    {item.status === 'approved' ? 'Đã duyệt' : 'Từ chối'}
                  </span>
                )}
              </div>
            </div>
          )) : (
            <div className="p-10 text-center text-slate-400 italic">Không tìm thấy đơn xin nghỉ nào</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Leave;
