import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Plus, Monitor, Package, User, Building2, MapPin } from 'lucide-react';
import { collection, query, onSnapshot, where, addDoc, updateDoc, doc, serverTimestamp, DocumentData, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useEmployee } from '../App';
import { toast } from 'sonner';
import { OperationType, handleFirestoreError } from '../utils/error-handler';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const AllocateAssetModal = ({ isOpen, onClose, asset }: { isOpen: boolean, onClose: () => void, asset: DocumentData | null }) => {
  const employeeData = useEmployee();
  const [submitting, setSubmitting] = useState(false);
  const [employees, setEmployees] = useState<DocumentData[]>([]);
  const [formData, setFormData] = useState({
    assigneeId: '',
    notes: ''
  });

  useEffect(() => {
    if (!isOpen || !employeeData) return;
    const q = query(collection(db, 'employees'), where('companyId', '==', employeeData.companyId));
    const unsub = onSnapshot(q, snap => {
      setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [isOpen, employeeData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeData || !asset || !formData.assigneeId) return;
    
    setSubmitting(true);
    try {
      const selectedEmp = employees.find(emp => emp.id === formData.assigneeId);
      
      // 1. Create allocation record
      await addDoc(collection(db, 'asset_allocations'), {
        assetId: asset.id,
        assigneeId: formData.assigneeId,
        assigneeType: 'employee',
        assigneeName: selectedEmp?.name || 'Unknown',
        allocatedDate: serverTimestamp(),
        status: 'active',
        notes: formData.notes,
        allocatedBy: auth.currentUser?.uid,
        companyId: employeeData.companyId,
        createdAt: serverTimestamp()
      });

      // 2. Update asset status
      await updateDoc(doc(db, 'assets', asset.id), {
        status: 'in_use',
        currentAssigneeId: formData.assigneeId,
        currentAssigneeType: 'employee',
        currentAssigneeName: selectedEmp?.name || 'Unknown'
      });

      toast.success("Cấp phát tài sản thành công!");
      onClose();
      setFormData({ assigneeId: '', notes: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'assets');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !asset) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-lg font-bold text-slate-900">Cấp phát tài sản</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <p className="text-sm text-slate-500 mb-4">Đang cấp phát: <span className="font-bold text-slate-900">{asset.name}</span> ({asset.code})</p>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Người nhận (Nhân viên)</label>
            <select required className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-all" value={formData.assigneeId} onChange={e => setFormData({...formData, assigneeId: e.target.value})}>
              <option value="">-- Chọn nhân viên --</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name} ({emp.email})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Ghi chú cấp phát</label>
            <textarea className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-all" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
          </div>
          <div className="pt-4 flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold transition-colors">Hủy</button>
            <button type="submit" disabled={submitting} className="flex-1 px-4 py-2 text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg font-bold transition-colors disabled:opacity-50">
              {submitting ? 'Đang xử lý...' : 'Xác nhận cấp phát'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

const ReturnAssetModal = ({ isOpen, onClose, asset }: { isOpen: boolean, onClose: () => void, asset: DocumentData | null }) => {
  const employeeData = useEmployee();
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    notes: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeData || !asset) return;
    
    setSubmitting(true);
    try {
      // Find active allocation
      const q = query(
        collection(db, 'asset_allocations'), 
        where('assetId', '==', asset.id)
      );
      const snap = await getDocs(q);
      
      const activeAllocations = snap.docs.filter(doc => doc.data().status === 'active');
      
      if (activeAllocations.length > 0) {
        const allocationDoc = activeAllocations[0];
        // 1. Update allocation record
        await updateDoc(doc(db, 'asset_allocations', allocationDoc.id), {
          status: 'returned',
          returnedDate: serverTimestamp(),
          returnNotes: formData.notes
        });
      }

      // 2. Update asset status
      await updateDoc(doc(db, 'assets', asset.id), {
        status: 'available',
        currentAssigneeId: '',
        currentAssigneeType: '',
        currentAssigneeName: ''
      });

      toast.success("Thu hồi tài sản thành công!");
      onClose();
      setFormData({ notes: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'assets');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !asset) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-lg font-bold text-slate-900">Thu hồi tài sản</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <p className="text-sm text-slate-500 mb-4">Đang thu hồi: <span className="font-bold text-slate-900">{asset.name}</span> ({asset.code})</p>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Ghi chú thu hồi (Tình trạng tài sản)</label>
            <textarea required className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-all" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
          </div>
          <div className="pt-4 flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold transition-colors">Hủy</button>
            <button type="submit" disabled={submitting} className="flex-1 px-4 py-2 text-white bg-amber-600 hover:bg-amber-700 rounded-lg font-bold transition-colors disabled:opacity-50">
              {submitting ? 'Đang xử lý...' : 'Xác nhận thu hồi'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

const AssetDetailsModal = ({ isOpen, onClose, asset }: { isOpen: boolean, onClose: () => void, asset: DocumentData | null }) => {
  const [history, setHistory] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !asset) return;
    
    setLoading(true);
    const q = query(
      collection(db, 'asset_allocations'),
      where('assetId', '==', asset.id)
    );
    
    const unsub = onSnapshot(q, snap => {
      let data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a: any, b: any) => (b.allocatedDate?.toMillis() || 0) - (a.allocatedDate?.toMillis() || 0));
      setHistory(data);
      setLoading(false);
    });

    return unsub;
  }, [isOpen, asset]);

  if (!isOpen || !asset) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Chi tiết tài sản</h2>
            <p className="text-sm text-slate-500">{asset.name} ({asset.code})</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">✕</button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1">
          <h3 className="text-sm font-bold text-slate-900 uppercase mb-4">Lịch sử cấp phát</h3>
          
          {loading ? (
            <div className="py-10 text-center text-slate-400 italic">Đang tải lịch sử...</div>
          ) : history.length > 0 ? (
            <div className="space-y-4">
              {history.map((record, idx) => (
                <div key={record.id} className="relative pl-6 pb-4 border-l-2 border-slate-100 last:border-0 last:pb-0">
                  <div className={cn(
                    "absolute left-[-9px] top-0 w-4 h-4 rounded-full border-4 border-white",
                    record.status === 'active' ? "bg-emerald-500" : "bg-slate-300"
                  )} />
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-bold text-slate-900">{record.assigneeName}</p>
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-1 rounded-full uppercase",
                        record.status === 'active' ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                      )}>
                        {record.status === 'active' ? 'Đang sử dụng' : 'Đã thu hồi'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                      <div>
                        <span className="font-medium">Ngày cấp: </span>
                        {record.allocatedDate?.toDate().toLocaleDateString('vi-VN') || 'N/A'}
                      </div>
                      {record.status === 'returned' && (
                        <div>
                          <span className="font-medium">Ngày thu hồi: </span>
                          {record.returnedDate?.toDate().toLocaleDateString('vi-VN') || 'N/A'}
                        </div>
                      )}
                    </div>
                    {record.notes && (
                      <p className="text-xs text-slate-600 mt-2 bg-white p-2 rounded border border-slate-100">
                        <span className="font-medium">Ghi chú cấp:</span> {record.notes}
                      </p>
                    )}
                    {record.returnNotes && (
                      <p className="text-xs text-slate-600 mt-2 bg-white p-2 rounded border border-slate-100">
                        <span className="font-medium">Ghi chú thu hồi:</span> {record.returnNotes}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-10 text-center text-slate-400">
              <p>Chưa có lịch sử cấp phát nào.</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

const AddAssetModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  const employeeData = useEmployee();
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    category: 'computer',
    purchasePrice: 0,
    status: 'available',
    notes: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeData) return;
    
    setSubmitting(true);
    const path = 'assets';
    try {
      await addDoc(collection(db, path), {
        ...formData,
        purchasePrice: Number(formData.purchasePrice),
        companyId: employeeData.companyId,
        branchId: employeeData.branchId,
        departmentId: employeeData.departmentId,
        createdAt: serverTimestamp()
      });
      toast.success("Thêm tài sản thành công!");
      onClose();
      setFormData({ name: '', code: '', category: 'computer', purchasePrice: 0, status: 'available', notes: '' });
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
        className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-lg font-bold text-slate-900">Thêm tài sản mới</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Tên tài sản</label>
            <input required type="text" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-all" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Mã tài sản</label>
            <input required type="text" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-all" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Danh mục</label>
              <select className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-all" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                <option value="computer">Máy tính</option>
                <option value="furniture">Nội thất</option>
                <option value="vehicle">Phương tiện</option>
                <option value="other">Khác</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Trạng thái</label>
              <select className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-all" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                <option value="available">Sẵn sàng</option>
                <option value="in_use">Đang sử dụng</option>
                <option value="maintenance">Bảo trì</option>
                <option value="retired">Đã thanh lý</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Giá trị (VNĐ)</label>
            <input required type="number" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-all" value={formData.purchasePrice} onChange={e => setFormData({...formData, purchasePrice: Number(e.target.value)})} />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Ghi chú</label>
            <textarea className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none transition-all" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
          </div>
          <div className="pt-4 flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold transition-colors">Hủy</button>
            <button type="submit" disabled={submitting} className="flex-1 px-4 py-2 text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg font-bold transition-colors disabled:opacity-50">
              {submitting ? 'Đang lưu...' : 'Lưu tài sản'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export const Assets = () => {
  const employeeData = useEmployee();
  const [assets, setAssets] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [allocateAsset, setAllocateAsset] = useState<DocumentData | null>(null);
  const [returnAsset, setReturnAsset] = useState<DocumentData | null>(null);
  const [detailsAsset, setDetailsAsset] = useState<DocumentData | null>(null);

  useEffect(() => {
    const path = 'assets';
    const q = employeeData?.role === 'admin' 
      ? query(collection(db, path))
      : query(collection(db, path), where('companyId', '==', employeeData?.companyId || ''));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a: any, b: any) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setAssets(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });

    return unsubscribe;
  }, [employeeData]);

  const filteredAssets = assets.filter(a => 
    a.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <AddAssetModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
      <AllocateAssetModal isOpen={!!allocateAsset} onClose={() => setAllocateAsset(null)} asset={allocateAsset} />
      <ReturnAssetModal isOpen={!!returnAsset} onClose={() => setReturnAsset(null)} asset={returnAsset} />
      <AssetDetailsModal isOpen={!!detailsAsset} onClose={() => setDetailsAsset(null)} asset={detailsAsset} />
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quản lý tài sản</h1>
          <p className="text-slate-500">Danh sách tài sản công ty và cấp phát.</p>
        </div>
        {(employeeData?.role === 'admin' || employeeData?.role === 'manager') && (
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-md shadow-emerald-100"
          >
            <Plus size={20} />
            <span>Thêm tài sản</span>
          </button>
        )}
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm mb-6">
        <div className="relative max-w-md w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Tìm kiếm tài sản..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-20 text-center text-slate-400 italic">Đang tải tài sản...</div>
        ) : filteredAssets.length > 0 ? filteredAssets.map((asset, i) => (
          <motion.div 
            key={asset.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group"
          >
            <div className="flex justify-between items-start mb-4">
              <div className={cn("p-3 rounded-xl", asset.category === "computer" ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600")}>
                <Monitor size={24} />
              </div>
              <span className={cn("text-[10px] font-bold px-2 py-1 rounded-full uppercase", 
                asset.status === "available" ? "bg-emerald-50 text-emerald-600" : 
                asset.status === "in_use" ? "bg-amber-50 text-amber-600" :
                "bg-slate-100 text-slate-500"
              )}>
                {asset.status === 'available' ? 'Sẵn sàng' : asset.status === 'in_use' ? 'Đang dùng' : asset.status}
              </span>
            </div>
            <h3 className="font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">{asset.name}</h3>
            <p className="text-xs text-slate-500 mt-1">Mã: {asset.code}</p>
            
            <div className="mt-6 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 font-medium">Giá trị</p>
                <p className="text-lg font-bold text-slate-900">{asset.purchasePrice?.toLocaleString() || 0} ₫</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400 font-medium">Người dùng</p>
                <p className="text-sm font-bold text-slate-700 truncate max-w-[120px]" title={asset.currentAssigneeName || 'Trống'}>
                  {asset.currentAssigneeName || 'Trống'}
                </p>
              </div>
            </div>
            
            <div className="mt-6 pt-4 border-t border-slate-50 flex gap-2">
              <button 
                onClick={() => setDetailsAsset(asset)}
                className="flex-1 py-2 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Chi tiết
              </button>
              {(employeeData?.role === 'admin' || employeeData?.role === 'manager') && (
                <>
                  {asset.status === 'available' ? (
                    <button 
                      onClick={() => setAllocateAsset(asset)}
                      className="flex-1 py-2 text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                    >
                      Cấp phát
                    </button>
                  ) : asset.status === 'in_use' ? (
                    <button 
                      onClick={() => setReturnAsset(asset)}
                      className="flex-1 py-2 text-xs font-bold text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors"
                    >
                      Thu hồi
                    </button>
                  ) : (
                    <button disabled className="flex-1 py-2 text-xs font-bold text-slate-400 bg-slate-50 rounded-lg">Không khả dụng</button>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )) : (
          <div className="col-span-full py-20 text-center text-slate-400">
            <Monitor size={48} className="mx-auto mb-4 opacity-20" />
            <p>Không tìm thấy tài sản nào</p>
          </div>
        )}
      </div>
    </div>
  );
};
