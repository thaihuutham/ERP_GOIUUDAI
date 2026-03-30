import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  GitBranch, 
  Plus, 
  Settings, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  ChevronRight, 
  Filter,
  Search,
  MoreVertical,
  Play,
  History,
  User,
  Shield,
  ArrowRight,
  Layers,
  Activity
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
  orderBy 
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useEmployee } from '../App';
import { toast } from 'sonner';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const WorkflowCard: React.FC<{ workflow: DocumentData }> = ({ workflow }) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
    <div className="flex justify-between items-start mb-4">
      <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600">
        <GitBranch size={24} />
      </div>
      <span className={cn(
        "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
        workflow.isActive ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"
      )}>
        {workflow.isActive ? 'Đang hoạt động' : 'Tạm dừng'}
      </span>
    </div>
    <h3 className="font-bold text-slate-900 mb-1">{workflow.name}</h3>
    <p className="text-xs text-slate-500 mb-4 line-clamp-2">{workflow.description}</p>
    
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Layers size={14} />
        <span>Đối tượng: <span className="text-slate-600 font-medium">{workflow.targetEntity}</span></span>
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Activity size={14} />
        <span>Số bước: <span className="text-slate-600 font-medium">{workflow.steps?.length || 0}</span></span>
      </div>
    </div>

    <div className="mt-6 pt-4 border-t border-slate-50 flex items-center justify-between">
      <button className="text-xs font-bold text-indigo-600 hover:underline">Chỉnh sửa quy trình</button>
      <div className="flex -space-x-2">
        {workflow.steps?.map((step: any, i: number) => (
          <div key={i} className="w-6 h-6 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[8px] font-bold text-slate-500" title={step.label}>
            {i + 1}
          </div>
        ))}
      </div>
    </div>
  </div>
);

const InstanceRow: React.FC<{ instance: DocumentData, workflowName: string }> = ({ instance, workflowName }) => (
  <tr className="hover:bg-slate-50/50 transition-colors">
    <td className="px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-slate-100 text-slate-500">
          <History size={16} />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">{workflowName}</p>
          <p className="text-[10px] text-slate-400">ID: {instance.entityId}</p>
        </div>
      </div>
    </td>
    <td className="px-6 py-4">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-bold">
          {instance.currentStepOrder}
        </div>
        <span className="text-sm text-slate-600">Bước {instance.currentStepOrder}</span>
      </div>
    </td>
    <td className="px-6 py-4">
      <span className={cn(
        "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
        instance.status === 'approved' ? "bg-emerald-50 text-emerald-600" :
        instance.status === 'rejected' ? "bg-rose-50 text-rose-600" :
        instance.status === 'in_progress' ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"
      )}>
        {instance.status === 'approved' ? 'Hoàn thành' : 
         instance.status === 'rejected' ? 'Từ chối' : 
         instance.status === 'in_progress' ? 'Đang xử lý' : 'Chờ duyệt'}
      </span>
    </td>
    <td className="px-6 py-4 text-xs text-slate-500">
      {instance.createdAt?.toDate ? instance.createdAt.toDate().toLocaleDateString() : 'N/A'}
    </td>
    <td className="px-6 py-4 text-right">
      <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors">
        <ChevronRight size={18} />
      </button>
    </td>
  </tr>
);

