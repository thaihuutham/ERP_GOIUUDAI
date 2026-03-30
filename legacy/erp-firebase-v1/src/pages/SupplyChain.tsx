import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Truck, 
  ShoppingCart, 
  Package, 
  TrendingUp, 
  AlertTriangle, 
  Users, 
  Plus, 
  Search, 
  Filter, 
  Download,
  ChevronRight,
  MapPin,
  Calendar,
  Clock,
  CheckCircle2,
  Box,
  BarChart3,
  ShieldAlert,
  ArrowRightLeft
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
  limit
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useEmployee } from '../App';
import { toast } from 'sonner';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const TabButton = ({ active, onClick, icon: Icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) => (
  <button 
    onClick={onClick}
    className={cn(
      "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap",
      active 
        ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" 
        : "text-slate-600 hover:bg-slate-100"
    )}
  >
    <Icon size={18} />
    <span>{label}</span>
  </button>
);

const StatCard = ({ title, value, subValue, icon: Icon, color }: { title: string, value: string, subValue?: string, icon: any, color: string }) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
    <div className="flex justify-between items-start mb-4">
      <div className={cn("p-3 rounded-xl", color)}>
        <Icon size={24} />
      </div>
    </div>
    <h3 className="text-sm font-medium text-slate-500">{title}</h3>
    <p className="text-2xl font-black text-slate-900 mt-1">{value}</p>
    {subValue && <p className="text-xs text-slate-400 mt-1">{subValue}</p>}
  </div>
);

// --- Sub-components for Sections ---

const VendorManagement = ({ companyId }: { companyId: string }) => {
  const [vendors, setVendors] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'vendors'), where('companyId', '==', companyId));
    const unsub = onSnapshot(q, snap => {
      setVendors(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [companyId]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-slate-900">Quản lý nhà cung cấp</h3>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
          <Plus size={18} />
          <span>Thêm nhà cung cấp</span>
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-10 text-center text-slate-400 italic">Đang tải dữ liệu...</div>
        ) : vendors.length > 0 ? vendors.map(vendor => (
          <div key={vendor.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600 font-bold text-xl">
                {vendor.name?.[0]}
              </div>
              <div>
                <h4 className="font-bold text-slate-900">{vendor.name}</h4>
                <p className="text-xs text-slate-500">{vendor.email}</p>
              </div>
            </div>
            <div className="space-y-2 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <MapPin size={14} className="text-slate-400" />
                <span className="truncate">{vendor.address || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-500" />
                <span className="text-xs font-bold uppercase text-emerald-600">{vendor.status}</span>
              </div>
            </div>
            <button className="w-full mt-6 py-2 text-sm font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
              Xem chi tiết & Đánh giá
            </button>
          </div>
        )) : (
          <div className="col-span-full py-10 text-center text-slate-400">Chưa có nhà cung cấp nào.</div>
        )}
      </div>
    </div>
  );
};

const PurchaseManagement = ({ companyId }: { companyId: string }) => {
  const [orders, setOrders] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'purchase_orders'), where('companyId', '==', companyId), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [companyId]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-slate-900">Đơn mua hàng (PO)</h3>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
          <Plus size={18} />
          <span>Tạo đơn mua hàng</span>
        </button>
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Mã đơn</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Nhà cung cấp</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Ngày đặt</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-right">Tổng tiền</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-center">Trạng thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400 italic">Đang tải dữ liệu...</td></tr>
            ) : orders.length > 0 ? orders.map(order => (
              <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4 text-sm font-bold text-slate-900">#{order.id.slice(-6).toUpperCase()}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{order.vendorName}</td>
                <td className="px-6 py-4 text-sm text-slate-500">{order.orderDate}</td>
                <td className="px-6 py-4 text-sm font-bold text-slate-900 text-right">{order.totalAmount?.toLocaleString()} ₫</td>
                <td className="px-6 py-4 text-center">
                  <span className={cn(
                    "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                    order.status === 'received' ? "bg-emerald-50 text-emerald-600" : 
                    order.status === 'ordered' ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500"
                  )}>
                    {order.status === 'received' ? 'Đã nhận' : order.status === 'ordered' ? 'Đã đặt' : 'Nháp'}
                  </span>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400">Chưa có đơn mua hàng nào.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ShipmentTracking = ({ companyId }: { companyId: string }) => {
  const [shipments, setShipments] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'shipments'), where('companyId', '==', companyId));
    const unsub = onSnapshot(q, snap => {
      setShipments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [companyId]);

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-slate-900">Theo dõi vận chuyển</h3>
      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <div className="py-10 text-center text-slate-400 italic">Đang tải dữ liệu...</div>
        ) : shipments.length > 0 ? shipments.map(shipment => (
          <div key={shipment.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600">
                  <Truck size={24} />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">{shipment.carrier} - {shipment.trackingNumber}</h4>
                  <p className="text-xs text-slate-500">Đơn hàng: {shipment.orderId || 'N/A'}</p>
                </div>
              </div>
              <span className={cn(
                "px-3 py-1 rounded-full text-xs font-bold uppercase",
                shipment.status === 'delivered' ? "bg-emerald-50 text-emerald-600" : 
                shipment.status === 'in_transit' ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"
              )}>
                {shipment.status === 'delivered' ? 'Đã giao' : shipment.status === 'in_transit' ? 'Đang vận chuyển' : 'Chờ xử lý'}
              </span>
            </div>
            
            <div className="relative flex items-center justify-between px-4">
              <div className="absolute left-0 right-0 h-0.5 bg-slate-100 -z-10 mx-10"></div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-emerald-500 border-4 border-white shadow-sm"></div>
                <p className="text-xs font-bold text-slate-900">{shipment.origin}</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className={cn(
                  "w-4 h-4 rounded-full border-4 border-white shadow-sm",
                  shipment.status === 'delivered' ? "bg-emerald-500" : "bg-slate-300"
                )}></div>
                <p className="text-xs font-bold text-slate-900">{shipment.destination}</p>
              </div>
            </div>
            
            <div className="mt-6 pt-6 border-t border-slate-50 flex justify-between text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <Calendar size={14} />
                <span>Dự kiến: {shipment.estimatedArrival || 'N/A'}</span>
              </div>
              <button className="text-indigo-600 font-bold hover:underline">Chi tiết hành trình</button>
            </div>
          </div>
        )) : (
          <div className="py-10 text-center text-slate-400">Chưa có thông tin vận chuyển.</div>
        )}
      </div>
    </div>
  );
};

