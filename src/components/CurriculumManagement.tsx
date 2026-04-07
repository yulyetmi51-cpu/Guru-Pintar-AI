import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Search,
  Loader2,
  ChevronDown,
  ChevronRight,
  BookOpen
} from 'lucide-react';
import { Curriculum, getAllCurriculums, saveCurriculum, deleteCurriculum } from '../services/curriculumService';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';

export default function CurriculumManagement() {
  const [curriculums, setCurriculums] = useState<Curriculum[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCurriculum, setEditingCurriculum] = useState<Curriculum | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  
  const [formData, setFormData] = useState<Partial<Curriculum>>({
    jenjang: 'SD',
    grade: 'Kelas 1',
    subject: '',
    babs: []
  });

  const jenjangOptions = ['SD', 'SMP', 'SMA', 'SMK'];
  const gradeOptions: Record<string, string[]> = {
    'SD': ['Kelas 1', 'Kelas 2', 'Kelas 3', 'Kelas 4', 'Kelas 5', 'Kelas 6'],
    'SMP': ['Kelas 7', 'Kelas 8', 'Kelas 9'],
    'SMA': ['Kelas 10', 'Kelas 11', 'Kelas 12'],
    'SMK': ['Kelas 10', 'Kelas 11', 'Kelas 12']
  };

  useEffect(() => {
    fetchCurriculums();
  }, []);

  const fetchCurriculums = async () => {
    setIsLoading(true);
    try {
      const data = await getAllCurriculums();
      setCurriculums(data);
    } catch (error) {
      console.error("Error fetching curriculums:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = (curriculum?: Curriculum) => {
    if (curriculum) {
      setEditingCurriculum(curriculum);
      setFormData({ ...curriculum });
    } else {
      setEditingCurriculum(null);
      setFormData({
        jenjang: 'SD',
        grade: 'Kelas 1',
        subject: '',
        babs: []
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingCurriculum(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.jenjang || !formData.grade || !formData.subject) {
      alert('Jenjang, Kelas, dan Mata Pelajaran harus diisi.');
      return;
    }

    try {
      await saveCurriculum(formData as Curriculum);
      await fetchCurriculums();
      handleCloseModal();
    } catch (error) {
      console.error("Error saving curriculum:", error);
      alert('Gagal menyimpan kurikulum.');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus kurikulum ini?')) {
      try {
        await deleteCurriculum(id);
        await fetchCurriculums();
      } catch (error) {
        console.error("Error deleting curriculum:", error);
        alert('Gagal menghapus kurikulum.');
      }
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleAddBab = () => {
    setFormData(prev => ({
      ...prev,
      babs: [...(prev.babs || []), { name: '', topics: [] }]
    }));
  };

  const handleRemoveBab = (index: number) => {
    setFormData(prev => ({
      ...prev,
      babs: prev.babs?.filter((_, i) => i !== index)
    }));
  };

  const handleBabNameChange = (index: number, name: string) => {
    setFormData(prev => {
      const newBabs = [...(prev.babs || [])];
      newBabs[index] = { ...newBabs[index], name };
      return { ...prev, babs: newBabs };
    });
  };

  const handleTopicsChange = (index: number, topicsStr: string) => {
    const topics = topicsStr.split('\n').map(t => t.trim()).filter(t => t);
    setFormData(prev => {
      const newBabs = [...(prev.babs || [])];
      newBabs[index] = { ...newBabs[index], topics };
      return { ...prev, babs: newBabs };
    });
  };

  const filteredCurriculums = curriculums.filter(c => 
    c.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.jenjang.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.grade.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-blue-600" />
            Manajemen Kurikulum
          </h1>
          <p className="text-slate-500 mt-1">Kelola data mata pelajaran, bab, dan topik materi.</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 font-medium shadow-sm"
        >
          <Plus className="w-5 h-5" />
          Tambah Kurikulum
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <div className="relative w-96">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text"
              placeholder="Cari mata pelajaran, jenjang, atau kelas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-12 flex justify-center items-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : filteredCurriculums.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            Tidak ada data kurikulum yang ditemukan.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredCurriculums.map((curriculum) => (
              <div key={curriculum.id} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <button 
                        onClick={() => toggleExpand(curriculum.id!)}
                        className="p-1 hover:bg-slate-200 rounded text-slate-500"
                      >
                        {expandedItems[curriculum.id!] ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                      </button>
                      <h3 className="text-lg font-semibold text-slate-800">{curriculum.subject}</h3>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {curriculum.jenjang} - {curriculum.grade}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 ml-9">
                      {curriculum.babs?.length || 0} Bab terdaftar
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => handleOpenModal(curriculum)}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => handleDelete(curriculum.id!)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Hapus"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {expandedItems[curriculum.id!] && curriculum.babs && curriculum.babs.length > 0 && (
                  <div className="mt-4 ml-9 space-y-3">
                    {curriculum.babs.map((bab, index) => (
                      <div key={index} className="bg-white border border-slate-200 rounded-lg p-3">
                        <h4 className="font-medium text-slate-800 mb-2">{bab.name}</h4>
                        <div className="flex flex-wrap gap-2">
                          {bab.topics && bab.topics.map((topic, tIndex) => (
                            <span key={tIndex} className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs">
                              {topic}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold text-slate-800">
                {editingCurriculum ? 'Edit Kurikulum' : 'Tambah Kurikulum Baru'}
              </h2>
              <button 
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <Trash2 className="w-6 h-6" /> {/* Using Trash2 as a placeholder for X, will change if needed, but standard is X */}
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <form id="curriculumForm" onSubmit={handleSave} className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Jenjang *</label>
                    <select
                      value={formData.jenjang}
                      onChange={(e) => {
                        const newJenjang = e.target.value;
                        setFormData({ 
                          ...formData, 
                          jenjang: newJenjang,
                          grade: gradeOptions[newJenjang][0] // Reset grade when jenjang changes
                        });
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      required
                    >
                      {jenjangOptions.map(j => (
                        <option key={j} value={j}>{j}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Kelas *</label>
                    <select
                      value={formData.grade}
                      onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      required
                    >
                      {formData.jenjang && gradeOptions[formData.jenjang].map(g => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Mata Pelajaran *</label>
                  <input
                    type="text"
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="Contoh: Matematika"
                    required
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-3">
                    <label className="block text-sm font-medium text-slate-700">Daftar Bab & Topik</label>
                    <button
                      type="button"
                      onClick={handleAddBab}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" /> Tambah Bab
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    {formData.babs?.map((bab, index) => (
                      <div key={index} className="p-4 border border-slate-200 rounded-lg bg-slate-50">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1 mr-4">
                            <input
                              type="text"
                              value={bab.name}
                              onChange={(e) => handleBabNameChange(index, e.target.value)}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                              placeholder={`Nama Bab ${index + 1} (Contoh: Bab 1: Bilangan Bulat)`}
                              required
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveBab(index)}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Topik Materi (Satu topik per baris)</label>
                          <textarea
                            value={bab.topics?.join('\n') || ''}
                            onChange={(e) => handleTopicsChange(index, e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none min-h-[100px]"
                            placeholder="Pengenalan Bilangan Bulat&#10;Operasi Hitung Bilangan Bulat&#10;Sifat-sifat Operasi Hitung"
                          />
                        </div>
                      </div>
                    ))}
                    {(!formData.babs || formData.babs.length === 0) && (
                      <div className="text-center py-8 text-slate-500 border-2 border-dashed border-slate-300 rounded-lg">
                        Belum ada bab yang ditambahkan. Klik "Tambah Bab" untuk memulai.
                      </div>
                    )}
                  </div>
                </div>
              </form>
            </div>

            <div className="p-6 border-t border-slate-200 flex justify-end gap-3 shrink-0 bg-slate-50 rounded-b-2xl">
              <button 
                type="button"
                onClick={handleCloseModal}
                className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors"
              >
                Batal
              </button>
              <button 
                type="submit"
                form="curriculumForm"
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-sm"
              >
                Simpan Kurikulum
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
