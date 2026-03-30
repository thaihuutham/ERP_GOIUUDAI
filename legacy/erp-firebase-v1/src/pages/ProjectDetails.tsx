import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp, 
  DocumentData,
  orderBy,
  getDoc,
  deleteDoc
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { OperationType, handleFirestoreError } from '../utils/error-handler';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  Briefcase, 
  Plus, 
  Search, 
  Filter, 
  Calendar, 
  User, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  MoreVertical,
  ChevronRight,
  DollarSign,
  Layout,
  Users,
  PieChart,
  Timer,
  FileText,
  Trash2,
  Check,
  X,
  Edit2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ProjectStatusBadge = ({ status }: { status: string }) => {
  const styles = {
    planning: "bg-blue-50 text-blue-600 border-blue-100",
    active: "bg-emerald-50 text-emerald-600 border-emerald-100",
    completed: "bg-slate-50 text-slate-600 border-slate-100",
    on_hold: "bg-amber-50 text-amber-600 border-amber-100"
  };
  
  const labels = {
    planning: "Lập kế hoạch",
    active: "Đang triển khai",
    completed: "Đã hoàn thành",
    on_hold: "Tạm dừng"
  };

  return (
    <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-bold border", styles[status as keyof typeof styles])}>
      {labels[status as keyof typeof labels]}
    </span>
  );
};