export const Workflows = () => {
  const employeeData = useEmployee();
  const [workflows, setWorkflows] = useState<DocumentData[]>([]);
  const [instances, setInstances] = useState<DocumentData[]>([]);
  const [activeTab, setActiveTab] = useState<'definitions' | 'instances'>('definitions');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employeeData?.companyId) return;

    const qDef = query(collection(db, 'workflow_definitions'), where('companyId', '==', employeeData.companyId));
    const qInst = query(collection(db, 'workflow_instances'), where('companyId', '==', employeeData.companyId), orderBy('createdAt', 'desc'));

    const unsubDef = onSnapshot(qDef, snap => {
      setWorkflows(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubInst = onSnapshot(qInst, snap => {
      setInstances(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return () => { unsubDef(); unsubInst(); };
  }, [employeeData?.companyId]);

  const getWorkflowName = (id: string) => {
    return workflows.find(w => w.id === id)?.name || 'Quy trình không xác định';
  };

  if (!employeeData) return null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Thiết lập quy trình (Workflows)</h1>
          <p className="text-slate-500 text-sm">Tự động hóa và chuẩn hóa các bước phê duyệt trong doanh nghiệp.</p>
        </div>
        <div className="flex gap-2">
          <button className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-slate-50 transition-all">
            <Settings size={18} />
            <span>Cấu hình chung</span>
          </button>
          <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-md shadow-indigo-100">
            <Plus size={18} />
            <span>Tạo quy trình mới</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-slate-100 pb-px">
        <button 
          onClick={() => setActiveTab('definitions')}
          className={cn(
            "pb-4 text-sm font-bold transition-all relative",
            activeTab === 'definitions' ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"
          )}
        >
          Danh sách quy trình
          {activeTab === 'definitions' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />}
        </button>
        <button 
          onClick={() => setActiveTab('instances')}
          className={cn(
            "pb-4 text-sm font-bold transition-all relative",
            activeTab === 'instances' ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"
          )}
        >
          Tiến độ thực tế
          {activeTab === 'instances' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />}
        </button>
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
          {activeTab === 'definitions' ? (
            <div className="space-y-6">
              <div className="flex flex-wrap gap-4 items-center justify-between">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="Tìm kiếm quy trình..." 
                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 transition-all">
                    <Filter size={18} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {workflows.length > 0 ? workflows.map(workflow => (
                  <WorkflowCard key={workflow.id} workflow={workflow} />
                )) : (
                  <div className="col-span-full py-20 text-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                      <GitBranch size={32} />
                    </div>
                    <h3 className="text-slate-900 font-bold">Chưa có quy trình nào</h3>
                    <p className="text-slate-500 text-sm max-w-xs mx-auto mt-1">Bắt đầu bằng cách tạo quy trình phê duyệt cho các module như Mua hàng, Tài chính hoặc Nhân sự.</p>
                    <button className="mt-6 text-indigo-600 font-bold text-sm hover:underline">Tạo quy trình đầu tiên</button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Quy trình & Đối tượng</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Bước hiện tại</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Trạng thái</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Ngày tạo</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {instances.length > 0 ? instances.map(instance => (
                    <InstanceRow 
                      key={instance.id} 
                      instance={instance} 
                      workflowName={getWorkflowName(instance.workflowId)} 
                    />
                  )) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-20 text-center">
                        <p className="text-slate-400 text-sm italic">Chưa có dữ liệu vận hành quy trình.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Standard ERP Workflows Info */}
      <div className="bg-indigo-900 rounded-3xl p-8 text-white relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <h2 className="text-xl font-black mb-2">Tiêu chuẩn quy trình ERP</h2>
          <p className="text-indigo-100 text-sm mb-6">Hệ thống hỗ trợ thiết lập quy trình đa tầng, phê duyệt song song hoặc nối tiếp, tích hợp thông báo thời gian thực cho các module:</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Mua hàng', desc: 'Duyệt PO > $5000' },
              { label: 'Tài chính', desc: 'Duyệt thanh toán' },
              { label: 'Nhân sự', desc: 'Duyệt nghỉ phép' },
              { label: 'Dự án', desc: 'Duyệt nghiệm thu' }
            ].map((item, i) => (
              <div key={i} className="bg-white/10 backdrop-blur-sm p-4 rounded-2xl border border-white/10">
                <p className="font-bold text-sm mb-1">{item.label}</p>
                <p className="text-[10px] text-indigo-200">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-indigo-500/20 to-transparent pointer-events-none" />
        <GitBranch className="absolute -right-8 -bottom-8 text-white/5 w-64 h-64" />
      </div>
    </div>
  );
};
