import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, Users, Shield, Globe, Bell, 
  Database, Layout, CreditCard, Save, Plus, Trash2, 
  ChevronRight, X, Check, AlertCircle, Info, Lock,
  Mail, Smartphone, Monitor, Code, Zap, Activity
} from 'lucide-react';
import { 
  doc, getDoc, setDoc, updateDoc, collection, 
  onSnapshot, query, addDoc, deleteDoc, serverTimestamp,
  type DocumentData
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useEmployee } from '../App';
import { handleFirestoreError, OperationType } from '../utils/error-handler';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Components ---

const AddEmployeeModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  const employeeData = useEmployee();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'staff',
    department: 'Sales',
    baseSalary: 10000000,
    joinDate: new Date().toISOString().split('T')[0],
    companyId: employeeData?.companyId || '',
    branchId: employeeData?.branchId || '',
    departmentId: employeeData?.departmentId || '',
    teamId: employeeData?.teamId || ''
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const path = 'employees';
    try {
      await addDoc(collection(db, path), {
        ...formData,
        roleLevel: formData.role === 'admin' ? 1 : formData.role === 'manager' ? 2 : 5,
        leaveBalance: 12,
        status: 'active',
        createdAt: serverTimestamp()
      });
      toast.success("Đã thêm nhân viên thành công");
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
        className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl p-8 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900">Thêm nhân viên mới</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Họ và tên</label>
              <input 
                required
                type="text" 
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all"
                placeholder="Nguyễn Văn B"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email công việc</label>
              <input 
                required
                type="email" 
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all"
                placeholder="employee@company.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Vai trò</label>
              <select 
                value={formData.role}
                onChange={(e) => setFormData({...formData, role: e.target.value})}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all"
              >
                <option value="staff">Nhân viên</option>
                <option value="manager">Quản lý</option>
                <option value="admin">Quản trị viên</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Phòng ban</label>
              <select 
                value={formData.department}
                onChange={(e) => setFormData({...formData, department: e.target.value})}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all"
              >
                <option value="Sales">Kinh doanh</option>
                <option value="Support">Hỗ trợ</option>
                <option value="IT">Kỹ thuật</option>
                <option value="Marketing">Marketing</option>
                <option value="HR">Nhân sự</option>
                <option value="Finance">Tài chính</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Lương cơ bản (VND)</label>
              <input 
                required
                type="number" 
                value={formData.baseSalary}
                onChange={(e) => setFormData({...formData, baseSalary: parseInt(e.target.value)})}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Ngày gia nhập</label>
              <input 
                required
                type="date" 
                value={formData.joinDate}
                onChange={(e) => setFormData({...formData, joinDate: e.target.value})}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Công ty (ID)</label>
              <input 
                type="text" 
                value={formData.companyId}
                onChange={(e) => setFormData({...formData, companyId: e.target.value})}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all"
                placeholder="company-1"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Chi nhánh (ID)</label>
              <input 
                type="text" 
                value={formData.branchId}
                onChange={(e) => setFormData({...formData, branchId: e.target.value})}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all"
                placeholder="branch-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Phòng ban (ID)</label>
              <input 
                type="text" 
                value={formData.departmentId}
                onChange={(e) => setFormData({...formData, departmentId: e.target.value})}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all"
                placeholder="dept-1"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tổ/Nhóm (ID)</label>
              <input 
                type="text" 
                value={formData.teamId}
                onChange={(e) => setFormData({...formData, teamId: e.target.value})}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all"
                placeholder="team-1"
              />
            </div>
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
              {submitting ? "Đang xử lý..." : "Lưu nhân viên"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

const SettingSection = ({ title, description, children }: { title: string, description: string, children: React.ReactNode }) => (
  <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
    <div>
      <h3 className="text-lg font-bold text-slate-900">{title}</h3>
      <p className="text-sm text-slate-500 mt-1">{description}</p>
    </div>
    <div className="space-y-4">
      {children}
    </div>
  </div>
);

const Toggle = ({ enabled, onChange, label, ...props }: { enabled: boolean, onChange: (val: boolean) => void, label: string, [key: string]: any }) => (
  <div className="flex items-center justify-between py-2" {...props}>
    <span className="text-sm font-medium text-slate-700">{label}</span>
    <button 
      onClick={() => onChange(!enabled)}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
        enabled ? "bg-emerald-600" : "bg-slate-200"
      )}
    >
      <span className={cn(
        "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
        enabled ? "translate-x-6" : "translate-x-1"
      )} />
    </button>
  </div>
);

