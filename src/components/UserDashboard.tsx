import React, { useState, useEffect } from 'react';
import { 
  Home, 
  FileText, 
  BookOpen, 
  Folder, 
  CheckSquare, 
  User as UserIcon, 
  Headset, 
  MessageSquare, 
  Copy, 
  Bell,
  ArrowRight,
  Edit2,
  Info,
  CheckCircle2,
  BookMarked,
  GraduationCap,
  LogOut,
  Mail,
  Phone,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Zap,
  Key,
  CreditCard,
  AlertCircle,
  ShieldAlert,
  History,
  Download,
  ExternalLink
} from 'lucide-react';
import RPMGenerator from './RPMGenerator';
import { User, HelpEntry, HistoryEntry } from '../types';
import { db } from '../firebase';
import { collection, getDocs, query, where, doc, updateDoc, getDoc, orderBy } from 'firebase/firestore';

import { handleFirestoreError, OperationType } from '../utils/errorHandling';

interface UserDashboardProps {
  onLogout: () => void;
  user: User;
  isAdminMode?: boolean;
  onBackToAdmin?: () => void;
}

function HelpCenter() {
  const [helpEntries, setHelpEntries] = useState<HelpEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);

  useEffect(() => {
    const fetchHelp = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'help_center'));
        const data: HelpEntry[] = [];
        querySnapshot.forEach((doc) => {
          data.push({ id: doc.id, ...doc.data() } as HelpEntry);
        });
        setHelpEntries(data);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'help_center');
      } finally {
        setIsLoading(false);
      }
    };
    fetchHelp();
  }, []);

  const contacts = helpEntries.filter(h => h.type === 'contact');
  const faqs = helpEntries.filter(h => h.type === 'faq');

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto w-full pb-12">
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-extrabold text-slate-800 mb-4">Pusat Bantuan</h2>
        <p className="text-slate-600 text-lg">Temukan jawaban untuk pertanyaan Anda atau hubungi tim dukungan kami.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-8 mb-12">
        {contacts.length > 0 ? contacts.map(contact => (
          <div key={contact.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center text-center hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4">
              {contact.title.toLowerCase().includes('email') ? <Mail className="w-6 h-6" /> : <Phone className="w-6 h-6" />}
            </div>
            <h3 className="font-bold text-slate-800 mb-2">{contact.title}</h3>
            <p className="text-slate-600">{contact.content}</p>
          </div>
        )) : (
          <div className="col-span-3 text-center text-slate-500 py-8 bg-white rounded-2xl border border-slate-200 border-dashed">
            Belum ada informasi kontak yang ditambahkan.
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50">
          <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <HelpCircle className="w-6 h-6 text-blue-600" />
            Pertanyaan yang Sering Diajukan (FAQ)
          </h3>
        </div>
        <div className="divide-y divide-slate-100">
          {faqs.length > 0 ? faqs.map(faq => (
            <div key={faq.id} className="p-6 hover:bg-slate-50 transition-colors">
              <button 
                onClick={() => setExpandedFaq(expandedFaq === faq.id ? null : faq.id)}
                className="w-full flex items-center justify-between text-left font-semibold text-slate-800 focus:outline-none"
              >
                <span>{faq.title}</span>
                {expandedFaq === faq.id ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
              </button>
              {expandedFaq === faq.id && (
                <div className="mt-4 text-slate-600 leading-relaxed whitespace-pre-wrap">
                  {faq.content}
                </div>
              )}
            </div>
          )) : (
            <div className="p-8 text-center text-slate-500">
              Belum ada FAQ yang ditambahkan.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HistoryView({ userId }: { userId: string }) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const q = query(
          collection(db, 'users', userId, 'history'),
          orderBy('createdAt', 'desc')
        );
        const querySnapshot = await getDocs(q);
        const data: HistoryEntry[] = [];
        querySnapshot.forEach((doc) => {
          data.push({ id: doc.id, ...doc.data() } as HistoryEntry);
        });
        setHistory(data);
      } catch (err) {
        console.error("Error fetching history:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchHistory();
  }, [userId]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto w-full pb-12">
      <div className="mb-8">
        <h2 className="text-3xl font-extrabold text-slate-800 mb-2">Riwayat RPM Saya</h2>
        <p className="text-slate-600">Daftar Rencana Pembelajaran yang telah Anda simpan ke riwayat.</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-sm font-bold text-slate-700 uppercase tracking-wider">Tanggal</th>
                <th className="px-6 py-4 text-sm font-bold text-slate-700 uppercase tracking-wider">Mata Pelajaran</th>
                <th className="px-6 py-4 text-sm font-bold text-slate-700 uppercase tracking-wider">Kelas</th>
                <th className="px-6 py-4 text-sm font-bold text-slate-700 uppercase tracking-wider">Topik</th>
                <th className="px-6 py-4 text-sm font-bold text-slate-700 uppercase tracking-wider">Tipe</th>
                <th className="px-6 py-4 text-sm font-bold text-slate-700 uppercase tracking-wider">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.length > 0 ? history.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {new Date(item.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-6 py-4 text-sm font-semibold text-slate-800">{item.subject}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{item.grade}</td>
                  <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate" title={item.topic}>{item.topic}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                      item.fileType === 'pdf' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {item.fileType}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <a 
                      href={item.fileUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium text-sm"
                    >
                      <Download className="w-4 h-4" />
                      Unduh
                    </a>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <History className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p>Belum ada riwayat RPM yang disimpan.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function UserDashboard({ onLogout, user, isAdminMode, onBackToAdmin }: UserDashboardProps) {
  const [currentView, setCurrentView] = useState<'dashboard' | 'rpm' | 'help' | 'history'>('dashboard');
  const [activationCode, setActivationCode] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [activationMsg, setActivationMsg] = useState<{type: 'success' | 'error', text: string} | null>(null);

  const handleActivateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activationCode.trim()) return;

    setIsActivating(true);
    setActivationMsg(null);

    try {
      // 1. Find the code in Firestore
      const codeId = activationCode.trim().toUpperCase();
      const codeRef = doc(db, 'activation_codes', codeId);
      const codeDoc = await getDoc(codeRef);

      if (!codeDoc.exists() || codeDoc.data().status !== 'unused') {
        setActivationMsg({ type: 'error', text: 'Kode aktivasi tidak valid atau sudah digunakan.' });
        setIsActivating(false);
        return;
      }

      const codeData = codeDoc.data();

      // 2. Update User Document
      const userRef = doc(db, 'users', user.id);
      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + (codeData.duration || 12));

      await updateDoc(userRef, {
        subscription: 'pro',
        subscriptionExpiry: expiryDate.toISOString(),
        sisa_token: (user.sisa_token || 0) + (codeData.tokensPerMonth || 30),
        last_reset: new Date().toISOString()
      });

      // 3. Mark code as used
      await updateDoc(doc(db, 'activation_codes', codeDoc.id), {
        status: 'used',
        usedBy: user.id,
        usedAt: new Date().toISOString()
      });

      setActivationMsg({ type: 'success', text: 'Selamat! Akun Anda sekarang berstatus PRO.' });
      setActivationCode('');
      
      // Refresh page to update user state from App.tsx
      setTimeout(() => window.location.reload(), 2000);

    } catch (err: any) {
      setActivationMsg({ type: 'error', text: 'Terjadi kesalahan saat aktivasi. Silakan coba lagi.' });
      handleFirestoreError(err, OperationType.UPDATE, 'users/activation_codes');
    } finally {
      setIsActivating(false);
    }
  };

  if (currentView === 'rpm') {
    return (
      <div className="flex flex-col h-screen">
        <div className="p-4 bg-white border-b flex items-center gap-4">
          <button 
            onClick={() => setCurrentView('dashboard')}
            className="text-blue-600 hover:underline font-medium"
          >
            &larr; Kembali ke Dashboard
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          <RPMGenerator />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#f8f9fa] font-sans text-slate-800">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col overflow-y-auto shrink-0">
        {/* Logo Area */}
        <div className="p-6 flex items-center justify-center">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-8 h-8 text-[#2563eb]" fill="#2563eb" />
            <span className="text-2xl font-extrabold text-[#2563eb] tracking-tight">
              Guru<span className="text-[#d99b3b]">PintarAI</span>
            </span>
          </div>
        </div>

        {/* Profile Area */}
        <div className="flex flex-col items-center pb-6 border-b border-gray-100">
          <div className="w-20 h-20 bg-blue-500 rounded-full flex items-center justify-center text-white text-3xl font-bold mb-3">
            {user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
          </div>
          <div className="text-sm text-gray-500 mb-1">Nomor Induk Pegawai (NIP)</div>
          <div className="font-mono font-semibold text-gray-700 flex items-center gap-2">
            {user.nip}
          </div>
          <button className="text-blue-500 text-sm flex items-center gap-1 mt-2 hover:text-blue-700 font-medium">
            Salin <Copy className="w-3 h-3" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4">
          <ul className="space-y-1">
            <li>
              <button 
                onClick={() => setCurrentView('dashboard')}
                className={`w-full flex items-center gap-3 px-6 py-3 font-medium transition-colors ${
                  currentView === 'dashboard'
                    ? 'text-blue-600 bg-blue-50 border-l-4 border-blue-600 font-bold'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-blue-600'
                }`}
              >
                <Home className="w-5 h-5" />
                Dashboard
              </button>
            </li>
            <li>
              <button 
                onClick={() => setCurrentView('rpm')}
                className={`w-full flex items-center gap-3 px-6 py-3 font-medium transition-colors ${
                  (currentView as string) === 'rpm'
                    ? 'text-blue-600 bg-blue-50 border-l-4 border-blue-600 font-bold'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-blue-600'
                }`}
              >
                <FileText className="w-5 h-5" />
                Buat RPM
              </button>
            </li>
            <li>
              <button 
                onClick={() => setCurrentView('history')}
                className={`w-full flex items-center gap-3 px-6 py-3 font-medium transition-colors ${
                  currentView === 'history'
                    ? 'text-blue-600 bg-blue-50 border-l-4 border-blue-600 font-bold'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-blue-600'
                }`}
              >
                <History className="w-5 h-5" />
                Riwayat Saya
              </button>
            </li>
            <li>
              <a href="#" className="flex items-center gap-3 px-6 py-3 text-gray-600 hover:bg-gray-50 hover:text-blue-600 transition-colors font-medium">
                <Folder className="w-5 h-5" />
                Bahan Ajar
              </a>
            </li>
            <li>
              <a href="#" className="flex items-center gap-3 px-6 py-3 text-gray-600 hover:bg-gray-50 hover:text-blue-600 transition-colors font-medium">
                <CheckSquare className="w-5 h-5" />
                Asesmen & Penilaian
              </a>
            </li>
            <li>
              <a href="#" className="flex items-center gap-3 px-6 py-3 text-gray-600 hover:bg-gray-50 hover:text-blue-600 transition-colors font-medium">
                <UserIcon className="w-5 h-5" />
                Profil Guru
              </a>
            </li>
            {isAdminMode && onBackToAdmin && (
              <li className="pt-4 mt-4 border-t border-gray-100">
                <button 
                  onClick={onBackToAdmin}
                  className="w-full flex items-center gap-3 px-6 py-3 font-medium text-orange-600 hover:bg-orange-50 transition-colors"
                >
                  <ShieldAlert className="w-5 h-5" />
                  Kembali ke Admin
                </button>
              </li>
            )}
          </ul>

          <div className="mt-8">
            <ul className="space-y-1">
              <li>
                <button 
                  onClick={() => setCurrentView('help')}
                  className={`w-full flex items-center gap-3 px-6 py-3 font-medium transition-colors ${
                    currentView === 'help'
                      ? 'text-blue-600 bg-blue-50 border-l-4 border-blue-600 font-bold'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-blue-600'
                  }`}
                >
                  <Headset className="w-5 h-5" />
                  Pusat Bantuan
                </button>
              </li>
              <li>
                <a href="#" className="flex items-center gap-3 px-6 py-3 text-gray-600 hover:bg-gray-50 hover:text-blue-600 transition-colors font-medium">
                  <MessageSquare className="w-5 h-5" />
                  Forum Diskusi
                </a>
              </li>
            </ul>
          </div>
        </nav>
        
        <div className="p-4 border-t border-gray-200">
          <div className="mb-4 text-center">
            <div className="text-sm text-gray-500 mb-1">Sisa Token:</div>
            <div className="text-2xl font-bold text-blue-600">{user.sisa_token ?? '∞'}</div>
          </div>
          <button 
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden bg-white">
        {/* Top Header */}
        <header className="h-14 bg-[#4a81d4] flex items-center justify-end px-8 text-white shrink-0">
          <button className="flex items-center gap-2 hover:bg-white/10 px-3 py-1.5 rounded-md transition-colors">
            <Bell className="w-5 h-5" fill="currentColor" />
            <span className="text-sm font-medium">Pesan</span>
            <span className="bg-orange-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">2</span>
          </button>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-8 bg-[#f8f9fa]">
          {currentView === 'help' ? (
            <HelpCenter />
          ) : currentView === 'history' ? (
            <HistoryView userId={user.id} />
          ) : (
            <>
              <h1 className="text-2xl font-extrabold text-[#1e3a8a] mb-6 uppercase tracking-wide">
                Hi, {user.name.toUpperCase()}
              </h1>

          {/* Top Cards Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Subscription Status Card */}
            <div className="lg:col-span-3 bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${user.subscription === 'pro' ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-gray-50 text-gray-400 border border-gray-100'}`}>
                  {user.subscription === 'pro' ? <Zap className="w-8 h-8" fill="currentColor" /> : <CreditCard className="w-8 h-8" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-gray-900">Status Akun: {user.subscription === 'pro' ? 'PRO' : 'FREE'}</h2>
                    {user.subscription === 'pro' && (
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full uppercase">Aktif</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">
                    {user.subscription === 'pro' 
                      ? `Berlangganan hingga ${new Date(user.subscriptionExpiry!).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`
                      : 'Gunakan kode aktivasi untuk menikmati fitur PRO dan kuota token lebih banyak.'}
                  </p>
                </div>
              </div>

              {user.subscription !== 'pro' ? (
                <form onSubmit={handleActivateCode} className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                  <div className="relative w-full sm:w-64">
                    <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                      type="text" 
                      placeholder="Masukkan Kode Aktivasi"
                      value={activationCode}
                      onChange={(e) => setActivationCode(e.target.value.toUpperCase())}
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-mono font-bold"
                    />
                  </div>
                  <button 
                    type="submit"
                    disabled={isActivating || !activationCode}
                    className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isActivating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    Aktivasi PRO
                  </button>
                </form>
              ) : (
                <div className="bg-amber-50 px-4 py-3 rounded-xl border border-amber-100 flex items-center gap-3">
                  <Info className="w-5 h-5 text-amber-600" />
                  <div className="text-xs text-amber-800 font-medium">
                    Anda mendapatkan 30 token gratis setiap bulan secara otomatis.
                  </div>
                </div>
              )}
            </div>

            {activationMsg && (
              <div className={`lg:col-span-3 p-4 rounded-xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-2 ${
                activationMsg.type === 'success' ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-700'
              }`}>
                {activationMsg.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                <span className="text-sm font-medium">{activationMsg.text}</span>
              </div>
            )}

            {/* Main Banner Card */}
            <div className="lg:col-span-2 bg-[#eef2ff] rounded-2xl p-6 relative overflow-hidden border border-blue-100 shadow-sm">
              <div className="relative z-10 w-full md:w-2/3">
                <div className="flex items-center gap-2 text-sm text-blue-800 font-medium mb-3">
                  <span>Kelengkapan Perangkat Semester Genap</span>
                  <a href="#" className="text-blue-600 flex items-center gap-1 hover:underline ml-2">
                    Riwayat <ArrowRight className="w-3 h-3" />
                  </a>
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <h2 className="text-3xl font-bold text-[#1e3a8a]">85% Selesai</h2>
                </div>
                <p className="text-gray-700 mb-6 leading-relaxed text-sm md:text-base">
                  Selesaikan penyusunan Modul Ajar dan Asesmen sebelum tanggal di bawah ini agar siap digunakan dalam pembelajaran.
                </p>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8 text-sm">
                  <div>
                    <div className="text-gray-500 mb-1 text-xs">Batas Akhir Pengumpulan</div>
                    <div className="font-semibold text-gray-800 flex items-center gap-2">
                      <BookMarked className="w-4 h-4 text-blue-500" /> 15 Juli 2024 - 23:59 WIB
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 mb-1 text-xs">Status Verifikasi</div>
                    <div className="font-semibold text-orange-600">Menunggu Review</div>
                  </div>
                </div>
              </div>
              
              {/* Illustration Placeholder */}
              <div className="absolute right-0 bottom-0 w-1/3 h-full hidden md:flex items-end justify-end pr-4 pb-0">
                <img 
                  src="https://illustrations.popsy.co/blue/student-going-to-school.svg" 
                  alt="Teacher Illustration" 
                  className="h-48 object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>

            {/* Secondary Card */}
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-1 text-sm font-medium text-gray-500">
                  Status Sinkronisasi Dapodik <Info className="w-4 h-4 text-gray-400" />
                </div>
                <button className="text-blue-500 text-sm flex items-center gap-1 hover:text-blue-700 font-medium">
                  Ubah <Edit2 className="w-3 h-3" />
                </button>
              </div>
              
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center border border-green-100 shrink-0">
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                </div>
                <div>
                  <div className="font-bold text-gray-800">Tersinkronisasi</div>
                  <div className="text-sm text-gray-500">Hari ini, 08:00 WIB</div>
                </div>
              </div>

              <p className="text-sm text-gray-600 mt-auto leading-relaxed">
                Data profil dan rombongan belajar Anda telah disesuaikan dengan server Dapodik pusat. Selengkapnya <a href="#" className="text-blue-500 hover:underline">klik di sini</a>
              </p>
            </div>
          </div>

          {/* Bottom Section */}
          <div>
            <h3 className="text-lg font-bold text-[#1e3a8a] mb-4">Rekomendasi Template & Referensi</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1 */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer group flex flex-col">
                <div className="h-32 bg-blue-100 relative overflow-hidden shrink-0">
                  <img src="https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&q=80&w=400" alt="Cover" className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-300" referrerPolicy="no-referrer" />
                  <div className="absolute top-2 left-2 bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded">Modul Ajar</div>
                </div>
                <div className="p-4 flex flex-col flex-1">
                  <h4 className="font-bold text-gray-800 mb-1 line-clamp-2 text-sm">Template Modul Ajar Kurikulum Merdeka (SMA/SMK)</h4>
                  <p className="text-xs text-gray-500 mb-3 mt-auto">Oleh: Kemdikbudristek</p>
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-blue-600 bg-blue-50 px-2 py-1 rounded">Format .DOCX</span>
                  </div>
                </div>
              </div>

              {/* Card 2 */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer group flex flex-col">
                <div className="h-32 bg-green-100 relative overflow-hidden shrink-0">
                  <img src="https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&q=80&w=400" alt="Cover" className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-300" referrerPolicy="no-referrer" />
                  <div className="absolute top-2 left-2 bg-green-600 text-white text-xs font-bold px-2 py-1 rounded">Asesmen</div>
                </div>
                <div className="p-4 flex flex-col flex-1">
                  <h4 className="font-bold text-gray-800 mb-1 line-clamp-2 text-sm">Bank Soal Literasi & Numerasi Kelas X</h4>
                  <p className="text-xs text-gray-500 mb-3 mt-auto">Oleh: MGMP Matematika</p>
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-blue-600 bg-blue-50 px-2 py-1 rounded">Format .PDF</span>
                  </div>
                </div>
              </div>

              {/* Card 3 */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer group flex flex-col">
                <div className="h-32 bg-orange-100 relative overflow-hidden shrink-0">
                  <img src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&q=80&w=400" alt="Cover" className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-300" referrerPolicy="no-referrer" />
                  <div className="absolute top-2 left-2 bg-orange-600 text-white text-xs font-bold px-2 py-1 rounded">Proyek P5</div>
                </div>
                <div className="p-4 flex flex-col flex-1">
                  <h4 className="font-bold text-gray-800 mb-1 line-clamp-2 text-sm">Panduan Pelaksanaan Proyek Penguatan Profil Pelajar Pancasila</h4>
                  <p className="text-xs text-gray-500 mb-3 mt-auto">Oleh: Tim P5 Pusat</p>
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-blue-600 bg-blue-50 px-2 py-1 rounded">Format .PPTX</span>
                  </div>
                </div>
              </div>

              {/* Card 4 */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer group flex flex-col">
                <div className="h-32 bg-purple-100 relative overflow-hidden shrink-0">
                  <img src="https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&q=80&w=400" alt="Cover" className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-300" referrerPolicy="no-referrer" />
                  <div className="absolute top-2 left-2 bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded">Bahan Ajar</div>
                </div>
                <div className="p-4 flex flex-col flex-1">
                  <h4 className="font-bold text-gray-800 mb-1 line-clamp-2 text-sm">Media Pembelajaran Interaktif Berbasis Web</h4>
                  <p className="text-xs text-gray-500 mb-3 mt-auto">Oleh: Komunitas Guru TIK</p>
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-blue-600 bg-blue-50 px-2 py-1 rounded">Tautan Web</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
          </>
          )}
        </div>
      </main>
    </div>
  );
}