const TabButton = ({ active, onClick, icon: Icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) => (
  <button 
    onClick={onClick}
    className={cn(
      "flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all whitespace-nowrap",
      active 
        ? "bg-emerald-600 text-white shadow-lg shadow-emerald-100" 
        : "text-slate-500 hover:bg-slate-100"
    )}
  >
    <Icon size={18} />
    {label}
  </button>
);

const TaskStatusBadge = ({ status }: { status: string }) => {
  const styles = {
    todo: "bg-slate-50 text-slate-600 border-slate-100",
    in_progress: "bg-blue-50 text-blue-600 border-blue-100",
    review: "bg-amber-50 text-amber-600 border-amber-100",
    completed: "bg-emerald-50 text-emerald-600 border-emerald-100"
  };
  
  const labels = {
    todo: "Chờ thực hiện",
    in_progress: "Đang làm",
    review: "Đang xem xét",
    completed: "Hoàn thành"
  };

  return (
    <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-bold border", styles[status as keyof typeof styles])}>
      {labels[status as keyof typeof labels]}
    </span>
  );
};

const ProjectDetails = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [tasks, setTasks] = useState<DocumentData[]>([]);
  const [resources, setResources] = useState<DocumentData[]>([]);
  const [budgets, setBudgets] = useState<DocumentData[]>([]);
  const [timeEntries, setTimeEntries] = useState<DocumentData[]>([]);
  const [employees, setEmployees] = useState<DocumentData[]>([]);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isResourceModalOpen, setIsResourceModalOpen] = useState(false);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [isTimeModalOpen, setIsTimeModalOpen] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    const projectRef = doc(db, 'projects', projectId);
    const unsubscribe = onSnapshot(projectRef, (docSnap) => {
      if (docSnap.exists()) {
        setProject({ id: docSnap.id, ...docSnap.data() });
      } else {
        navigate('/projects');
      }
    });
    return unsubscribe;
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    
    const tasksQ = query(collection(db, 'tasks'), where('projectId', '==', projectId), orderBy('createdAt', 'desc'));
    const resourcesQ = query(collection(db, 'project_resources'), where('projectId', '==', projectId));
    const budgetsQ = query(collection(db, 'project_budgets'), where('projectId', '==', projectId));
    const timeQ = query(collection(db, 'time_entries'), where('projectId', '==', projectId), orderBy('createdAt', 'desc'));

    const unsubTasks = onSnapshot(tasksQ, (s) => setTasks(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubResources = onSnapshot(resourcesQ, (s) => setResources(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubBudgets = onSnapshot(budgetsQ, (s) => setBudgets(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubTime = onSnapshot(timeQ, (s) => setTimeEntries(s.docs.map(d => ({ id: d.id, ...d.data() }))));

    return () => {
      unsubTasks();
      unsubResources();
      unsubBudgets();
      unsubTime();
    };
  }, [projectId]);

  useEffect(() => {
    if (!project?.companyId) return;
    const q = query(collection(db, 'employees'), where('companyId', '==', project.companyId));
    return onSnapshot(q, (s) => setEmployees(s.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [project]);

  const handleUpdateTaskStatus = async (taskId: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'tasks', taskId), { status: newStatus });
      
      // Update project progress
      const updatedTasks = tasks.map(t => t.id === taskId ? { ...t, status: newStatus } : t);
      const completedCount = updatedTasks.filter(t => t.status === 'completed').length;
      const progress = Math.round((completedCount / updatedTasks.length) * 100);
      await updateDoc(doc(db, 'projects', projectId!), { progress });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'tasks');
    }
  };

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-600">
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tiến độ dự án</p>
              <p className="text-2xl font-bold text-slate-900">{project?.progress || 0}%</p>
            </div>
          </div>
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${project?.progress || 0}%` }}
            />
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-2xl bg-blue-50 text-blue-600">
              <DollarSign size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ngân sách đã dùng</p>
              <p className="text-2xl font-bold text-slate-900">
                {((project?.actualCost / project?.budget) * 100 || 0).toFixed(1)}%
              </p>
            </div>
          </div>
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${(project?.actualCost / project?.budget) * 100 || 0}%` }}
            />
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-2xl bg-purple-50 text-purple-600">
              <Users size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nhân sự tham gia</p>
              <p className="text-2xl font-bold text-slate-900">{resources.length} người</p>
            </div>
          </div>
          <div className="flex -space-x-2 overflow-hidden">
            {resources.slice(0, 5).map((res, i) => (
              <div key={i} className="inline-block h-8 w-8 rounded-full ring-2 ring-white bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600">
                {res.employeeName?.charAt(0)}
              </div>
            ))}
            {resources.length > 5 && (
              <div className="inline-block h-8 w-8 rounded-full ring-2 ring-white bg-slate-50 flex items-center justify-center text-[10px] font-bold text-slate-400">
                +{resources.length - 5}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <FileText className="text-emerald-600" size={20} />
            Thông tin chi tiết
          </h3>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Mô tả dự án</p>
              <p className="text-slate-600 text-sm leading-relaxed">{project?.description || 'Không có mô tả'}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Ngày bắt đầu</p>
                <p className="text-slate-900 font-medium">{project?.startDate}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Ngày kết thúc</p>
                <p className="text-slate-900 font-medium">{project?.endDate}</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Quản trị dự án</p>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-xs font-bold">
                  {project?.managerName?.charAt(0)}
                </div>
                <span className="text-slate-900 font-medium">{project?.managerName}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="text-emerald-600" size={20} />
              Nhiệm vụ gần đây
            </div>
            <button onClick={() => setActiveTab('tasks')} className="text-xs font-bold text-emerald-600 hover:underline">Xem tất cả</button>
          </h3>
          <div className="space-y-3">
            {tasks.slice(0, 5).map((task) => (
              <div key={task.id} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50/50 border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    task.status === 'completed' ? "bg-emerald-500" : "bg-blue-500"
                  )} />
                  <div>
                    <p className="text-sm font-bold text-slate-900">{task.name}</p>
                    <p className="text-[10px] text-slate-500">{task.assignedToName}</p>
                  </div>
                </div>
                <TaskStatusBadge status={task.status} />
              </div>
            ))}
            {tasks.length === 0 && (
              <div className="py-8 text-center text-slate-400 italic text-sm">Chưa có nhiệm vụ nào</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderTasks = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-slate-900">Danh sách nhiệm vụ</h3>
        <button 
          onClick={() => setIsTaskModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all"
        >
          <Plus size={18} />
          Thêm nhiệm vụ
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {['todo', 'in_progress', 'review', 'completed'].map((status) => (
          <div key={status} className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                {status === 'todo' ? 'Chờ thực hiện' : 
                 status === 'in_progress' ? 'Đang làm' : 
                 status === 'review' ? 'Xem xét' : 'Hoàn thành'}
              </h4>
              <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                {tasks.filter(t => t.status === status).length}
              </span>
            </div>
            <div className="space-y-3 min-h-[200px]">
              {tasks.filter(t => t.status === status).map((task) => (
                <motion.div 
                  layoutId={task.id}
                  key={task.id} 
                  className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer group"
                >
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-sm font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">{task.name}</p>
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      task.priority === 'high' ? "bg-red-500" : 
                      task.priority === 'medium' ? "bg-amber-500" : "bg-blue-500"
                    )} />
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-2 mb-3 leading-relaxed">{task.description}</p>
                  <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                    <div className="flex items-center gap-1.5">
                      <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600">
                        {task.assignedToName?.charAt(0)}
                      </div>
                      <span className="text-[10px] font-medium text-slate-500">{task.assignedToName}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                      <Clock size={10} />
                      {task.endDate}
                    </div>
                  </div>
                  <div className="mt-3 flex gap-1">
                    {status !== 'completed' && (
                      <button 
                        onClick={() => handleUpdateTaskStatus(task.id, status === 'todo' ? 'in_progress' : status === 'in_progress' ? 'review' : 'completed')}
                        className="flex-1 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-[10px] font-bold hover:bg-emerald-100 transition-colors"
                      >
                        Tiếp theo
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderResources = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-slate-900">Quản lý nguồn lực</h3>
        <button 
          onClick={() => setIsResourceModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all"
        >
          <Plus size={18} />
          Phân bổ nhân sự
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {resources.map((res) => (
          <div key={res.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-lg font-bold">
              {res.employeeName?.charAt(0)}
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-slate-900">{res.employeeName}</h4>
              <p className="text-xs text-slate-500 mb-2">{res.role}</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${res.allocationPercentage}%` }} />
                </div>
                <span className="text-[10px] font-bold text-slate-400">{res.allocationPercentage}%</span>
              </div>
            </div>
            <button className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all">
              <Trash2 size={18} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  const renderBudget = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-slate-900">Quản lý ngân sách</h3>
        <button 
          onClick={() => setIsBudgetModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all"
        >
          <Plus size={18} />
          Thêm hạng mục
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50">
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Hạng mục</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Dự kiến</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Thực tế</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Chênh lệch</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {budgets.map((budget) => (
              <tr key={budget.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4">
                  <p className="font-bold text-slate-900">{budget.category}</p>
                  <p className="text-xs text-slate-500">{budget.description}</p>
                </td>
                <td className="px-6 py-4 font-medium text-slate-700">{budget.plannedAmount?.toLocaleString()} ₫</td>
                <td className="px-6 py-4 font-medium text-slate-700">{budget.actualAmount?.toLocaleString() || 0} ₫</td>
                <td className="px-6 py-4">
                  <span className={cn(
                    "font-bold",
                    (budget.plannedAmount - (budget.actualAmount || 0)) < 0 ? "text-red-500" : "text-emerald-500"
                  )}>
                    {(budget.plannedAmount - (budget.actualAmount || 0)).toLocaleString()} ₫
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button className="p-2 text-slate-400 hover:text-slate-600 rounded-xl">
                    <Edit2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderTimeTracking = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-slate-900">Ghi nhận thời gian</h3>
        <button 
          onClick={() => setIsTimeModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all"
        >
          <Plus size={18} />
          Ghi nhận giờ làm
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50">
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Thành viên</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Ngày</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Nhiệm vụ</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Số giờ</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Ghi chú</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {timeEntries.map((entry) => (
              <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
                      {entry.employeeName?.charAt(0)}
                    </div>
                    <span className="font-medium text-slate-700">{entry.employeeName}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-slate-600">{entry.date}</td>
                <td className="px-6 py-4 text-sm font-medium text-slate-900">{tasks.find(t => t.id === entry.taskId)?.name}</td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold">{entry.hours}h</span>
                </td>
                <td className="px-6 py-4 text-sm text-slate-500">{entry.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/projects')}
            className="p-3 rounded-2xl bg-white border border-slate-100 text-slate-400 hover:text-slate-600 transition-all shadow-sm"
          >
            <ChevronRight className="rotate-180" size={24} />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-slate-900">{project?.name}</h1>
              <ProjectStatusBadge status={project?.status} />
            </div>
            <p className="text-slate-500 mt-1 flex items-center gap-2">
              <User size={14} />
              Quản lý: {project?.managerName}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="p-3 rounded-2xl bg-white border border-slate-100 text-slate-400 hover:text-emerald-600 transition-all shadow-sm">
            <Edit2 size={20} />
          </button>
          <button className="p-3 rounded-2xl bg-white border border-slate-100 text-slate-400 hover:text-red-600 transition-all shadow-sm">
            <Trash2 size={20} />
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
        <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} icon={Layout} label="Tổng quan" />
        <TabButton active={activeTab === 'tasks'} onClick={() => setActiveTab('tasks')} icon={CheckCircle2} label="Nhiệm vụ" />
        <TabButton active={activeTab === 'resources'} onClick={() => setActiveTab('resources')} icon={Users} label="Nguồn lực" />
        <TabButton active={activeTab === 'budget'} onClick={() => setActiveTab('budget')} icon={DollarSign} label="Ngân sách" />
        <TabButton active={activeTab === 'time'} onClick={() => setActiveTab('time')} icon={Timer} label="Thời gian" />
        <TabButton active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} icon={PieChart} label="Báo cáo" />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'tasks' && renderTasks()}
          {activeTab === 'resources' && renderResources()}
          {activeTab === 'budget' && renderBudget()}
          {activeTab === 'time' && renderTimeTracking()}
          {activeTab === 'reports' && (
            <div className="bg-white p-12 rounded-3xl border border-slate-100 shadow-sm text-center">
              <PieChart className="mx-auto text-slate-200 mb-4" size={64} />
              <h3 className="text-xl font-bold text-slate-900 mb-2">Báo cáo dự án tự động</h3>
              <p className="text-slate-500 max-w-md mx-auto">Hệ thống đang tổng hợp dữ liệu về tiến độ, chi phí và chất lượng để tạo báo cáo chi tiết cho dự án này.</p>
              <button className="mt-6 px-6 py-3 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all">
                Tải báo cáo (PDF)
              </button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Modals would go here - for brevity I'll implement Task Modal as an example */}
      <AddTaskModal 
        isOpen={isTaskModalOpen} 
        onClose={() => setIsTaskModalOpen(false)} 
        projectId={projectId!} 
        companyId={project?.companyId}
        employees={employees}
      />
    </div>
  );
};

const AddTaskModal = ({ isOpen, onClose, projectId, companyId, employees }: { isOpen: boolean, onClose: () => void, projectId: string, companyId: string, employees: any[] }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    assignedTo: '',
    startDate: '',
    endDate: '',
    priority: 'medium',
    estimatedHours: 0
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const selectedEmp = employees.find(emp => emp.id === formData.assignedTo);
      await addDoc(collection(db, 'tasks'), {
        ...formData,
        projectId,
        companyId,
        assignedToName: selectedEmp?.name || '',
        status: 'todo',
        actualHours: 0,
        createdAt: serverTimestamp()
      });
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'tasks');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h2 className="text-xl font-bold text-slate-900">Thêm nhiệm vụ mới</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <Plus className="rotate-45" size={24} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Tên nhiệm vụ</label>
            <input 
              required
              type="text"
              className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Mô tả</label>
            <textarea 
              className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Người thực hiện</label>
              <select 
                required
                className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                value={formData.assignedTo}
                onChange={(e) => setFormData({...formData, assignedTo: e.target.value})}
              >
                <option value="">Chọn nhân viên</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Ưu tiên</label>
              <select 
                className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                value={formData.priority}
                onChange={(e) => setFormData({...formData, priority: e.target.value})}
              >
                <option value="low">Thấp</option>
                <option value="medium">Trung bình</option>
                <option value="high">Cao</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Ngày bắt đầu</label>
              <input 
                type="date"
                className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                value={formData.startDate}
                onChange={(e) => setFormData({...formData, startDate: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Ngày kết thúc</label>
              <input 
                type="date"
                className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                value={formData.endDate}
                onChange={(e) => setFormData({...formData, endDate: e.target.value})}
              />
            </div>
          </div>
          <div className="pt-4 flex gap-3">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition-all"
            >
              Hủy
            </button>
            <button 
              type="submit"
              className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 font-bold text-white hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all"
            >
              Thêm nhiệm vụ
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default ProjectDetails;
