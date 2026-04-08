import React, { useState, useEffect, useRef } from 'react';
import { 
  School, 
  User as UserIcon, 
  Calendar, 
  MapPin, 
  FileText, 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Eye, 
  Printer, 
  Download, 
  Save, 
  X,
  Loader2,
  ChevronLeft,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { db } from '../firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, query, where, orderBy } from 'firebase/firestore';
import { User, DaftarKelasEntry } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';

interface DaftarKelasProps {
  user: User;
}

export default function DaftarKelas({ user }: DaftarKelasProps) {
  const [view, setView] = useState<'list' | 'form' | 'preview'>('list');
  const [entries, setEntries] = useState<DaftarKelasEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [currentEntry, setCurrentEntry] = useState<Partial<DaftarKelasEntry> | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchEntries();
  }, [user.id]);

  const fetchEntries = async () => {
    setIsLoading(true);
    try {
      const q = query(
        collection(db, 'daftar_kelas'),
        where('userId', '==', user.id),
        orderBy('updatedAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const data: DaftarKelasEntry[] = [];
      querySnapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as DaftarKelasEntry);
      });
      setEntries(data);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'daftar_kelas');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEntry) return;

    // Validation
    const requiredFields = ['tahunPelajaran', 'namaSekolah', 'kelas', 'namaGuru'];
    for (const field of requiredFields) {
      if (!currentEntry[field as keyof DaftarKelasEntry]) {
        setNotification({ type: 'error', message: `Field ${field} harus diisi!` });
        return;
      }
    }

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      if (currentEntry.id) {
        // Update
        const entryRef = doc(db, 'daftar_kelas', currentEntry.id);
        await updateDoc(entryRef, {
          ...currentEntry,
          updatedAt: now
        });
        setNotification({ type: 'success', message: 'Data berhasil diperbarui!' });
      } else {
        // Create
        await addDoc(collection(db, 'daftar_kelas'), {
          ...currentEntry,
          userId: user.id,
          createdAt: now,
          updatedAt: now
        });
        setNotification({ type: 'success', message: 'Data berhasil disimpan!' });
      }
      fetchEntries();
      setView('list');
      setCurrentEntry(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'daftar_kelas');
      setNotification({ type: 'error', message: 'Gagal menyimpan data.' });
    } finally {
      setIsSaving(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus data ini?')) return;

    try {
      await deleteDoc(doc(db, 'daftar_kelas', id));
      setNotification({ type: 'success', message: 'Data berhasil dihapus!' });
      fetchEntries();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'daftar_kelas');
      setNotification({ type: 'error', message: 'Gagal menghapus data.' });
    } finally {
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleExportPDF = async () => {
    if (!previewRef.current) return;
    setIsExporting(true);

    try {
      const htmlContent = previewRef.current.innerHTML;
      const styledHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');
            body { 
              font-family: 'Inter', Arial, sans-serif; 
              color: black; 
              margin: 0;
              padding: 0;
            }
            .page {
              width: 210mm;
              height: 297mm;
              padding: 25mm;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              align-items: center;
              text-align: center;
            }
            .title {
              font-size: 32pt;
              font-weight: 900;
              text-decoration: underline;
              margin-bottom: 40pt;
              letter-spacing: 4pt;
              text-transform: uppercase;
            }
            .subtitle {
              font-size: 18pt;
              font-weight: 700;
              margin-bottom: 20pt;
              text-transform: uppercase;
            }
            .info-section {
              margin-top: 40pt;
              width: 100%;
              display: flex;
              flex-direction: column;
              gap: 15pt;
            }
            .info-row {
              display: flex;
              justify-content: center;
              gap: 10pt;
              font-size: 16pt;
              font-weight: 700;
              text-transform: uppercase;
            }
            .location-section {
              margin-top: 60pt;
              font-size: 14pt;
              font-weight: 500;
            }
            .footer-section {
              margin-top: auto;
              width: 100%;
              display: flex;
              flex-direction: column;
              align-items: center;
            }
            .guru-label {
              font-size: 16pt;
              font-weight: 700;
              margin-bottom: 40pt;
              text-transform: uppercase;
            }
            .guru-name {
              font-size: 18pt;
              font-weight: 900;
              text-decoration: underline;
              text-transform: uppercase;
            }
            .guru-nip {
              font-size: 14pt;
              margin-top: 5pt;
            }
          </style>
        </head>
        <body>
          <div class="page">
            ${htmlContent}
          </div>
        </body>
        </html>
      `;

      const response = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: styledHtml,
          paperSize: 'a4',
          orientation: 'portrait',
          margin: '0mm'
        }),
      });

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Daftar_Kelas_${currentEntry?.kelas || 'Dokumen'}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      setNotification({ type: 'success', message: 'PDF berhasil diunduh!' });
    } catch (err) {
      console.error(err);
      setNotification({ type: 'error', message: 'Gagal mengekspor PDF.' });
    } finally {
      setIsExporting(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const filteredEntries = entries.filter(e => 
    e.namaSekolah.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.kelas.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.tahunPelajaran.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto w-full pb-12">
      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-lg border flex items-center gap-3 animate-in fade-in slide-in-from-top-2 ${
          notification.type === 'success' ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-700'
        }`}>
          {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span className="font-medium">{notification.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-800 mb-2">Daftar Kelas</h2>
          <p className="text-slate-600">Kelola data daftar kelas dan cetak dokumen resmi sekolah.</p>
        </div>
        {view === 'list' && (
          <button 
            onClick={() => {
              setCurrentEntry({
                tahunPelajaran: '2024/2025',
                namaGuru: user.name,
                nip: user.nip || '',
              });
              setView('form');
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-sm flex items-center gap-2 active:scale-95"
          >
            <Plus className="w-5 h-5" />
            Tambah Data Baru
          </button>
        )}
        {view !== 'list' && (
          <button 
            onClick={() => setView('list')}
            className="text-slate-600 hover:text-blue-600 font-medium flex items-center gap-2"
          >
            <ChevronLeft className="w-5 h-5" />
            Kembali ke Daftar
          </button>
        )}
      </div>

      {/* Main Content Area */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {view === 'list' && (
          <div className="p-0">
            <div className="p-6 border-b border-slate-100 bg-slate-50 flex flex-col md:flex-row gap-4 justify-between items-center">
              <div className="relative w-full md:w-96">
                <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Cari sekolah, kelas, atau tahun..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
              </div>
              <div className="text-sm text-slate-500 font-medium">
                Menampilkan {filteredEntries.length} data
              </div>
            </div>

            {isLoading ? (
              <div className="p-20 flex flex-col items-center justify-center text-slate-400">
                <Loader2 className="w-10 h-10 animate-spin mb-4" />
                <p>Memuat data...</p>
              </div>
            ) : filteredEntries.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Sekolah / Kelas</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Tahun Pelajaran</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Guru</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredEntries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-blue-50/30 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-800">{entry.namaSekolah}</div>
                          <div className="text-sm text-blue-600 font-medium">Kelas {entry.kelas}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {entry.tahunPelajaran}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-slate-800">{entry.namaGuru}</div>
                          <div className="text-xs text-slate-500">NIP. {entry.nip || '-'}</div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => {
                                setCurrentEntry(entry);
                                setView('preview');
                              }}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                              title="Preview"
                            >
                              <Eye className="w-5 h-5" />
                            </button>
                            <button 
                              onClick={() => {
                                setCurrentEntry(entry);
                                setView('form');
                              }}
                              className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                              title="Edit"
                            >
                              <Edit2 className="w-5 h-5" />
                            </button>
                            <button 
                              onClick={() => handleDelete(entry.id)}
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                              title="Hapus"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-20 flex flex-col items-center justify-center text-slate-400 text-center">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                  <School className="w-10 h-10 text-slate-200" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-1">Belum ada data</h3>
                <p className="max-w-xs">Mulai dengan menambahkan data daftar kelas baru untuk sekolah Anda.</p>
              </div>
            )}
          </div>
        )}

        {view === 'form' && currentEntry && (
          <div className="p-8">
            <form onSubmit={handleSave} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Section 1: Identitas Sekolah */}
                <div className="space-y-6">
                  <h3 className="text-lg font-bold text-blue-600 flex items-center gap-2 border-b pb-2">
                    <School className="w-5 h-5" />
                    Identitas Sekolah
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Nama Sekolah *</label>
                      <input 
                        type="text" 
                        required
                        value={currentEntry.namaSekolah || ''}
                        onChange={(e) => setCurrentEntry({ ...currentEntry, namaSekolah: e.target.value })}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        placeholder="Contoh: SD Negeri 08 VI Suku"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">NSS</label>
                      <input 
                        type="text" 
                        value={currentEntry.nss || ''}
                        onChange={(e) => setCurrentEntry({ ...currentEntry, nss: e.target.value })}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        placeholder="Nomor Statistik Sekolah"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Kelas *</label>
                        <input 
                          type="text" 
                          required
                          value={currentEntry.kelas || ''}
                          onChange={(e) => setCurrentEntry({ ...currentEntry, kelas: e.target.value })}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                          placeholder="Contoh: IV A"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Tahun Pelajaran *</label>
                        <input 
                          type="text" 
                          required
                          value={currentEntry.tahunPelajaran || ''}
                          onChange={(e) => setCurrentEntry({ ...currentEntry, tahunPelajaran: e.target.value })}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                          placeholder="Contoh: 2024/2025"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 2: Identitas Guru & Lokasi */}
                <div className="space-y-6">
                  <h3 className="text-lg font-bold text-blue-600 flex items-center gap-2 border-b pb-2">
                    <UserIcon className="w-5 h-5" />
                    Identitas Guru & Lokasi
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Nama Guru *</label>
                      <input 
                        type="text" 
                        required
                        value={currentEntry.namaGuru || ''}
                        onChange={(e) => setCurrentEntry({ ...currentEntry, namaGuru: e.target.value })}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        placeholder="Nama Lengkap Beserta Gelar"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">NIP</label>
                      <input 
                        type="text" 
                        value={currentEntry.nip || ''}
                        onChange={(e) => setCurrentEntry({ ...currentEntry, nip: e.target.value })}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        placeholder="Nomor Induk Pegawai"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Kecamatan</label>
                        <input 
                          type="text" 
                          value={currentEntry.kecamatan || ''}
                          onChange={(e) => setCurrentEntry({ ...currentEntry, kecamatan: e.target.value })}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Kota/Kabupaten</label>
                        <input 
                          type="text" 
                          value={currentEntry.kota || ''}
                          onChange={(e) => setCurrentEntry({ ...currentEntry, kota: e.target.value })}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Provinsi</label>
                      <input 
                        type="text" 
                        value={currentEntry.provinsi || ''}
                        onChange={(e) => setCurrentEntry({ ...currentEntry, provinsi: e.target.value })}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-6 border-t">
                <button 
                  type="button"
                  onClick={() => setView('list')}
                  className="px-6 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-all"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  disabled={isSaving}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 rounded-xl font-bold transition-all shadow-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  Simpan Data
                </button>
              </div>
            </form>
          </div>
        )}

        {view === 'preview' && currentEntry && (
          <div className="p-0 flex flex-col h-full bg-slate-100">
            {/* Preview Toolbar */}
            <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between sticky top-0 z-10 print:hidden">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setView('list')}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-all"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <h3 className="font-bold text-slate-800">Preview Dokumen</h3>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handlePrint}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold transition-all"
                >
                  <Printer className="w-4 h-4" />
                  Cetak
                </button>
                <button 
                  onClick={handleExportPDF}
                  disabled={isExporting}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-all shadow-sm disabled:opacity-50"
                >
                  {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Export PDF
                </button>
              </div>
            </div>

            {/* Document Preview */}
            <div className="flex-1 overflow-auto p-8 flex justify-center print:p-0 print:bg-white">
              <div 
                ref={previewRef}
                className="bg-white w-[210mm] min-h-[297mm] p-[25mm] shadow-xl print:shadow-none print:w-full print:min-h-0 flex flex-col items-center text-center"
                style={{ fontFamily: 'Arial, sans-serif' }}
              >
                <h1 className="text-[32pt] font-black underline mb-[40pt] tracking-[4pt] uppercase">
                  DAFTAR KELAS
                </h1>
                
                <div className="text-[18pt] font-bold mb-[20pt] uppercase">
                  TAHUN PELAJARAN {currentEntry.tahunPelajaran}
                </div>

                <div className="text-[18pt] font-bold mb-[40pt] uppercase">
                  KELAS {currentEntry.kelas}
                </div>

                <div className="text-[22pt] font-black mb-[20pt] uppercase max-w-[80%]">
                  {currentEntry.namaSekolah}
                </div>

                {currentEntry.nss && (
                  <div className="text-[16pt] font-bold mb-[40pt]">
                    NSS : {currentEntry.nss}
                  </div>
                )}

                <div className="text-[16pt] font-bold mb-[40pt] uppercase">
                  DI
                </div>

                <div className="text-[18pt] font-black mb-[40pt] uppercase">
                  {currentEntry.kota || '-'}
                </div>

                <div className="text-[12pt] font-medium mb-[40pt]">
                  Didirikan dengan SK dari : PEMERINTAH DAERAH ( WALIKOTA )
                </div>

                <div className="space-y-2 mb-[60pt]">
                  {currentEntry.kecamatan && (
                    <div className="text-[14pt] font-bold uppercase">
                      Kecamatan : {currentEntry.kecamatan}
                    </div>
                  )}
                  {currentEntry.kota && (
                    <div className="text-[14pt] font-bold uppercase">
                      Kota : {currentEntry.kota}
                    </div>
                  )}
                </div>

                <div className="text-[22pt] font-black mb-[60pt] uppercase tracking-[2pt]">
                  PROPINSI {currentEntry.provinsi || '-'}
                </div>

                <div className="mt-auto w-full flex flex-col items-center">
                  <div className="text-[16pt] font-bold mb-[40pt] uppercase">
                    GURU KELAS
                  </div>
                  
                  <div className="text-[18pt] font-black underline uppercase">
                    {currentEntry.namaGuru}
                  </div>
                  {currentEntry.nip && (
                    <div className="text-[14pt] font-bold mt-2">
                      NIP. {currentEntry.nip}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