const Settings = () => {
  const [activeTab, setActiveTab] = useState<'general' | 'users' | 'modules' | 'data' | 'integrations' | 'security' | 'sales'>('general');
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'system', 'config'), (docSnap) => {
      if (docSnap.exists()) {
        setConfig(docSnap.data());
      } else {
        // Initialize default config if not exists
        const defaultConfig = {
          companyName: 'Digital Retail ERP Co.',
          taxCode: '0123456789',
          address: 'Tòa nhà Tech, Hà Nội',
          currency: 'VND',
          dateFormat: 'DD/MM/YYYY',
          enabledModules: ['crm', 'sales', 'hr', 'finance', 'scm', 'projects', 'assets', 'workflows'],
          customFields: {},
          orderSettings: {
            allowIncreaseWithoutApproval: true,
            requireApprovalForDecrease: true,
            approverId: ''
          },
          updatedAt: new Date().toISOString()
        };
        setDoc(doc(db, 'system', 'config'), defaultConfig);
        setConfig(defaultConfig);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleSave = async (newData: any) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'system', 'config'), {
        ...newData,
        updatedAt: new Date().toISOString()
      });
      toast.success("Đã lưu cấu hình hệ thống");
    } catch (error) {
      console.error("Save config error:", error);
      toast.error("Không thể lưu cấu hình");
    } finally {
      setSaving(false);
    }
  };

  const renderGeneral = () => (
    <div className="space-y-6">
      <SettingSection 
        title="Thông tin doanh nghiệp" 
        description="Cấu hình thông tin cơ bản hiển thị trên hóa đơn và báo cáo."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase">Tên công ty</label>
            <input 
              type="text" 
              value={config?.companyName || ''} 
              onChange={(e) => setConfig({...config, companyName: e.target.value})}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase">Mã số thuế</label>
            <input 
              type="text" 
              value={config?.taxCode || ''} 
              onChange={(e) => setConfig({...config, taxCode: e.target.value})}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
            />
          </div>
          <div className="md:col-span-2 space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase">Địa chỉ trụ sở</label>
            <input 
              type="text" 
              value={config?.address || ''} 
              onChange={(e) => setConfig({...config, address: e.target.value})}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
            />
          </div>
        </div>
      </SettingSection>

      <SettingSection 
        title="Định dạng & Ngôn ngữ" 
        description="Thiết lập hiển thị tiền tệ và ngày tháng toàn hệ thống."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase">Tiền tệ mặc định</label>
            <select 
              value={config?.currency || 'VND'} 
              onChange={(e) => setConfig({...config, currency: e.target.value})}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
            >
              <option value="VND">Việt Nam Đồng (VND)</option>
              <option value="USD">Đô la Mỹ (USD)</option>
              <option value="EUR">Euro (EUR)</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase">Định dạng ngày</label>
            <select 
              value={config?.dateFormat || 'DD/MM/YYYY'} 
              onChange={(e) => setConfig({...config, dateFormat: e.target.value})}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
            >
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </select>
          </div>
        </div>
      </SettingSection>

      <div className="flex justify-end">
        <button 
          onClick={() => handleSave(config)}
          disabled={saving}
          className="flex items-center gap-2 px-8 py-3 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all disabled:opacity-50"
        >
          <Save size={20} />
          {saving ? "Đang lưu..." : "Lưu thay đổi"}
        </button>
      </div>
    </div>
  );

  const renderModules = () => (
    <div className="space-y-6">
      <SettingSection 
        title="Quản lý phân hệ" 
        description="Bật hoặc tắt các module chức năng để tối ưu giao diện làm việc."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
          {[
            { id: 'crm', label: 'Quản lý khách hàng (CRM)', icon: Users },
            { id: 'sales', label: 'Quản lý bán hàng', icon: CreditCard },
            { id: 'hr', label: 'Quản lý nhân sự (HRM)', icon: Shield },
            { id: 'finance', label: 'Tài chính kế toán', icon: Database },
            { id: 'scm', label: 'Chuỗi cung ứng (SCM)', icon: Globe },
            { id: 'projects', label: 'Quản lý dự án', icon: Layout },
            { id: 'assets', label: 'Quản lý tài sản', icon: SettingsIcon },
            { id: 'workflows', label: 'Quy trình tự động', icon: Zap },
          ].map((mod) => (
            <Toggle 
              key={mod.id}
              label={mod.label}
              enabled={config?.enabledModules?.includes(mod.id)}
              onChange={(val) => {
                const current = config?.enabledModules || [];
                const next = val ? [...current, mod.id] : current.filter((i: string) => i !== mod.id);
                setConfig({...config, enabledModules: next});
              }}
            />
          ))}
        </div>
      </SettingSection>

      <div className="flex justify-end">
        <button 
          onClick={() => handleSave(config)}
          className="flex items-center gap-2 px-8 py-3 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-all"
        >
          <Save size={20} />
          Lưu cấu hình Module
        </button>
      </div>
    </div>
  );

  const renderIntegrations = () => (
    <div className="space-y-6">
      <SettingSection 
        title="Kết nối API & Webhooks" 
        description="Tích hợp hệ thống với các dịch vụ bên thứ ba."
      >
        <div className="space-y-4">
          <div className="p-6 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
                <Code size={24} />
              </div>
              <div>
                <p className="font-bold text-slate-900">VNPay Payment Gateway</p>
                <p className="text-xs text-slate-500">Kết nối thanh toán trực tuyến cho đơn hàng.</p>
              </div>
            </div>
            <button className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-100 transition-colors">
              Cấu hình
            </button>
          </div>

          <div className="p-6 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-orange-100 text-orange-600 rounded-xl">
                <Mail size={24} />
              </div>
              <div>
                <p className="font-bold text-slate-900">SendGrid Email API</p>
                <p className="text-xs text-slate-500">Gửi email thông báo và marketing tự động.</p>
              </div>
            </div>
            <button className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-colors">
              Kết nối ngay
            </button>
          </div>

          <div className="p-6 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-100 text-purple-600 rounded-xl">
                <Smartphone size={24} />
              </div>
              <div>
                <p className="font-bold text-slate-900">Twilio SMS Service</p>
                <p className="text-xs text-slate-500">Xác thực OTP và gửi tin nhắn chăm sóc khách hàng.</p>
              </div>
            </div>
            <button className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-colors">
              Kết nối ngay
            </button>
          </div>
        </div>
      </SettingSection>
    </div>
  );

  const renderSecurity = () => (
    <div className="space-y-6">
      <SettingSection 
        title="Bảo mật & Quyền truy cập" 
        description="Thiết lập chính sách bảo mật và theo dõi nhật ký hệ thống."
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-red-50 border border-red-100 rounded-2xl">
            <div className="flex items-center gap-3">
              <AlertCircle className="text-red-600" size={20} />
              <p className="text-sm font-medium text-red-900">Chế độ bảo trì hệ thống</p>
            </div>
            <button className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-xl hover:bg-red-700 transition-colors">
              Kích hoạt
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 bg-slate-50 border border-slate-100 rounded-2xl">
              <div className="flex items-center gap-2 mb-4">
                <Lock size={18} className="text-slate-400" />
                <h4 className="font-bold text-slate-900">Chính sách mật khẩu</h4>
              </div>
              <div className="space-y-3">
                <Toggle label="Yêu cầu ký tự đặc biệt" enabled={true} onChange={() => {}} />
                <Toggle label="Yêu cầu chữ hoa" enabled={true} onChange={() => {}} />
                <Toggle label="Đổi mật khẩu mỗi 90 ngày" enabled={false} onChange={() => {}} />
              </div>
            </div>

            <div className="p-6 bg-slate-50 border border-slate-100 rounded-2xl">
              <div className="flex items-center gap-2 mb-4">
                <Activity size={18} className="text-slate-400" />
                <h4 className="font-bold text-slate-900">Nhật ký truy cập</h4>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Admin đăng nhập từ 1.1.1.1</span>
                  <span className="text-slate-400 italic">2 phút trước</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Cập nhật cấu hình hệ thống</span>
                  <span className="text-slate-400 italic">10 phút trước</span>
                </div>
                <button className="w-full mt-4 py-2 text-xs font-bold text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all">
                  Xem tất cả nhật ký
                </button>
              </div>
            </div>
          </div>
        </div>
      </SettingSection>
    </div>
  );

  const renderUsers = () => {
    const [employees, setEmployees] = useState<DocumentData[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const employeeData = useEmployee();

    useEffect(() => {
      const unsubscribe = onSnapshot(collection(db, 'employees'), (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setEmployees(data);
      });
      return unsubscribe;
    }, []);

    return (
      <div className="space-y-6">
        <AddEmployeeModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
        <SettingSection 
          title="Quản lý người dùng" 
          description="Quản lý tài khoản nhân viên, phân quyền và vai trò truy cập hệ thống."
        >
          <div className="flex justify-end mb-4">
            <button 
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 transition-all"
            >
              <Plus size={18} />
              Thêm nhân viên
            </button>
          </div>
          <div className="space-y-3">
            {employees.map((emp) => (
              <div key={emp.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold">
                    {emp.name?.[0] || '?'}
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">{emp.name}</p>
                    <p className="text-xs text-slate-500">{emp.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={cn(
                    "px-3 py-1 text-[10px] font-bold rounded-full uppercase",
                    emp.role === 'admin' ? "bg-purple-100 text-purple-700" :
                    emp.role === 'manager' ? "bg-blue-100 text-blue-700" :
                    "bg-slate-200 text-slate-600"
                  )}>
                    {emp.role}
                  </span>
                  <button className="p-2 text-slate-400 hover:text-red-600 transition-colors">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </SettingSection>
      </div>
    );
  };

  const renderData = () => (
    <div className="space-y-6">
      <SettingSection 
        title="Trường dữ liệu tùy chỉnh" 
        description="Thêm các trường thông tin bổ sung cho các module (Khách hàng, Sản phẩm, v.v.)"
      >
        <div className="space-y-4">
          <div className="p-6 border-2 border-dashed border-slate-200 rounded-3xl text-center space-y-2">
            <Database className="mx-auto text-slate-300" size={32} />
            <p className="text-sm font-medium text-slate-600">Chưa có trường tùy chỉnh nào được định nghĩa.</p>
            <button className="text-emerald-600 text-sm font-bold hover:underline">+ Tạo trường mới</button>
          </div>
        </div>
      </SettingSection>

      <SettingSection 
        title="Cấu hình Form" 
        description="Tùy chỉnh giao diện nhập liệu cho các quy trình nghiệp vụ."
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {['Đơn bán hàng', 'Hồ sơ nhân sự', 'Phiếu nhập kho'].map((form) => (
            <div key={form} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl hover:border-emerald-200 transition-all cursor-pointer group">
              <div className="flex items-center justify-between mb-2">
                <Layout size={18} className="text-slate-400 group-hover:text-emerald-500" />
                <ChevronRight size={16} className="text-slate-300" />
              </div>
              <p className="text-sm font-bold text-slate-900">{form}</p>
              <p className="text-[10px] text-slate-500 mt-1">12 trường dữ liệu</p>
            </div>
          ))}
        </div>
      </SettingSection>
    </div>
  );

  const renderSales = () => {
    const [managers, setManagers] = useState<DocumentData[]>([]);

    useEffect(() => {
      const q = query(collection(db, 'employees'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter((emp: any) => emp.role === 'manager' || emp.role === 'admin');
        setManagers(data);
      });
      return unsubscribe;
    }, []);

    return (
      <div className="space-y-6">
        <SettingSection 
          title="Cấu hình Đơn hàng & Phê duyệt" 
          description="Thiết lập quy trình phê duyệt khi thay đổi giá trị đơn hàng."
        >
          <div className="space-y-6">
            <Toggle 
              label="Cho phép sửa đơn tăng giá trị mà không cần phê duyệt"
              enabled={config?.orderSettings?.allowIncreaseWithoutApproval}
              onChange={(val) => setConfig({
                ...config, 
                orderSettings: { ...config.orderSettings, allowIncreaseWithoutApproval: val }
              })}
            />
            
            <Toggle 
              label="Bắt buộc phê duyệt khi giảm giá trị đơn hàng"
              enabled={config?.orderSettings?.requireApprovalForDecrease}
              onChange={(val) => setConfig({
                ...config, 
                orderSettings: { ...config.orderSettings, requireApprovalForDecrease: val }
              })}
            />

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Người quản lý phê duyệt mặc định</label>
              <select 
                value={config?.orderSettings?.approverId || ''} 
                onChange={(e) => setConfig({
                  ...config, 
                  orderSettings: { ...config.orderSettings, approverId: e.target.value }
                })}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
              >
                <option value="">Chọn người quản lý</option>
                {managers.map(m => (
                  <option key={m.id} value={m.id}>{m.name} ({m.role})</option>
                ))}
              </select>
            </div>
          </div>
        </SettingSection>

        <div className="flex justify-end">
          <button 
            onClick={() => handleSave(config)}
            disabled={saving}
            className="flex items-center gap-2 px-8 py-3 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all disabled:opacity-50"
          >
            <Save size={20} />
            {saving ? "Đang lưu..." : "Lưu cấu hình bán hàng"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Cài đặt hệ thống</h1>
            <p className="text-slate-500 mt-1">Quản lý cấu hình, bảo mật và tích hợp toàn doanh nghiệp.</p>
          </div>
          <div className="p-3 bg-white rounded-2xl border border-slate-100 shadow-sm">
            <SettingsIcon className="w-8 h-8 text-emerald-600 animate-spin-slow" />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-2xl w-fit overflow-x-auto max-w-full no-scrollbar">
          {[
            { id: 'general', label: 'Cấu hình chung', icon: Globe },
            { id: 'sales', label: 'Bán hàng', icon: CreditCard },
            { id: 'users', label: 'Người dùng & Quyền', icon: Users },
            { id: 'modules', label: 'Phân hệ ERP', icon: Layout },
            { id: 'data', label: 'Dữ liệu & Form', icon: Database },
            { id: 'integrations', label: 'Tích hợp API', icon: Zap },
            { id: 'security', label: 'Bảo mật', icon: Shield },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all whitespace-nowrap",
                activeTab === tab.id 
                  ? "bg-white text-emerald-600 shadow-sm" 
                  : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
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
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'general' && renderGeneral()}
            {activeTab === 'sales' && renderSales()}
            {activeTab === 'users' && renderUsers()}
            {activeTab === 'modules' && renderModules()}
            {activeTab === 'data' && renderData()}
            {activeTab === 'integrations' && renderIntegrations()}
            {activeTab === 'security' && renderSecurity()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Settings;