const DemandAndRisk = ({ companyId }: { companyId: string }) => {
  const [forecasts, setForecasts] = useState<DocumentData[]>([]);
  const [risks, setRisks] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const qF = query(collection(db, 'demand_forecasts'), where('companyId', '==', companyId));
    const qR = query(collection(db, 'supply_chain_risks'), where('companyId', '==', companyId));
    
    const unsubF = onSnapshot(qF, snap => setForecasts(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubR = onSnapshot(qR, snap => {
      setRisks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    
    return () => { unsubF(); unsubR(); };
  }, [companyId]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <TrendingUp size={20} className="text-indigo-600" />
          Dự báo nhu cầu
        </h3>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
          {forecasts.length > 0 ? forecasts.map(f => (
            <div key={f.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
              <div>
                <p className="text-sm font-bold text-slate-900">{f.productName}</p>
                <p className="text-xs text-slate-500">Kỳ: {f.period}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-indigo-600">{f.forecastedQuantity} đơn vị</p>
                <p className="text-[10px] text-slate-400">Độ tin cậy: {f.confidenceLevel}%</p>
              </div>
            </div>
          )) : (
            <div className="py-10 text-center text-slate-400 text-sm italic">Chưa có dữ liệu dự báo.</div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <ShieldAlert size={20} className="text-rose-600" />
          Quản trị rủi ro
        </h3>
        <div className="space-y-4">
          {risks.length > 0 ? risks.map(risk => (
            <div key={risk.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <h4 className="font-bold text-slate-900">{risk.title}</h4>
                <span className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                  risk.severity === 'critical' ? "bg-rose-100 text-rose-600" :
                  risk.severity === 'high' ? "bg-orange-100 text-orange-600" : "bg-blue-100 text-blue-600"
                )}>
                  {risk.severity}
                </span>
              </div>
              <p className="text-xs text-slate-500 mb-4">{risk.description}</p>
              <div className="flex items-center justify-between text-[10px] font-bold">
                <span className="text-slate-400 uppercase">Trạng thái: {risk.status}</span>
                <button className="text-indigo-600 hover:underline">Kế hoạch ứng phó</button>
              </div>
            </div>
          )) : (
            <div className="bg-white p-10 rounded-2xl border border-slate-100 shadow-sm text-center text-slate-400 text-sm italic">
              Không phát hiện rủi ro nghiêm trọng.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- Main Supply Chain Component ---

export const SupplyChain = () => {
  const employeeData = useEmployee();
  const [activeTab, setActiveTab] = useState<'overview' | 'vendors' | 'purchase' | 'logistics' | 'distribution' | 'forecast'>('overview');

  if (!employeeData) return null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Chuỗi cung ứng (SCM)</h1>
          <p className="text-slate-500 text-sm">Tối ưu hóa quy trình từ cung ứng đến phân phối.</p>
        </div>
        <div className="flex gap-2">
          <button className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-slate-50 transition-all">
            <BarChart3 size={18} />
            <span>Phân tích</span>
          </button>
          <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-md shadow-indigo-100">
            <Plus size={18} />
            <span>Tạo PO mới</span>
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Đơn mua hàng tháng" value="42" subValue="+5 so với tháng trước" icon={ShoppingCart} color="bg-indigo-50 text-indigo-600" />
        <StatCard title="Đang vận chuyển" value="18" subValue="3 đơn giao trễ" icon={Truck} color="bg-blue-50 text-blue-600" />
        <StatCard title="Tồn kho phân phối" value="1,250" subValue="Sản phẩm sẵn sàng" icon={Box} color="bg-emerald-50 text-emerald-600" />
        <StatCard title="Chỉ số rủi ro" value="Thấp" subValue="Hệ thống ổn định" icon={ShieldAlert} color="bg-rose-50 text-rose-600" />
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide border-b border-slate-100">
        <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} icon={BarChart3} label="Tổng quan" />
        <TabButton active={activeTab === 'vendors'} onClick={() => setActiveTab('vendors')} icon={Users} label="Nhà cung cấp" />
        <TabButton active={activeTab === 'purchase'} onClick={() => setActiveTab('purchase')} icon={ShoppingCart} label="Mua hàng" />
        <TabButton active={activeTab === 'logistics'} onClick={() => setActiveTab('logistics')} icon={Truck} label="Vận chuyển" />
        <TabButton active={activeTab === 'distribution'} onClick={() => setActiveTab('distribution')} icon={ArrowRightLeft} label="Phân phối" />
        <TabButton active={activeTab === 'forecast'} onClick={() => setActiveTab('forecast')} icon={TrendingUp} label="Dự báo & Rủi ro" />
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
                <h3 className="text-lg font-bold text-slate-900 mb-6">Hiệu suất chuỗi cung ứng</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'OTIF Rate', value: '94%', color: 'text-emerald-600' },
                    { label: 'Lead Time', value: '3.2 ngày', color: 'text-blue-600' },
                    { label: 'Stockout Rate', value: '1.5%', color: 'text-rose-600' },
                    { label: 'Vendor Score', value: '4.8/5', color: 'text-amber-600' }
                  ].map((m, i) => (
                    <div key={i} className="p-4 rounded-xl bg-slate-50 text-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{m.label}</p>
                      <p className={cn("text-xl font-black", m.color)}>{m.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 mb-6">Hoạt động gần đây</h3>
                <div className="space-y-4">
                  {[
                    { type: 'purchase', title: 'Đơn hàng #PO-992 đã được xác nhận', time: '10 phút trước', icon: ShoppingCart, color: 'text-indigo-600' },
                    { type: 'shipment', title: 'Lô hàng từ Samsung Vina đang giao', time: '2 giờ trước', icon: Truck, color: 'text-blue-600' },
                    { type: 'risk', title: 'Cảnh báo: Bão ảnh hưởng vận chuyển miền Trung', time: '5 giờ trước', icon: AlertTriangle, color: 'text-rose-600' }
                  ].map((a, i) => (
                    <div key={i} className="flex items-center gap-4 p-4 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer">
                      <div className={cn("p-2 rounded-lg bg-slate-100", a.color)}>
                        <a.icon size={20} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-900">{a.title}</p>
                        <p className="text-xs text-slate-500">{a.time}</p>
                      </div>
                      <ChevronRight size={16} className="text-slate-300" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 mb-6">Top nhà cung cấp</h3>
                <div className="space-y-4">
                  {['Samsung Vina', 'Apple Inc', 'Logitech VN'].map((v, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold">{v[0]}</div>
                        <span className="text-sm font-medium text-slate-700">{v}</span>
                      </div>
                      <div className="flex items-center gap-1 text-amber-400">
                        <TrendingUp size={14} />
                        <span className="text-xs font-bold text-slate-600">4.{9-i}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="w-full mt-6 py-2 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors">Xem tất cả</button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'vendors' && <VendorManagement companyId={employeeData.companyId} />}
        {activeTab === 'purchase' && <PurchaseManagement companyId={employeeData.companyId} />}
        {activeTab === 'logistics' && <ShipmentTracking companyId={employeeData.companyId} />}
        
        {activeTab === 'distribution' && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
            <Package size={48} className="mx-auto text-slate-200 mb-4" />
            <h3 className="text-lg font-bold text-slate-900 mb-2">Quản lý phân phối</h3>
            <p className="text-slate-500 max-w-md mx-auto mb-6">Tối ưu hóa quy trình luân chuyển hàng hóa giữa các kho và kênh bán hàng.</p>
            <button className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold text-sm shadow-lg shadow-indigo-100">Lập kế hoạch phân phối</button>
          </div>
        )}

        {activeTab === 'forecast' && <DemandAndRisk companyId={employeeData.companyId} />}
      </motion.div>
    </div>
  );
};
