import React, { useState, useEffect } from 'react';
import { 
  Home, 
  Users, 
  Settings, 
  LogOut, 
  Search, 
  Plus, 
  Edit2, 
  Trash2, 
  GraduationCap,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Loader2,
  HelpCircle,
  Filter,
  UserCheck,
  UserMinus,
  UserPlus,
  Coins,
  BarChart3,
  Activity,
  LayoutDashboard,
  Bell,
  Globe,
  Lock,
  Database,
  RefreshCcw,
  MoreVertical,
  UserX,
  Zap,
  Key,
  CreditCard,
  Calendar,
  Download
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { User, HelpEntry, SyncHistory } from '../types';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc, deleteDoc, setDoc, writeBatch, getDoc, addDoc, query, orderBy, limit } from 'firebase/firestore';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';

interface AdminDashboardProps {
  onLogout: () => void;
  user: User;
  onSwitchToUserMode: () => void;
}

export default function AdminDashboard({ onLogout, user, onSwitchToUserMode }: AdminDashboardProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [helpEntries, setHelpEntries] = useState<HelpEntry[]>([]);
  const [currentView, setCurrentView] = useState<'dashboard' | 'users' | 'help' | 'settings' | 'codes'>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'aktif' | 'nonaktif'>('all');
  const [subscriptionFilter, setSubscriptionFilter] = useState<'all' | 'free' | 'pro'>('all');
  
  // Activation Codes State
  const [activationCodes, setActivationCodes] = useState<any[]>([]);
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [codeFormData, setCodeFormData] = useState({
    code: '',
    duration: 12, // months
    tokensPerMonth: 30,
    quantity: 1
  });
  
  // System Settings State
  const [systemSettings, setSystemSettings] = useState({
    appName: 'GuruPintar AI',
    maintenanceMode: false,
    defaultUserToken: 5,
    defaultAdminToken: 100,
    allowRegistration: true,
    aiProvider: 'gemini',
    geminiApiKeys: [''],
    openRouterApiKeys: [''],
    githubPat: '',
    githubRepo: '',
    githubBranch: 'main'
  });

  const [syncHistory, setSyncHistory] = useState<SyncHistory[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{success: boolean, message: string} | null>(null);

  // Notifications State
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<Partial<User>>({
    name: '', nip: '', email: '', role: 'user', status: 'aktif', sisa_token: 5, subscription: 'free'
  });

  // Help Modal State
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [editingHelp, setEditingHelp] = useState<HelpEntry | null>(null);
  const [helpFormData, setHelpFormData] = useState<Partial<HelpEntry>>({
    title: '', content: '', type: 'faq'
  });

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'users'));
      const usersData: User[] = [];
      querySnapshot.forEach((doc) => {
        usersData.push({ id: doc.id, ...doc.data() } as User);
      });
      setUsers(usersData);
    } catch (err) {
      setErrorMsg('Gagal mengambil data pengguna dari database.');
      handleFirestoreError(err, OperationType.GET, 'users');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleStatus = async (userId: string, currentStatus: 'aktif' | 'nonaktif') => {
    const newStatus = currentStatus === 'aktif' ? 'nonaktif' : 'aktif';
    try {
      await updateDoc(doc(db, 'users', userId), { status: newStatus });
      setUsers(users.map(u => u.id === userId ? { ...u, status: newStatus } : u));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const handleQuickAddToken = async (userId: string, currentTokens: number = 0) => {
    const newTokens = currentTokens + 5;
    try {
      await updateDoc(doc(db, 'users', userId), { sisa_token: newTokens });
      setUsers(users.map(u => u.id === userId ? { ...u, sisa_token: newTokens } : u));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const fetchHelpEntries = async () => {
    setIsLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'help_center'));
      const helpData: HelpEntry[] = [];
      querySnapshot.forEach((doc) => {
        helpData.push({ id: doc.id, ...doc.data() } as HelpEntry);
      });
      // Sort by type, then by title
      helpData.sort((a, b) => {
        if (a.type !== b.type) return a.type.localeCompare(b.type);
        return a.title.localeCompare(b.title);
      });
      setHelpEntries(helpData);
    } catch (err) {
      setErrorMsg('Gagal mengambil data pusat bantuan dari database.');
      handleFirestoreError(err, OperationType.GET, 'help_center');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSystemSettings = async () => {
    try {
      const docRef = doc(db, 'settings', 'general');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSystemSettings(prev => ({ 
          ...prev, 
          ...data,
          geminiApiKeys: data.geminiApiKeys?.length ? data.geminiApiKeys : [''],
          openRouterApiKeys: data.openRouterApiKeys?.length ? data.openRouterApiKeys : [''],
          githubPat: data.githubPat || '',
          githubRepo: data.githubRepo || '',
          githubBranch: data.githubBranch || 'main'
        }));
      }
    } catch (err) {
      console.error("Error fetching settings:", err);
    }
  };

  const fetchNotifications = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'notifications'));
      const notifs: any[] = [];
      querySnapshot.forEach((doc) => {
        notifs.push({ id: doc.id, ...doc.data() });
      });
      notifs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setNotifications(notifs);
    } catch (err) {
      console.error("Error fetching notifications:", err);
    }
  };

  const fetchSyncHistory = async () => {
    try {
      const q = query(collection(db, 'sync_history'), orderBy('timestamp', 'desc'), limit(10));
      const querySnapshot = await getDocs(q);
      const history: SyncHistory[] = [];
      querySnapshot.forEach((doc) => {
        history.push({ id: doc.id, ...doc.data() } as SyncHistory);
      });
      setSyncHistory(history);
    } catch (err) {
      console.error("Error fetching sync history:", err);
    }
  };

  const markNotificationAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch (err) {
      console.error("Error marking notification as read:", err);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.error("Error deleting notification:", err);
    }
  };

  const handleKeyChange = (provider: 'gemini' | 'openrouter', index: number, value: string) => {
    setSystemSettings(prev => {
      const keyName = provider === 'gemini' ? 'geminiApiKeys' : 'openRouterApiKeys';
      const newKeys = [...prev[keyName]];
      newKeys[index] = value;
      return { ...prev, [keyName]: newKeys };
    });
  };

  const handleAddKey = (provider: 'gemini' | 'openrouter') => {
    setSystemSettings(prev => {
      const keyName = provider === 'gemini' ? 'geminiApiKeys' : 'openRouterApiKeys';
      return { ...prev, [keyName]: [...prev[keyName], ''] };
    });
  };

  const handleRemoveKey = (provider: 'gemini' | 'openrouter', index: number) => {
    setSystemSettings(prev => {
      const keyName = provider === 'gemini' ? 'geminiApiKeys' : 'openRouterApiKeys';
      const newKeys = prev[keyName].filter((_, i) => i !== index);
      if (newKeys.length === 0) newKeys.push(''); // Keep at least one
      return { ...prev, [keyName]: newKeys };
    });
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'general'), systemSettings, { merge: true });
      alert("Pengaturan berhasil disimpan!");
    } catch (err) {
      console.error("Error saving settings:", err);
      alert("Gagal menyimpan pengaturan.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncToGithub = async () => {
    console.log("Sync button clicked. Current settings:", {
      pat: systemSettings.githubPat ? "SET" : "EMPTY",
      repo: systemSettings.githubRepo,
      branch: systemSettings.githubBranch
    });

    // Basic validation
    if (!systemSettings.githubPat || !systemSettings.githubRepo) {
      alert("Harap isi GitHub PAT dan Repository URL terlebih dahulu.");
      return;
    }

    if (!systemSettings.githubRepo.includes("/")) {
      alert("Format Repository URL salah. Gunakan format 'username/nama-repo'.");
      return;
    }

    // Start syncing state immediately
    setIsSyncing(true);
    setSyncResult(null);

    try {
      console.log("Starting GitHub sync request to /api/github/sync...");
      const response = await fetch("/api/github/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pat: systemSettings.githubPat,
          repo: systemSettings.githubRepo,
          branch: systemSettings.githubBranch,
          message: `Sync from Admin Panel at ${new Date().toLocaleString('id-ID')}`
        }),
      });

      console.log("Response received from server:", response.status);
      const result = await response.json();
      console.log("Result data:", result);

      if (response.ok) {
        setSyncResult({ success: true, message: "Berhasil menyinkronkan kode ke GitHub!" });
        // Save to history
        await addDoc(collection(db, 'sync_history'), {
          timestamp: new Date().toISOString(),
          status: 'success',
          message: "Berhasil menyinkronkan kode ke GitHub!",
          repo: systemSettings.githubRepo,
          branch: systemSettings.githubBranch
        });
      } else {
        setSyncResult({ success: false, message: result.error || "Gagal menyinkronkan ke GitHub." });
        // Save to history
        await addDoc(collection(db, 'sync_history'), {
          timestamp: new Date().toISOString(),
          status: 'error',
          message: result.error || "Gagal menyinkronkan ke GitHub.",
          repo: systemSettings.githubRepo,
          branch: systemSettings.githubBranch
        });
      }
      fetchSyncHistory(); // Refresh history
    } catch (error: any) {
      console.error("Sync Error:", error);
      setSyncResult({ success: false, message: "Terjadi kesalahan jaringan atau server. Pastikan server backend berjalan." });
      // Save to history
      await addDoc(collection(db, 'sync_history'), {
        timestamp: new Date().toISOString(),
        status: 'error',
        message: "Terjadi kesalahan jaringan atau server.",
        repo: systemSettings.githubRepo,
        branch: systemSettings.githubBranch
      });
      fetchSyncHistory(); // Refresh history
    } finally {
      setIsSyncing(false);
      console.log("Sync process finished.");
    }
  };

  useEffect(() => {
    if (currentView === 'users' || currentView === 'dashboard') {
      fetchUsers();
    } else if (currentView === 'help') {
      fetchHelpEntries();
    } else if (currentView === 'codes') {
      fetchActivationCodes();
    } else if (currentView === 'settings') {
      fetchSystemSettings();
      fetchSyncHistory();
    }
    fetchNotifications();
  }, [currentView]);

  const fetchActivationCodes = async () => {
    setIsLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'activation_codes'));
      const codesData: any[] = [];
      querySnapshot.forEach((doc) => {
        codesData.push({ id: doc.id, ...doc.data() });
      });
      setActivationCodes(codesData);
    } catch (err) {
      setErrorMsg('Gagal mengambil data kode aktivasi.');
      handleFirestoreError(err, OperationType.GET, 'activation_codes');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 12; i++) {
      if (i > 0 && i % 4 === 0) code += '-';
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCodeFormData({ ...codeFormData, code });
  };

  const handleSaveCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      
      const generateRandomCode = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 12; i++) {
          if (i > 0 && i % 4 === 0) code += '-';
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
      };

      const quantity = codeFormData.quantity || 1;
      
      for (let i = 0; i < quantity; i++) {
        const codeToSave = (quantity === 1 && codeFormData.code) ? codeFormData.code : generateRandomCode();
        const newCodeRef = doc(db, 'activation_codes', codeToSave);
        batch.set(newCodeRef, {
          code: codeToSave,
          duration: codeFormData.duration,
          tokensPerMonth: codeFormData.tokensPerMonth,
          status: 'unused',
          createdAt: new Date().toISOString()
        });
      }

      await batch.commit();
      
      await fetchActivationCodes();
      setIsCodeModalOpen(false);
      setCodeFormData({ code: '', duration: 12, tokensPerMonth: 30, quantity: 1 });
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan kode aktivasi.');
      handleFirestoreError(err, OperationType.WRITE, 'activation_codes');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportExcel = () => {
    const dataToExport = activationCodes.map((code, index) => ({
      'No': index + 1,
      'Kode Aktivasi': code.code,
      'Durasi (Bulan)': code.duration,
      'Token / Bulan': code.tokensPerMonth,
      'Status': code.status === 'unused' ? 'Tersedia' : 'Terpakai',
      'Dibuat Pada': new Date(code.createdAt).toLocaleString('id-ID')
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Kode Aktivasi');
    
    // Auto-size columns
    const colWidths = [
      { wch: 5 }, // No
      { wch: 20 }, // Kode Aktivasi
      { wch: 15 }, // Durasi
      { wch: 15 }, // Token
      { wch: 15 }, // Status
      { wch: 25 } // Dibuat Pada
    ];
    worksheet['!cols'] = colWidths;

    XLSX.writeFile(workbook, `Kode_Aktivasi_PRO_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleDeleteCode = async (id: string) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus kode ini?')) {
      try {
        await deleteDoc(doc(db, 'activation_codes', id));
        await fetchActivationCodes();
      } catch (err) {
        alert('Gagal menghapus kode aktivasi.');
        handleFirestoreError(err, OperationType.DELETE, `activation_codes/${id}`);
      }
    }
  };

  const chartData = [
    { name: 'Sen', usage: 45 },
    { name: 'Sel', usage: 52 },
    { name: 'Rab', usage: 38 },
    { name: 'Kam', usage: 65 },
    { name: 'Jum', usage: 48 },
    { name: 'Sab', usage: 24 },
    { name: 'Min', usage: 15 },
  ];

  const roleDistribution = [
    { name: 'Guru', value: users.filter(u => u.role === 'user').length },
    { name: 'Admin', value: users.filter(u => u.role === 'admin').length },
  ];

  const COLORS = ['#3b82f6', '#a855f7'];

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         u.nip.includes(searchQuery);
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
    const matchesSubscription = subscriptionFilter === 'all' || u.subscription === subscriptionFilter;
    return matchesSearch && matchesRole && matchesStatus && matchesSubscription;
  });

  const filteredHelp = helpEntries.filter(h =>
    h.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    h.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleOpenModal = (userToEdit?: User) => {
    setErrorMsg('');
    if (userToEdit) {
      setEditingUser(userToEdit);
      setFormData({ ...userToEdit });
    } else {
      setEditingUser(null);
      setFormData({ name: '', nip: '', email: '', role: 'user', status: 'aktif', sisa_token: 5, subscription: 'free' });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
    setErrorMsg('');
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg('');

    try {
      if (editingUser) {
        // Update existing user in Firestore
        const userRef = doc(db, 'users', editingUser.id);
        await updateDoc(userRef, {
          name: formData.name,
          nip: formData.nip || '-',
          email: formData.email,
          role: formData.role,
          status: formData.status,
          sisa_token: Number(formData.sisa_token) || 0,
          subscription: formData.subscription || 'free',
          subscriptionExpiry: formData.subscriptionExpiry || null
        });
      } else {
        // Create new user document in Firestore
        // Note: This does not create a Firebase Auth account. 
        // The user will need to register with this email to link the auth account.
        const newUserRef = doc(collection(db, 'users'));
        await setDoc(newUserRef, {
          name: formData.name,
          nip: formData.nip || '-',
          email: formData.email,
          role: formData.role,
          status: formData.status,
          sisa_token: Number(formData.sisa_token) || 5,
          subscription: formData.subscription || 'free',
          subscriptionExpiry: formData.subscriptionExpiry || null,
          createdAt: new Date().toISOString(),
          last_reset: new Date().toISOString()
        });
      }
      
      await fetchUsers(); // Refresh data
      handleCloseModal();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan data pengguna.');
      handleFirestoreError(err, OperationType.WRITE, 'users');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus pengguna ini? (Data autentikasi mungkin tetap ada)')) {
      try {
        await deleteDoc(doc(db, 'users', id));
        await fetchUsers(); // Refresh data
      } catch (err) {
        alert('Gagal menghapus pengguna.');
        handleFirestoreError(err, OperationType.DELETE, `users/${id}`);
      }
    }
  };

  const handleOpenHelpModal = (helpToEdit?: HelpEntry) => {
    setErrorMsg('');
    if (helpToEdit) {
      setEditingHelp(helpToEdit);
      setHelpFormData({ ...helpToEdit });
    } else {
      setEditingHelp(null);
      setHelpFormData({ title: '', content: '', type: 'faq' });
    }
    setIsHelpModalOpen(true);
  };

  const handleCloseHelpModal = () => {
    setIsHelpModalOpen(false);
    setEditingHelp(null);
    setErrorMsg('');
  };

  const handleSaveHelp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg('');

    try {
      if (editingHelp) {
        const helpRef = doc(db, 'help_center', editingHelp.id);
        await updateDoc(helpRef, {
          title: helpFormData.title,
          content: helpFormData.content,
          type: helpFormData.type
        });
      } else {
        const newHelpRef = doc(collection(db, 'help_center'));
        await setDoc(newHelpRef, {
          title: helpFormData.title,
          content: helpFormData.content,
          type: helpFormData.type,
          createdAt: new Date().toISOString()
        });
      }
      
      await fetchHelpEntries();
      handleCloseHelpModal();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan data pusat bantuan.');
      handleFirestoreError(err, OperationType.WRITE, 'help_center');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteHelp = async (id: string) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus entri ini?')) {
      try {
        await deleteDoc(doc(db, 'help_center', id));
        await fetchHelpEntries();
      } catch (err) {
        alert('Gagal menghapus entri pusat bantuan.');
        handleFirestoreError(err, OperationType.DELETE, `help_center/${id}`);
      }
    }
  };

  return (
    <div className="flex h-screen bg-[#f8f9fa] font-sans text-slate-800">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0">
        <div className="p-6 flex items-center justify-center border-b border-slate-800">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-8 h-8 text-[#d99b3b]" />
            <span className="text-2xl font-extrabold text-white tracking-tight">
              Admin<span className="text-[#d99b3b]">Panel</span>
            </span>
          </div>
        </div>

        <div className="p-6 border-b border-slate-800">
          <div className="text-sm text-slate-400 mb-1">Login sebagai:</div>
          <div className="font-semibold text-white truncate">{user.name}</div>
        </div>

        <nav className="flex-1 py-4">
          <ul className="space-y-1">
            <li>
              <button 
                onClick={() => setCurrentView('dashboard')}
                className={`w-full flex items-center gap-3 px-6 py-3 font-medium transition-colors ${
                  currentView === 'dashboard' 
                    ? 'text-white bg-blue-600 border-l-4 border-orange-500' 
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <LayoutDashboard className="w-5 h-5" />
                Dashboard
              </button>
            </li>
            <li>
              <button 
                onClick={() => setCurrentView('users')}
                className={`w-full flex items-center gap-3 px-6 py-3 font-medium transition-colors ${
                  currentView === 'users' 
                    ? 'text-white bg-blue-600 border-l-4 border-orange-500' 
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Users className="w-5 h-5" />
                Kelola Pengguna
              </button>
            </li>
            <li>
              <button 
                onClick={() => setCurrentView('help')}
                className={`w-full flex items-center gap-3 px-6 py-3 font-medium transition-colors ${
                  currentView === 'help' 
                    ? 'text-white bg-blue-600 border-l-4 border-orange-500' 
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <HelpCircle className="w-5 h-5" />
                Pusat Bantuan
              </button>
            </li>
            <li>
              <button 
                onClick={() => setCurrentView('codes')}
                className={`w-full flex items-center gap-3 px-6 py-3 font-medium transition-colors ${
                  currentView === 'codes' 
                    ? 'text-white bg-blue-600 border-l-4 border-orange-500' 
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Key className="w-5 h-5" />
                Kode Aktivasi
              </button>
            </li>
            <li>
              <button 
                onClick={() => setCurrentView('settings')}
                className={`w-full flex items-center gap-3 px-6 py-3 font-medium transition-colors ${
                  currentView === 'settings' 
                    ? 'text-white bg-blue-600 border-l-4 border-orange-500' 
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Settings className="w-5 h-5" />
                Pengaturan Sistem
              </button>
            </li>
            <li className="pt-4 mt-4 border-t border-slate-800">
              <button 
                onClick={onSwitchToUserMode}
                className="w-full flex items-center gap-3 px-6 py-3 font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <Globe className="w-5 h-5 text-blue-400" />
                Mode User
              </button>
            </li>
          </ul>
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button 
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden bg-white">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 shrink-0">
          <h1 className="text-xl font-bold text-slate-800">
            {currentView === 'dashboard' ? 'Ringkasan Sistem' : 
             currentView === 'users' ? 'Manajemen Pengguna' : 
             currentView === 'help' ? 'Pusat Bantuan' : 'Pengaturan Sistem'}
          </h1>
          <div className="flex items-center gap-4">
            {(currentView === 'users' || currentView === 'help') && (
              <div className="relative">
                <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                  type="text" 
                  placeholder={currentView === 'users' ? "Cari pengguna..." : "Cari bantuan..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none w-64"
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="relative">
                <button 
                  onClick={() => setIsNotifOpen(!isNotifOpen)}
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors relative"
                >
                  <Bell className="w-5 h-5" />
                  {notifications.filter(n => !n.read).length > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
                  )}
                </button>

                {isNotifOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-100 z-50 overflow-hidden">
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                      <h3 className="font-bold text-gray-800">Notifikasi</h3>
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
                        {notifications.filter(n => !n.read).length} Baru
                      </span>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 text-sm">
                          Tidak ada notifikasi
                        </div>
                      ) : (
                        notifications.map(notif => (
                          <div 
                            key={notif.id} 
                            className={`p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors ${!notif.read ? 'bg-blue-50/30' : ''}`}
                          >
                            <div className="flex justify-between items-start mb-1">
                              <h4 className={`text-sm font-semibold ${notif.type === 'error' ? 'text-red-600' : 'text-gray-800'}`}>
                                {notif.title}
                              </h4>
                              <button 
                                onClick={() => deleteNotification(notif.id)}
                                className="text-gray-400 hover:text-red-500"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </div>
                            <p className="text-xs text-gray-600 mb-2">{notif.message}</p>
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] text-gray-400">
                                {new Date(notif.createdAt).toLocaleString('id-ID')}
                              </span>
                              {!notif.read && (
                                <button 
                                  onClick={() => markNotificationAsRead(notif.id)}
                                  className="text-[10px] text-blue-600 hover:underline font-medium"
                                >
                                  Tandai dibaca
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
              {(currentView === 'users' || currentView === 'help') && (
                <button 
                  onClick={() => currentView === 'users' ? handleOpenModal() : handleOpenHelpModal()}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  {currentView === 'users' ? 'Tambah Pengguna' : 'Tambah Bantuan'}
                </button>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-8 bg-[#f8f9fa] space-y-8">
          {currentView === 'dashboard' && (
            <div className="space-y-8">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                      <Users className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-bold text-green-500 bg-green-50 px-2 py-1 rounded-lg">+12%</span>
                  </div>
                  <div className="text-sm text-gray-500 font-medium">Total Pengguna</div>
                  <div className="text-2xl font-bold text-gray-900">{users.length}</div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                      <Coins className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-bold text-blue-500 bg-blue-50 px-2 py-1 rounded-lg">Stabil</span>
                  </div>
                  <div className="text-sm text-gray-500 font-medium">Total Token Beredar</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {users.reduce((acc, u) => acc + (u.sisa_token || 0), 0)}
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center">
                      <Activity className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-bold text-red-500 bg-red-50 px-2 py-1 rounded-lg">-5%</span>
                  </div>
                  <div className="text-sm text-gray-500 font-medium">Aktivitas Hari Ini</div>
                  <div className="text-2xl font-bold text-gray-900">142</div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 bg-green-50 text-green-600 rounded-xl flex items-center justify-center">
                      <ShieldAlert className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-bold text-green-500 bg-green-50 px-2 py-1 rounded-lg">Aman</span>
                  </div>
                  <div className="text-sm text-gray-500 font-medium">Status Server</div>
                  <div className="text-2xl font-bold text-gray-900">Online</div>
                </div>
              </div>

              {/* Charts Section */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold text-gray-900">Tren Penggunaan Token</h3>
                    <select className="text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 outline-none">
                      <option>7 Hari Terakhir</option>
                      <option>30 Hari Terakhir</option>
                    </select>
                  </div>
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="colorUsage" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                        <RechartsTooltip 
                          contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                        />
                        <Area type="monotone" dataKey="usage" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorUsage)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                  <h3 className="font-bold text-gray-900 mb-6">Distribusi Peran</h3>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={roleDistribution}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {roleDistribution.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-3 mt-4">
                    {roleDistribution.map((entry, index) => (
                      <div key={entry.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{backgroundColor: COLORS[index]}}></div>
                          <span className="text-sm text-gray-600 font-medium">{entry.name}</span>
                        </div>
                        <span className="text-sm font-bold text-gray-900">{entry.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                <h3 className="font-bold text-gray-900 mb-6">Aktivitas Terbaru</h3>
                <div className="space-y-6">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-start gap-4">
                      <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center shrink-0">
                        <UserPlus className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-bold text-gray-900">Pengguna Baru Terdaftar</div>
                        <div className="text-xs text-gray-500">Budi Santoso baru saja mendaftar sebagai Guru.</div>
                      </div>
                      <div className="text-xs text-gray-400 font-medium">2 jam yang lalu</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {currentView === 'users' && (
            <div className="space-y-8">
              {/* Statistics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 font-medium">Total Pengguna</div>
                    <div className="text-2xl font-bold text-gray-900">{users.length}</div>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-4">
                  <div className="w-12 h-12 bg-green-50 text-green-600 rounded-xl flex items-center justify-center">
                    <UserCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 font-medium">Pengguna Aktif</div>
                    <div className="text-2xl font-bold text-gray-900">{users.filter(u => u.status === 'aktif').length}</div>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-4">
                  <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 font-medium">Administrator</div>
                    <div className="text-2xl font-bold text-gray-900">{users.filter(u => u.role === 'admin').length}</div>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-4">
                  <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center">
                    <UserMinus className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 font-medium">Nonaktif</div>
                    <div className="text-2xl font-bold text-gray-900">{users.filter(u => u.status === 'nonaktif').length}</div>
                  </div>
                </div>
              </div>

              {/* Controls & Table Container */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Table Header / Filters */}
                <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input 
                        type="text" 
                        placeholder="Cari nama, email, atau NIP..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none w-full md:w-80 transition-all"
                      />
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl">
                        <Filter className="w-4 h-4 text-gray-400" />
                        <select 
                          value={roleFilter}
                          onChange={(e) => setRoleFilter(e.target.value as any)}
                          className="bg-transparent text-sm font-medium text-gray-600 outline-none cursor-pointer"
                        >
                          <option value="all">Semua Peran</option>
                          <option value="admin">Admin</option>
                          <option value="user">Guru</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl">
                        <CreditCard className="w-4 h-4 text-gray-400" />
                        <select 
                          value={subscriptionFilter}
                          onChange={(e) => setSubscriptionFilter(e.target.value as any)}
                          className="bg-transparent text-sm font-medium text-gray-600 outline-none cursor-pointer"
                        >
                          <option value="all">Semua Status</option>
                          <option value="free">Free</option>
                          <option value="pro">Pro</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl">
                        <Activity className="w-4 h-4 text-gray-400" />
                        <select 
                          value={statusFilter}
                          onChange={(e) => setStatusFilter(e.target.value as any)}
                          className="bg-transparent text-sm font-medium text-gray-600 outline-none cursor-pointer"
                        >
                          <option value="all">Semua Status</option>
                          <option value="aktif">Aktif</option>
                          <option value="nonaktif">Nonaktif</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={() => handleOpenModal()}
                    className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-semibold transition-all shadow-sm hover:shadow-md active:scale-95"
                  >
                    <Plus className="w-5 h-5" />
                    Tambah Pengguna
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50/50 text-xs font-bold text-gray-500 uppercase tracking-wider">
                        <th className="px-6 py-4">Pengguna</th>
                        <th className="px-6 py-4">NIP</th>
                        <th className="px-6 py-4">Peran & Token</th>
                        <th className="px-6 py-4">Subscription</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {isLoading ? (
                        <tr>
                          <td colSpan={6} className="p-12 text-center text-gray-500">
                            <div className="flex flex-col items-center justify-center gap-3">
                              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                              <span className="font-medium">Sinkronisasi data...</span>
                            </div>
                          </td>
                        </tr>
                      ) : filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-12 text-center text-gray-500">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <Search className="w-10 h-10 text-gray-200" />
                              <span className="font-medium text-gray-400">Tidak ada pengguna yang sesuai kriteria.</span>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map((u) => (
                          <tr key={u.id} className="group hover:bg-blue-50/30 transition-all">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                                  {u.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-bold text-gray-900 group-hover:text-blue-700 transition-colors">{u.name}</div>
                                  <div className="text-xs text-gray-500">{u.email}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-sm text-gray-600 font-mono bg-gray-100 px-2 py-1 rounded-md">{u.nip}</span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col gap-1.5">
                                <span className={`inline-flex items-center w-fit px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                  u.role === 'admin' ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-blue-100 text-blue-700 border border-blue-200'
                                }`}>
                                  {u.role}
                                </span>
                                <div className="flex items-center gap-1 text-xs text-gray-500 font-medium">
                                  <Coins className="w-3 h-3 text-amber-500" />
                                  <span>{u.sisa_token ?? 0} Token</span>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col gap-1">
                                <span className={`inline-flex items-center gap-1 w-fit px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                  u.subscription === 'pro' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-gray-100 text-gray-700 border border-gray-200'
                                }`}>
                                  {u.subscription === 'pro' ? <Zap className="w-3 h-3" /> : null}
                                  {u.subscription || 'free'}
                                </span>
                                {u.subscription === 'pro' && u.subscriptionExpiry && (
                                  <div className="flex items-center gap-1 text-[10px] text-gray-400 font-medium">
                                    <Calendar className="w-3 h-3" />
                                    <span>{new Date(u.subscriptionExpiry).toLocaleDateString()}</span>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                                u.status === 'aktif' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${u.status === 'aktif' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                {u.status === 'aktif' ? 'Aktif' : 'Nonaktif'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button 
                                  onClick={() => handleQuickAddToken(u.id, u.sisa_token)}
                                  className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                                  title="Tambah 5 Token"
                                >
                                  <Zap className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => handleToggleStatus(u.id, u.status)}
                                  className={`p-2 rounded-lg transition-all ${u.status === 'aktif' ? 'text-orange-600 hover:bg-orange-50' : 'text-green-600 hover:bg-green-50'}`}
                                  title={u.status === 'aktif' ? 'Nonaktifkan Pengguna' : 'Aktifkan Pengguna'}
                                >
                                  {u.status === 'aktif' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                                </button>
                                <div className="w-px h-4 bg-gray-200 mx-1"></div>
                                <button 
                                  onClick={() => handleOpenModal(u)}
                                  className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-all"
                                  title="Edit Profil Lengkap"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => handleDeleteUser(u.id)}
                                  className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-all"
                                  title="Hapus Permanen"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {currentView === 'help' && (
            <div className="space-y-8">
              {/* Help Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                    <HelpCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 font-medium">Total Bantuan</div>
                    <div className="text-2xl font-bold text-gray-900">{helpEntries.length}</div>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                    <GraduationCap className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 font-medium">Total FAQ</div>
                    <div className="text-2xl font-bold text-gray-900">{helpEntries.filter(h => h.type === 'faq').length}</div>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-4">
                  <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                    <Bell className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 font-medium">Kontak Support</div>
                    <div className="text-2xl font-bold text-gray-900">{helpEntries.filter(h => h.type === 'contact').length}</div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-bold text-gray-900">Daftar Bantuan & FAQ</h3>
                  <button 
                    onClick={() => handleOpenHelpModal()}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-bold transition-all shadow-sm active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    Tambah Bantuan
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50/50 text-xs font-bold text-gray-500 uppercase tracking-wider">
                        <th className="px-6 py-4">Judul</th>
                        <th className="px-6 py-4">Konten</th>
                        <th className="px-6 py-4">Tipe</th>
                        <th className="px-6 py-4 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {isLoading ? (
                        <tr>
                          <td colSpan={4} className="p-12 text-center text-gray-500">
                            <div className="flex flex-col items-center justify-center gap-3">
                              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                              <span className="font-medium">Memuat pusat bantuan...</span>
                            </div>
                          </td>
                        </tr>
                      ) : filteredHelp.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-12 text-center text-gray-500">
                            Tidak ada entri bantuan yang ditemukan.
                          </td>
                        </tr>
                      ) : (
                        filteredHelp.map((h) => (
                          <tr key={h.id} className="group hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 font-bold text-gray-900">{h.title}</td>
                            <td className="px-6 py-4 text-sm text-gray-600 max-w-md truncate">{h.content}</td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                h.type === 'faq' ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                              }`}>
                                {h.type}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button 
                                  onClick={() => handleOpenHelpModal(h)}
                                  className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-all"
                                  title="Edit"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => handleDeleteHelp(h.id)}
                                  className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-all"
                                  title="Hapus"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {currentView === 'codes' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-4">
                  <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                    <Key className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 font-medium">Total Kode</div>
                    <div className="text-2xl font-bold text-gray-900">{activationCodes.length}</div>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-4">
                  <div className="w-12 h-12 bg-green-50 text-green-600 rounded-xl flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 font-medium">Tersedia (Unused)</div>
                    <div className="text-2xl font-bold text-gray-900">{activationCodes.filter(c => c.status === 'unused').length}</div>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                    <Zap className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 font-medium">Terpakai</div>
                    <div className="text-2xl font-bold text-gray-900">{activationCodes.filter(c => c.status === 'used').length}</div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-bold text-gray-900">Kelola Kode Aktivasi PRO</h3>
                  <div className="flex gap-2">
                    <button 
                      onClick={handleExportExcel}
                      className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl font-bold transition-all shadow-sm active:scale-95"
                    >
                      <Download className="w-4 h-4" />
                      Export Excel
                    </button>
                    <button 
                      onClick={() => setIsCodeModalOpen(true)}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-bold transition-all shadow-sm active:scale-95"
                    >
                      <Plus className="w-4 h-4" />
                      Generate Kode
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50/50 text-xs font-bold text-gray-500 uppercase tracking-wider">
                        <th className="px-6 py-4">Kode</th>
                        <th className="px-6 py-4">Durasi</th>
                        <th className="px-6 py-4">Token/Bulan</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {isLoading ? (
                        <tr>
                          <td colSpan={5} className="p-12 text-center text-gray-500">
                            <div className="flex flex-col items-center justify-center gap-3">
                              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                              <span className="font-medium">Memuat data kode...</span>
                            </div>
                          </td>
                        </tr>
                      ) : activationCodes.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-12 text-center text-gray-500">
                            Belum ada kode aktivasi yang dibuat.
                          </td>
                        </tr>
                      ) : (
                        activationCodes.map((c) => (
                          <tr key={c.id} className="group hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 font-mono font-bold text-blue-600">{c.code}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{c.duration} Bulan</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{c.tokensPerMonth} Token</td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                c.status === 'unused' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                              }`}>
                                {c.status === 'unused' ? 'Tersedia' : 'Terpakai'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button 
                                onClick={() => handleDeleteCode(c.id)}
                                className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-all"
                                title="Hapus"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {currentView === 'settings' && (
            <div className="max-w-4xl space-y-8">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-100">
                  <h3 className="font-bold text-gray-900">Konfigurasi Umum</h3>
                  <p className="text-sm text-gray-500">Atur identitas dan perilaku dasar aplikasi.</p>
                </div>
                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                        <Globe className="w-4 h-4 text-blue-500" />
                        Nama Aplikasi
                      </label>
                      <input 
                        type="text" 
                        value={systemSettings.appName}
                        onChange={(e) => setSystemSettings({...systemSettings, appName: e.target.value})}
                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                        <Database className="w-4 h-4 text-purple-500" />
                        Default Token (Guru)
                      </label>
                      <input 
                        type="number" 
                        value={Number.isNaN(systemSettings.defaultUserToken) ? '' : systemSettings.defaultUserToken}
                        onChange={(e) => setSystemSettings({...systemSettings, defaultUserToken: parseInt(e.target.value)})}
                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-red-100 text-red-600 rounded-xl flex items-center justify-center">
                        <ShieldAlert className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-gray-900">Mode Pemeliharaan</div>
                        <div className="text-xs text-gray-500">Nonaktifkan akses publik untuk sementara.</div>
                      </div>
                    </div>
                    <button 
                      onClick={() => setSystemSettings({...systemSettings, maintenanceMode: !systemSettings.maintenanceMode})}
                      className={`w-12 h-6 rounded-full transition-all relative ${systemSettings.maintenanceMode ? 'bg-red-500' : 'bg-gray-300'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${systemSettings.maintenanceMode ? 'left-7' : 'left-1'}`}></div>
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
                        <UserPlus className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-gray-900">Pendaftaran Terbuka</div>
                        <div className="text-xs text-gray-500">Izinkan pengguna baru mendaftar sendiri.</div>
                      </div>
                    </div>
                    <button 
                      onClick={() => setSystemSettings({...systemSettings, allowRegistration: !systemSettings.allowRegistration})}
                      className={`w-12 h-6 rounded-full transition-all relative ${systemSettings.allowRegistration ? 'bg-blue-500' : 'bg-gray-300'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${systemSettings.allowRegistration ? 'left-7' : 'left-1'}`}></div>
                    </button>
                  </div>
                </div>
                
                <div className="p-6 border-t border-gray-100 bg-slate-50/50">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <Globe className="w-5 h-5 text-blue-600" />
                        Sinkronisasi GitHub
                      </h3>
                      <p className="text-xs text-gray-500 mt-1">Cadangkan seluruh kode aplikasi ini ke repositori GitHub Anda secara otomatis.</p>
                    </div>
                    <button 
                      onClick={handleSyncToGithub}
                      disabled={isSyncing}
                      className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50"
                    >
                      {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                      {isSyncing ? 'Menyinkronkan...' : 'Sinkronkan Sekarang'}
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                        <Lock className="w-3.5 h-3.5 text-gray-400" />
                        GitHub Personal Access Token (PAT)
                      </label>
                      <input 
                        type="password" 
                        placeholder="ghp_xxxxxxxxxxxx"
                        value={systemSettings.githubPat}
                        onChange={(e) => setSystemSettings({...systemSettings, githubPat: e.target.value})}
                        className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                        <Database className="w-3.5 h-3.5 text-gray-400" />
                        Repository (username/repo)
                      </label>
                      <input 
                        type="text" 
                        placeholder="username/repo-name"
                        value={systemSettings.githubRepo}
                        onChange={(e) => setSystemSettings({...systemSettings, githubRepo: e.target.value})}
                        className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                        <Activity className="w-3.5 h-3.5 text-gray-400" />
                        Branch
                      </label>
                      <input 
                        type="text" 
                        placeholder="main"
                        value={systemSettings.githubBranch}
                        onChange={(e) => setSystemSettings({...systemSettings, githubBranch: e.target.value})}
                        className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                      />
                    </div>
                  </div>
                  
                  {syncResult && (
                    <div className={`mt-4 p-4 rounded-xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-2 ${
                      syncResult.success ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-700'
                    }`}>
                      {syncResult.success ? <CheckCircle2 className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
                      <span className="text-sm font-medium">{syncResult.message}</span>
                    </div>
                  )}

                  {/* Sync History Table */}
                  <div className="mt-8">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-blue-500" />
                        Riwayat Sinkronisasi Terakhir
                      </h4>
                      <button 
                        onClick={fetchSyncHistory}
                        className="text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                      >
                        <RefreshCcw className="w-3 h-3" />
                        Refresh
                      </button>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                              <th className="px-4 py-3 font-bold text-gray-600">Waktu</th>
                              <th className="px-4 py-3 font-bold text-gray-600">Status</th>
                              <th className="px-4 py-3 font-bold text-gray-600">Repo/Branch</th>
                              <th className="px-4 py-3 font-bold text-gray-600">Pesan</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {syncHistory.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="px-4 py-8 text-center text-gray-500 italic">
                                  Belum ada riwayat sinkronisasi.
                                </td>
                              </tr>
                            ) : (
                              syncHistory.map((history) => (
                                <tr key={history.id} className="hover:bg-gray-50 transition-colors">
                                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                                    {new Date(history.timestamp).toLocaleString('id-ID')}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                      history.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                    }`}>
                                      {history.status === 'success' ? 'Berhasil' : 'Gagal'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-gray-600">
                                    <div className="font-medium truncate max-w-[150px]" title={history.repo}>{history.repo}</div>
                                    <div className="text-[10px] text-gray-400">{history.branch}</div>
                                  </td>
                                  <td className="px-4 py-3 text-gray-500 text-xs max-w-[200px] truncate" title={history.message}>
                                    {history.message}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="p-6 border-t border-gray-100 space-y-6">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    Pengaturan AI Provider & API Keys
                  </h3>
                  <div className="grid grid-cols-1 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-700">Pilih Mesin AI Utama</label>
                      <select 
                        value={systemSettings.aiProvider}
                        onChange={(e) => setSystemSettings({...systemSettings, aiProvider: e.target.value})}
                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      >
                        <option value="gemini">Google Gemini (Bawaan)</option>
                        <option value="openrouter">OpenRouter (Alternatif Gratis)</option>
                      </select>
                      <p className="text-xs text-gray-500">Sistem akan mencoba semua kunci dari mesin utama terlebih dahulu. Jika semua gagal, sistem akan otomatis berpindah (fallback) ke mesin cadangan.</p>
                    </div>
                    
                    {/* Gemini Keys */}
                    <div className="space-y-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
                      <label className="text-sm font-bold text-blue-900 flex items-center gap-2">
                        <Key className="w-4 h-4 text-blue-600" />
                        Daftar API Key Gemini
                      </label>
                      <p className="text-xs text-blue-700 mb-2">Sistem akan mencoba kunci dari atas ke bawah. Jika kunci pertama limit, otomatis lanjut ke kunci kedua.</p>
                      
                      {systemSettings.geminiApiKeys.map((key, index) => (
                        <div key={`gemini-${index}`} className="flex gap-2 items-center">
                          <input 
                            type="text" 
                            value={key}
                            onChange={(e) => handleKeyChange('gemini', index, e.target.value)}
                            placeholder="AIzaSy..."
                            className="flex-1 px-4 py-2 bg-white border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono text-sm"
                          />
                          <button 
                            onClick={() => handleRemoveKey('gemini', index)}
                            className="p-2 text-red-500 hover:bg-red-100 rounded-xl transition-all"
                            title="Hapus Kunci"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      ))}
                      <button 
                        onClick={() => handleAddKey('gemini')}
                        className="text-sm font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-2"
                      >
                        <Plus className="w-4 h-4" /> Tambah API Key Gemini
                      </button>
                    </div>

                    {/* OpenRouter Keys */}
                    <div className="space-y-3 p-4 bg-purple-50 rounded-xl border border-purple-100">
                      <label className="text-sm font-bold text-purple-900 flex items-center gap-2">
                        <Key className="w-4 h-4 text-purple-600" />
                        Daftar API Key OpenRouter
                      </label>
                      <p className="text-xs text-purple-700 mb-2">Dapatkan API Key gratis di openrouter.ai. Model yang digunakan: meta-llama/llama-3-8b-instruct:free</p>
                      
                      {systemSettings.openRouterApiKeys.map((key, index) => (
                        <div key={`or-${index}`} className="flex gap-2 items-center">
                          <input 
                            type="text" 
                            value={key}
                            onChange={(e) => handleKeyChange('openrouter', index, e.target.value)}
                            placeholder="sk-or-v1-..."
                            className="flex-1 px-4 py-2 bg-white border border-purple-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none transition-all font-mono text-sm"
                          />
                          <button 
                            onClick={() => handleRemoveKey('openrouter', index)}
                            className="p-2 text-red-500 hover:bg-red-100 rounded-xl transition-all"
                            title="Hapus Kunci"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      ))}
                      <button 
                        onClick={() => handleAddKey('openrouter')}
                        className="text-sm font-bold text-purple-600 hover:text-purple-800 flex items-center gap-1 mt-2"
                      >
                        <Plus className="w-4 h-4" /> Tambah API Key OpenRouter
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end">
                  <button 
                    onClick={handleSaveSettings}
                    disabled={isSaving}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                    Simpan Perubahan
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-100">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <Lock className="w-4 h-4 text-red-500" />
                    Keamanan & Database
                  </h3>
                </div>
                <div className="p-6 space-y-4">
                  <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 rounded-2xl transition-all group border border-transparent hover:border-gray-100">
                    <div className="text-left">
                      <div className="text-sm font-bold text-gray-900">Backup Database</div>
                      <div className="text-xs text-gray-500">Unduh salinan data Firestore saat ini.</div>
                    </div>
                    <Plus className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-all" />
                  </button>
                  <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 rounded-2xl transition-all group border border-transparent hover:border-gray-100">
                    <div className="text-left">
                      <div className="text-sm font-bold text-gray-900">Log Audit Sistem</div>
                      <div className="text-xs text-gray-500">Lihat riwayat aktivitas administrator.</div>
                    </div>
                    <Plus className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-all" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modal CRUD */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">
                {editingUser ? 'Edit Pengguna' : 'Tambah Pengguna Baru'}
              </h3>
              <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleSaveUser} className="p-6 space-y-4">
              {errorMsg && (
                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
                  {errorMsg}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap</label>
                <input 
                  type="text" 
                  required
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">NIP (Opsional)</label>
                <input 
                  type="text" 
                  value={formData.nip}
                  onChange={e => setFormData({...formData, nip: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input 
                  type="email" 
                  required
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Peran</label>
                  <select 
                    value={formData.role}
                    onChange={e => setFormData({...formData, role: e.target.value as 'admin'|'user'})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  >
                    <option value="user">Guru (User)</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select 
                    value={formData.status}
                    onChange={e => setFormData({...formData, status: e.target.value as 'aktif'|'nonaktif'})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  >
                    <option value="aktif">Aktif</option>
                    <option value="nonaktif">Nonaktif</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subscription</label>
                  <select 
                    value={formData.subscription}
                    onChange={e => setFormData({...formData, subscription: e.target.value as 'free'|'pro'})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  >
                    <option value="free">Free (Gratis)</option>
                    <option value="pro">Pro (Berbayar)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Masa Berlaku (Pro)</label>
                  <input 
                    type="date" 
                    value={formData.subscriptionExpiry || ''}
                    onChange={e => setFormData({...formData, subscriptionExpiry: e.target.value})}
                    disabled={formData.subscription !== 'pro'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sisa Token</label>
                <div className="relative">
                  <Coins className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-amber-500" />
                  <input 
                    type="number" 
                    required
                    value={Number.isNaN(formData.sisa_token) ? '' : (formData.sisa_token ?? '')}
                    onChange={e => setFormData({...formData, sisa_token: parseInt(e.target.value)})}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    min="0"
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-1 italic">* User PRO mendapatkan 30 token/bulan selama 1 tahun.</p>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={handleCloseModal}
                  disabled={isSaving}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-70"
                >
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Help Modal CRUD */}
      {isHelpModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">
                {editingHelp ? 'Edit Bantuan' : 'Tambah Bantuan Baru'}
              </h3>
              <button onClick={handleCloseHelpModal} className="text-gray-400 hover:text-gray-600">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleSaveHelp} className="p-6 space-y-4">
              {errorMsg && (
                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
                  {errorMsg}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Judul / Nama Kontak</label>
                <input 
                  type="text" 
                  required
                  value={helpFormData.title}
                  onChange={e => setHelpFormData({...helpFormData, title: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Contoh: Email Support atau Cara Reset Password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipe</label>
                <select 
                  value={helpFormData.type}
                  onChange={e => setHelpFormData({...helpFormData, type: e.target.value as 'contact'|'faq'})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                >
                  <option value="faq">FAQ (Pertanyaan Umum)</option>
                  <option value="contact">Kontak</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Konten / Deskripsi</label>
                <textarea 
                  required
                  rows={4}
                  value={helpFormData.content}
                  onChange={e => setHelpFormData({...helpFormData, content: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                  placeholder="Isi jawaban FAQ atau detail kontak..."
                />
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={handleCloseHelpModal}
                  disabled={isSaving}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-70"
                >
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Activation Code Modal */}
      {isCodeModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Generate Kode Aktivasi</h3>
              <button onClick={() => setIsCodeModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleSaveCode} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Jumlah Kode</label>
                <input 
                  type="number" 
                  required
                  value={Number.isNaN(codeFormData.quantity) ? '' : codeFormData.quantity}
                  onChange={e => setCodeFormData({...codeFormData, quantity: parseInt(e.target.value) || 1})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  min="1"
                  max="100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kode Aktivasi</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    required={codeFormData.quantity === 1}
                    disabled={codeFormData.quantity > 1}
                    value={codeFormData.quantity > 1 ? 'AUTO-GENERATED' : codeFormData.code}
                    onChange={e => setCodeFormData({...codeFormData, code: e.target.value.toUpperCase()})}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono font-bold text-blue-600 disabled:bg-gray-100 disabled:text-gray-400"
                    placeholder="XXXX-XXXX-XXXX"
                  />
                  <button 
                    type="button"
                    onClick={handleGenerateCode}
                    disabled={codeFormData.quantity > 1}
                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors disabled:opacity-50"
                    title="Acak Kode"
                  >
                    <RefreshCcw className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Durasi (Bulan)</label>
                  <input 
                    type="number" 
                    required
                    value={Number.isNaN(codeFormData.duration) ? '' : codeFormData.duration}
                    onChange={e => setCodeFormData({...codeFormData, duration: parseInt(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    min="1"
                    max="60"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Token / Bulan</label>
                  <input 
                    type="number" 
                    required
                    value={Number.isNaN(codeFormData.tokensPerMonth) ? '' : codeFormData.tokensPerMonth}
                    onChange={e => setCodeFormData({...codeFormData, tokensPerMonth: parseInt(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    min="1"
                  />
                </div>
              </div>

              <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                <p className="text-xs text-blue-700 leading-relaxed">
                  <strong>Info:</strong> Kode ini akan memberikan status <strong>PRO</strong> kepada pengguna yang mengaktifkannya, dengan kuota token bulanan selama durasi yang ditentukan.
                </p>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setIsCodeModalOpen(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  disabled={isSaving || !codeFormData.code}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-70"
                >
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Simpan Kode
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
