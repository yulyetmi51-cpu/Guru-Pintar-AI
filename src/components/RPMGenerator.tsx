import React, { useState, useRef, useEffect } from 'react';
import JoditEditor from 'jodit-react';
import { marked } from 'marked';
import { generateRPM, generateAIImage, suggestBabs, suggestTopics, generateRPMChained } from '../services/geminiService';
import { BookOpen, Loader2, Copy, Check, Printer, FileText, Download, Settings2, ZoomIn, ZoomOut, Maximize, ChevronDown, Layers, X, Save, History } from 'lucide-react';
import { doc, runTransaction, getDoc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, auth, storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { asBlob } from 'html-docx-js-typescript';
// @ts-ignore
import html2pdf from 'html2pdf.js';

const sanitizeAIOutput = (text: string) => {
  if (!text) return text;
  let cleanText = text;
  
  // 1. Replace [AI_IMAGE_PROMPT: ...] with dynamic image using Pollinations AI
  cleanText = cleanText.replace(/\[AI_IMAGE_PROMPT:\s*(.*?)\]/gi, (match, prompt) => {
    const encodedPrompt = encodeURIComponent(prompt.trim() + " educational illustration, safe for school, high quality, vector art");
    return `<div style="text-align: center; margin: 20px 0;">
      <img src="https://image.pollinations.ai/prompt/${encodedPrompt}?width=800&height=400&nologo=true" alt="${prompt}" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);" crossorigin="anonymous" />
      <p style="font-size: 10pt; color: #666; margin-top: 8px;"><i>Ilustrasi: ${prompt}</i></p>
    </div>`;
  });

  // Normalize markdown headings before parsing
  // Make sure ## becomes h3 and ### becomes h4
  cleanText = cleanText.replace(/^###\s+(.*)/gm, '#### $1');
  cleanText = cleanText.replace(/^##\s+(.*)/gm, '### $1');

  // Parse markdown to HTML
  let html = marked.parse(cleanText) as string;

  return html;
};

const JENJANG_DATA: Record<string, { fases: string[], mapels: string[] }> = {
  'SD': {
    fases: ['Fase A (Kelas 1-2)', 'Fase B (Kelas 3-4)', 'Fase C (Kelas 5-6)'],
    mapels: ['Bahasa Indonesia', 'Matematika', 'IPAS', 'Pendidikan Pancasila', 'Seni Budaya', 'PJOK', 'Pendidikan Agama', 'Bahasa Inggris']
  },
  'SMP': {
    fases: ['Fase D (Kelas 7-9)'],
    mapels: ['Bahasa Indonesia', 'Matematika', 'IPA', 'IPS', 'Pendidikan Pancasila', 'Bahasa Inggris', 'Informatika', 'Seni Budaya', 'PJOK', 'Pendidikan Agama']
  },
  'SMA': {
    fases: ['Fase E (Kelas 10)', 'Fase F (Kelas 11-12)'],
    mapels: ['Bahasa Indonesia', 'Matematika', 'IPA (Fisika, Kimia, Biologi)', 'IPS (Sejarah, Geografi, Ekonomi, Sosiologi)', 'Pendidikan Pancasila', 'Bahasa Inggris', 'Informatika', 'Seni Budaya', 'PJOK', 'Pendidikan Agama']
  },
  'SMK': {
    fases: ['Fase E (Kelas 10)', 'Fase F (Kelas 11-12)'],
    mapels: ['Bahasa Indonesia', 'Matematika', 'Bahasa Inggris', 'Informatika', 'Projek IPAS', 'Pendidikan Pancasila', 'PJOK', 'Seni Budaya', 'Pendidikan Agama', 'Kejuruan']
  }
};

export default function RPMGenerator() {
  const [topic, setTopic] = useState<string[]>([]);
  const [topicInput, setTopicInput] = useState('');
  const [bab, setBab] = useState('');
  const [subject, setSubject] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [jenjang, setJenjang] = useState('SD');
  const [grade, setGrade] = useState('Kelas 1');
  const [fase, setFase] = useState('Fase A');
  const [timeAllocation, setTimeAllocation] = useState('');
  
  const [author, setAuthor] = useState('');
  const [nipGuru, setNipGuru] = useState('');
  const [school, setSchool] = useState('');
  const [kepsek, setKepsek] = useState('');
  const [nipKepsek, setNipKepsek] = useState('');
  const [tempat, setTempat] = useState('');
  const [tanggal, setTanggal] = useState(new Date().toISOString().split('T')[0]);
  
  // New States for Mode and Auto-Suggest
  const [generationMode, setGenerationMode] = useState<'harian' | 'bab'>('harian');
  const [jumlahPertemuan, setJumlahPertemuan] = useState(2);
  const [suggestedBabs, setSuggestedBabs] = useState<string[]>([]);
  const [isLoadingBabs, setIsLoadingBabs] = useState(false);
  const [isManualBab, setIsManualBab] = useState(false);
  
  const [suggestedTopics, setSuggestedTopics] = useState<string[]>([]);
  const [isLoadingTopics, setIsLoadingTopics] = useState(false);
  const [isManualTopic, setIsManualTopic] = useState(false);

  const [loadingStep, setLoadingStep] = useState<string>('');

  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  const [isSavingToHistory, setIsSavingToHistory] = useState(false);

  // Load Profile from Firestore
  useEffect(() => {
    const fetchProfile = async () => {
      if (!auth.currentUser) return;
      setIsProfileLoading(true);
      try {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setAuthor(data.name || '');
          setNipGuru(data.nip || '');
          setSchool(data.schoolName || '');
          setKepsek(data.principalName || '');
          setNipKepsek(data.principalNip || '');
          setTempat(data.location || '');
        }
      } catch (err) {
        console.error("Error fetching profile:", err);
      } finally {
        setIsProfileLoading(false);
      }
    };

    fetchProfile();
  }, []);

  // Update Grade and Subject when Jenjang changes
  useEffect(() => {
    const data = JENJANG_DATA[jenjang];
    if (data) {
      setSubject(data.mapels[0]);
    }
  }, [jenjang]);

  // Fetch Suggested Babs when Jenjang, Grade, or Subject changes
  useEffect(() => {
    const fetchBabs = async () => {
      const currentSubject = subject === 'Lainnya' ? customSubject : subject;
      if (!jenjang || !grade || !currentSubject) return;
      
      setIsLoadingBabs(true);
      setSuggestedBabs([]);
      setIsManualBab(false);
      setBab(''); // Clear current bab
      
      try {
        const babs = await suggestBabs(jenjang, grade, currentSubject);
        if (babs.length > 0) {
          setSuggestedBabs(babs);
          setBab(babs[0]); // Auto-select first
        } else {
          setIsManualBab(true);
        }
      } catch (e) {
        setIsManualBab(true);
      } finally {
        setIsLoadingBabs(false);
      }
    };

    // Debounce slightly to avoid too many calls if user clicks fast
    const timeoutId = setTimeout(fetchBabs, 500);
    return () => clearTimeout(timeoutId);
  }, [jenjang, grade, subject, customSubject]);

  // Fetch Suggested Topics when Bab changes
  useEffect(() => {
    const fetchTopics = async () => {
      const currentSubject = subject === 'Lainnya' ? customSubject : subject;
      if (!jenjang || !grade || !currentSubject || !bab || isManualBab) {
        setSuggestedTopics([]);
        return;
      }
      
      setIsLoadingTopics(true);
      setSuggestedTopics([]);
      setIsManualTopic(false);
      setTopic([]); // Clear current topic
      
      try {
        const topics = await suggestTopics(jenjang, grade, currentSubject, bab);
        if (topics.length > 0) {
          setSuggestedTopics(topics);
          setTopic([topics[0]]); // Auto-select first
        } else {
          setIsManualTopic(true);
        }
      } catch (e) {
        setIsManualTopic(true);
      } finally {
        setIsLoadingTopics(false);
      }
    };

    const timeoutId = setTimeout(fetchTopics, 500);
    return () => clearTimeout(timeoutId);
  }, [jenjang, grade, subject, customSubject, bab, isManualBab]);

  const saveToProfile = async () => {
    if (!auth.currentUser) return;
    setIsSavingProfile(true);
    setProfileMessage(null);
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        name: author,
        nip: nipGuru,
        schoolName: school,
        principalName: kepsek,
        principalNip: nipKepsek,
        location: tempat
      });
      setProfileMessage({ text: 'Profil berhasil diperbarui!', type: 'success' });
      setTimeout(() => setProfileMessage(null), 3000);
    } catch (err) {
      console.error("Error saving profile:", err);
      setProfileMessage({ text: 'Gagal memperbarui profil.', type: 'error' });
      setTimeout(() => setProfileMessage(null), 3000);
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Lampiran States
  const [includeMateri, setIncludeMateri] = useState(false);
  const [includeLKPD, setIncludeLKPD] = useState(false);
  const [includeAsesmen, setIncludeAsesmen] = useState(false);
  
  // Asesmen specific states
  const [asesmenType, setAsesmenType] = useState('Formatif');
  const [asesmenCount, setAsesmenCount] = useState(10);
  const [asesmenQuestionTypes, setAsesmenQuestionTypes] = useState({
    pilihanGanda: true,
    pgKompleks: false,
    isian: false,
    uraian: false,
    menjodohkan: false
  });
  const [asesmenWithImages, setAsesmenWithImages] = useState(false);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingEmote, setLoadingEmote] = useState('⏳');
  const [generatedRPM, setGeneratedRPM] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [contentHeight, setContentHeight] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [paperSize, setPaperSize] = useState('A4');
  const [orientation, setOrientation] = useState('portrait');
  const [pageMargin, setPageMargin] = useState('normal');
  const [showPageSetup, setShowPageSetup] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (innerRef.current) {
      const observer = new ResizeObserver(() => {
        if (innerRef.current) {
          const height = innerRef.current.offsetHeight;
          setContentHeight(height);
          // 297mm is approx 1123px at 96dpi
          const estPages = Math.ceil(height / (297 * 3.7795275591));
          setPageCount(estPages || 1);
        }
      });
      observer.observe(innerRef.current);
      return () => observer.disconnect();
    }
  }, [generatedRPM, zoom]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic || !subject || !grade) {
      setError('Mohon isi Topik, Mata Pelajaran, dan Kelas.');
      return;
    }

    if (!auth.currentUser) {
      setError('Anda harus login untuk menggunakan fitur ini.');
      return;
    }

    setIsGenerating(true);
    setProgress(0);
    setLoadingEmote('⏳');
    setLoadingStep('');
    setError(null);
    setGeneratedRPM(null);

    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 95) return 95;
        const newProgress = prev + Math.floor(Math.random() * 5) + 1;
        if (newProgress > 30 && newProgress < 60) setLoadingEmote('🧠');
        else if (newProgress >= 60 && newProgress < 90) setLoadingEmote('✍️');
        else if (newProgress >= 90) setLoadingEmote('🚀');
        return newProgress;
      });
    }, generationMode === 'bab' ? 1000 : 500); // Slower progress for bab mode

    try {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      
      // Transaction for Token Usage
      await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) {
          throw new Error("Data pengguna tidak ditemukan.");
        }

        const userData = userDoc.data();
        let sisaToken = userData.sisa_token ?? 5; // Default 5 if undefined
        const lastResetStr = userData.last_reset;
        const lastReset = lastResetStr ? new Date(lastResetStr) : new Date(0);
        const now = new Date();

        // Check if month or year has changed
        const isNewMonth = now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear();

        if (isNewMonth) {
          // Reset token based on role (admin: 50, user: 5)
          sisaToken = userData.role === 'admin' ? 50 : 5;
          transaction.update(userRef, {
            sisa_token: sisaToken - 1,
            last_reset: now.toISOString()
          });
        } else {
          if (sisaToken <= 0) {
            throw new Error("Kuota token Anda telah habis bulan ini.");
          }
          transaction.update(userRef, {
            sisa_token: sisaToken - 1
          });
        }
      });

      // Format tanggal to Indonesian format
      let formattedTanggal = tanggal;
      try {
        const [year, month, day] = tanggal.split('-');
        const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        if (year && month && day) {
          formattedTanggal = `${parseInt(day)} ${months[parseInt(month) - 1]} ${year}`;
        }
      } catch (e) {
        console.error("Error formatting date", e);
      }

      // Proceed with generation if transaction succeeds
      let result = '';
      const finalSubject = subject === 'Lainnya' ? customSubject : subject;
      
      if (generationMode === 'bab') {
        result = await generateRPMChained(
          topic, bab, finalSubject, jenjang, grade, fase, timeAllocation,
          author, school, kepsek, nipKepsek, nipGuru, tempat, formattedTanggal,
          includeMateri, includeLKPD, includeAsesmen,
          asesmenType, asesmenCount, asesmenQuestionTypes, asesmenWithImages,
          jumlahPertemuan,
          (stepMsg) => setLoadingStep(stepMsg)
        );
      } else {
        result = await generateRPM(
          topic, bab, finalSubject, jenjang, grade, fase, timeAllocation, 
          author, school, kepsek, nipKepsek, nipGuru, tempat, formattedTanggal, 
          includeMateri, includeLKPD, includeAsesmen, 
          asesmenType, asesmenCount, asesmenQuestionTypes, asesmenWithImages
        );
      }

      // Handle AI Image Generation if markers are present
      if (asesmenWithImages && result.includes('AI_IMAGE_PROMPT')) {
        setLoadingEmote('🎨');
        const imagePrompts = result.match(/\[\s*AI_IMAGE_PROMPT\s*:\s*(.*?)\s*\]/g) || [];
        
        for (let i = 0; i < imagePrompts.length; i++) {
          const fullPrompt = imagePrompts[i];
          // Extract just the text using a capturing group or replace
          const promptText = fullPrompt.replace(/\[\s*AI_IMAGE_PROMPT\s*:/, '').replace(/\]$/, '').trim();
          
          setProgress(prev => Math.min(prev + 2, 99)); // Small progress for each image
          
          try {
            const imageUrl = await generateAIImage(promptText);
            if (imageUrl) {
              const imgHtml = `<div style="text-align: center; margin: 20px 0;"><img src="${imageUrl}" referrerpolicy="no-referrer" style="max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #eee; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);" alt="AI Generated Illustration" /></div>`;
              result = result.replace(fullPrompt, imgHtml);
            } else {
              result = result.replace(fullPrompt, '');
              
              // Log to notifications
              try {
                await addDoc(collection(db, 'notifications'), {
                  title: 'Gagal Menghasilkan Gambar',
                  message: `Gagal menghasilkan gambar untuk prompt: "${promptText}". Kemungkinan kuota API Key habis.`,
                  type: 'error',
                  read: false,
                  createdAt: new Date().toISOString()
                });
              } catch (logErr) {
                console.error("Failed to log notification:", logErr);
              }
            }
          } catch (err) {
            console.error("Failed to generate image for prompt:", promptText, err);
            result = result.replace(fullPrompt, '');
            
            // Log to notifications
            try {
              await addDoc(collection(db, 'notifications'), {
                title: 'Error Sistem Gambar',
                message: `Terjadi kesalahan saat menghasilkan gambar: ${err instanceof Error ? err.message : String(err)}`,
                type: 'error',
                read: false,
                createdAt: new Date().toISOString()
              });
            } catch (logErr) {
              console.error("Failed to log notification:", logErr);
            }
          }
        }
      }
      
      clearInterval(progressInterval);
      setProgress(100);
      setLoadingEmote('✨');
      
      setTimeout(() => {
        setGeneratedRPM(sanitizeAIOutput(result));
        setIsGenerating(false);
      }, 500);
      
    } catch (err: any) {
      clearInterval(progressInterval);
      setIsGenerating(false);
      setError(err.message || 'Terjadi kesalahan saat memproses permintaan.');
    }
  };

  const handleSaveToHistory = async (type: 'doc' | 'pdf') => {
    if (!generatedRPM || !auth.currentUser) return;
    
    setIsSavingToHistory(true);
    try {
      let blob: Blob;
      let extension: string;
      
      if (type === 'doc') {
        extension = 'doc';
        // Prepare HTML for Word (similar to handleDownloadWord)
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = generatedRPM;
        const clone = tempDiv;
        
        const tables = clone.querySelectorAll('table');
        tables.forEach(table => {
          const t = table as HTMLElement;
          t.style.width = '100%';
          t.style.borderCollapse = 'collapse';
          t.style.marginBottom = '16pt';
          table.setAttribute('border', '1');
          t.style.fontFamily = 'Arial, sans-serif';
          t.style.fontSize = '12pt';
        });

        const cells = clone.querySelectorAll('th, td');
        cells.forEach(cell => {
          const c = cell as HTMLElement;
          c.style.border = '1px solid black';
          c.style.padding = '8px';
          c.style.verticalAlign = 'top';
        });

        const headings = clone.querySelectorAll('h3');
        headings.forEach(h3 => {
          const h = h3 as HTMLElement;
          h.style.backgroundColor = '#87CEEB';
          h.style.border = '1px solid black';
          h.style.padding = '8px';
          h.style.textAlign = 'center';
          h.style.marginTop = '24pt';
          h.style.marginBottom = '16pt';
          h.style.fontSize = '14pt';
          h.style.fontFamily = 'Arial, sans-serif';
        });

        const paragraphs = clone.querySelectorAll('p, li');
        paragraphs.forEach(p => {
          const el = p as HTMLElement;
          el.style.textAlign = 'justify';
          el.style.fontFamily = 'Arial, sans-serif';
          el.style.fontSize = '12pt';
          el.style.lineHeight = '1.5';
        });

        const html = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset='utf-8'><title>RPM</title></head>
        <body><div class="WordSection1">${clone.innerHTML}</div></body>
        </html>`;
        
        blob = new Blob(['\ufeff', html], { type: 'application/msword' });
      } else {
        extension = 'pdf';
        const pdfHtml = `
          <div class="markdown-body" style="font-family: Arial, sans-serif; color: black; font-size: 12pt; line-height: 1.5; text-align: justify;">
            <style>
              h3 { background-color: #87CEEB; border: 1px solid black; padding: 8px; text-align: center; margin-top: 24px; margin-bottom: 16px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 16px; border: 1px solid black; }
              th, td { border: 1px solid black; padding: 8px; vertical-align: top; }
              img { max-width: 100%; height: auto; }
            </style>
            ${generatedRPM}
          </div>
        `;
        
        const marginVal = pageMargin === 'narrow' ? 12.7 : pageMargin === 'wide' ? 25.4 : 20;
        const opt = {
          margin:       marginVal,
          image:        { type: 'jpeg' as const, quality: 0.98 },
          html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
          jsPDF:        { unit: 'mm', format: paperSize.toLowerCase(), orientation: orientation as 'portrait' | 'landscape' },
          pagebreak:    { mode: ['css', 'legacy', 'avoid-all'] }
        };
        
        blob = await html2pdf().set(opt).from(pdfHtml).output('blob');
      }

      // Upload to Firebase Storage
      const fileName = `RPM_${subject}_${grade}_${Date.now()}.${extension}`;
      const storageRef = ref(storage, `users/${auth.currentUser.uid}/history/${fileName}`);
      await uploadBytes(storageRef, blob);
      const fileUrl = await getDownloadURL(storageRef);

      // Save to Firestore History
      await addDoc(collection(db, 'users', auth.currentUser.uid, 'history'), {
        subject,
        grade,
        topic: topic.join(', '),
        fileUrl,
        fileType: type,
        createdAt: new Date().toISOString()
      });

      // Send Notification to Admin
      await addDoc(collection(db, 'notifications'), {
        title: 'RPM Baru Disimpan',
        message: `${author || auth.currentUser?.email} baru saja menyimpan RPM ${subject} ${grade} ke riwayat.`,
        type: 'info',
        read: false,
        createdAt: new Date().toISOString()
      });

      alert("Berhasil disimpan ke riwayat!");
    } catch (err) {
      console.error("Error saving to history:", err);
      alert("Gagal menyimpan ke riwayat. Pastikan koneksi internet stabil.");
    } finally {
      setIsSavingToHistory(false);
    }
  };

  const handleCopy = () => {
    if (generatedRPM) {
      navigator.clipboard.writeText(generatedRPM);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadWord = async (contentToDownload?: string) => {
    const htmlContent = contentToDownload || generatedRPM;
    if (!htmlContent) return;
    
    // Create a temporary element to hold the HTML content
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    const clone = tempDiv;
    
    // Inject inline styles for Word compatibility
    const tables = clone.querySelectorAll('table');
    tables.forEach(table => {
      const t = table as HTMLElement;
      t.style.width = '100%';
      t.style.borderCollapse = 'collapse';
      t.style.marginBottom = '16pt';
      table.setAttribute('border', '1');
      t.style.fontFamily = 'Arial, sans-serif';
      t.style.fontSize = '12pt';
    });

    const cells = clone.querySelectorAll('th, td');
    cells.forEach(cell => {
      const c = cell as HTMLElement;
      c.style.border = '1px solid black';
      c.style.padding = '8px';
      c.style.verticalAlign = 'top';
    });

    const headings = clone.querySelectorAll('h3');
    headings.forEach(h3 => {
      const h = h3 as HTMLElement;
      h.style.backgroundColor = '#87CEEB';
      h.style.border = '1px solid black';
      h.style.padding = '8px';
      h.style.textAlign = 'center';
      h.style.marginTop = '24pt';
      h.style.marginBottom = '16pt';
      h.style.fontSize = '14pt';
      h.style.fontFamily = 'Arial, sans-serif';
    });

    const paragraphs = clone.querySelectorAll('p, li');
    paragraphs.forEach(p => {
      const el = p as HTMLElement;
      el.style.textAlign = 'justify';
      el.style.fontFamily = 'Arial, sans-serif';
      el.style.fontSize = '12pt';
      el.style.lineHeight = '1.5';
    });

    // Cari semua elemen page-break dan ganti dengan tag khusus MSO
    const pageBreaks = clone.querySelectorAll('.page-break, [style*="page-break-before: always"]');
    pageBreaks.forEach(el => {
      const msoBreak = document.createElement('br');
      msoBreak.setAttribute('clear', 'all');
      msoBreak.setAttribute('style', 'mso-special-character:line-break;page-break-before:always');
      if (el.parentNode) {
        el.parentNode.replaceChild(msoBreak, el);
      }
    });

    const content = clone.innerHTML;

    const html = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>Rencana Pembelajaran Mendalam</title>
      <style>
        @page WordSection1 {
          size: ${paperSize === 'F4' ? '8.5in 13in' : '595.3pt 841.9pt'};
          margin: ${pageMargin === 'narrow' ? '36.0pt 36.0pt 36.0pt 36.0pt' : pageMargin === 'wide' ? '72.0pt 72.0pt 72.0pt 72.0pt' : '56.7pt 56.7pt 56.7pt 56.7pt'};
          mso-header-margin: 35.4pt;
          mso-footer-margin: 35.4pt;
          mso-paper-source: 0;
        }
        div.WordSection1 { page: WordSection1; }
        body { font-family: 'Arial', sans-serif; font-size: 12pt; line-height: 1.5; text-align: justify; color: black; }
        p, li { margin-top: 0pt; margin-bottom: 8pt; text-align: justify; font-family: 'Arial', sans-serif; font-size: 12pt; }
        ul, ol { margin-top: 0pt; margin-bottom: 16pt; text-align: justify; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 16pt; border: 1px solid black; page-break-inside: avoid; font-family: 'Arial', sans-serif; font-size: 12pt; }
        tr { page-break-inside: avoid; page-break-after: auto; }
        th, td { border: 1px solid black; padding: 8px; text-align: left; vertical-align: top; }
        .no-border, .no-border th, .no-border td { border: none !important; }
        h3 { background-color: #87CEEB; border: 1px solid #000; padding: 8px; text-align: center; margin-top: 24pt; margin-bottom: 16pt; font-size: 14pt; font-family: 'Arial', sans-serif; page-break-after: avoid; }
        h4 { font-size: 12pt; margin-top: 16pt; margin-bottom: 8pt; page-break-after: avoid; font-family: 'Arial', sans-serif; font-weight: bold; }
        h1, h2, h5, h6 { page-break-after: avoid; font-family: 'Arial', sans-serif; }
      </style>
    </head>
    <body>
      <div class="WordSection1">
        ${content}
      </div>
    </body>
    </html>`;

    try {
      const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `RPM_${topic.join('_').replace(/\s+/g, '_')}.doc`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error generating .doc:", error);
      alert("Gagal mengunduh file Word. Silakan coba lagi.");
    }
  };

  const handleDownloadPDF = async (contentToDownload?: string) => {
    const htmlContent = contentToDownload || generatedRPM;
    if (!htmlContent) return;
    
    // Create a styled HTML string for PDF rendering
    const pdfHtml = `
      <div class="markdown-body" style="font-family: Arial, sans-serif; color: black; font-size: 12pt; line-height: 1.5; text-align: justify;">
        <style>
          h3 { background-color: #87CEEB; border: 1px solid black; padding: 8px; text-align: center; margin-top: 24px; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 16px; border: 1px solid black; }
          th, td { border: 1px solid black; padding: 8px; vertical-align: top; }
          img { max-width: 100%; height: auto; }
        </style>
        ${htmlContent}
      </div>
    `;
    
    const marginVal = pageMargin === 'narrow' ? 12.7 : pageMargin === 'wide' ? 25.4 : 20;
    
    const opt = {
      margin:       marginVal,
      filename:     `RPM_${subject}_${grade}.pdf`,
      image:        { type: 'jpeg' as const, quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
      jsPDF:        { unit: 'mm', format: paperSize.toLowerCase(), orientation: orientation as 'portrait' | 'landscape' },
      pagebreak:    { mode: ['css', 'legacy', 'avoid-all'] }
    };

    try {
      await html2pdf().set(opt).from(pdfHtml).save();
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Gagal mengunduh PDF. Silakan coba lagi.");
    }
  };

  const joditConfig = React.useMemo(() => ({
    readonly: false,
    toolbar: true,
    height: 'auto',
    minHeight: 600,
    style: {
      fontFamily: 'Arial, sans-serif',
      fontSize: '12pt',
      textAlign: 'justify',
      color: 'black'
    },
    uploader: {
      insertImageAsBase64URI: true
    }
  }), []);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans print:bg-white">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-100 p-2 rounded-lg text-emerald-700">
              <BookOpen className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-stone-800">RPM Generator</h1>
          </div>
          <div className="text-sm text-stone-500 font-medium">
            Rencana Pembelajaran Mendalam
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Form Section */}
        <div className="lg:col-span-4 space-y-6 print:hidden lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pr-2 pb-8">
          <form onSubmit={handleGenerate} className="space-y-6">
            
            {/* Identitas Section */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-stone-800">
                  <Settings2 className="w-5 h-5 text-emerald-600" />
                  Identitas
                </h2>
                <button
                  type="button"
                  onClick={saveToProfile}
                  disabled={isSavingProfile || isProfileLoading}
                  className="text-xs font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isSavingProfile ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Simpan ke Profil
                </button>
              </div>

              {profileMessage && (
                <div className={`mb-4 p-2 text-xs rounded-lg animate-in fade-in slide-in-from-top-1 duration-300 ${
                  profileMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'
                }`}>
                  {profileMessage.text}
                </div>
              )}
              
              {isProfileLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-stone-300" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Instansi / Sekolah</label>
                    <input
                      type="text"
                      value={school}
                      onChange={(e) => setSchool(e.target.value)}
                      placeholder="Nama Sekolah"
                      className="w-full px-3 py-2 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1">Kepala Sekolah</label>
                      <input
                        type="text"
                        value={kepsek}
                        onChange={(e) => setKepsek(e.target.value)}
                        placeholder="Nama Kepsek"
                        className="w-full px-3 py-2 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1">NIP Kepsek</label>
                      <input
                        type="text"
                        value={nipKepsek}
                        onChange={(e) => setNipKepsek(e.target.value)}
                        placeholder="NIP Kepsek"
                        className="w-full px-3 py-2 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1">Nama Penyusun</label>
                      <input
                        type="text"
                        value={author}
                        onChange={(e) => setAuthor(e.target.value)}
                        placeholder="Nama Guru"
                        className="w-full px-3 py-2 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1">NIP Penyusun</label>
                      <input
                        type="text"
                        value={nipGuru}
                        onChange={(e) => setNipGuru(e.target.value)}
                        placeholder="NIP Guru"
                        className="w-full px-3 py-2 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1">Tempat</label>
                      <input
                        type="text"
                        value={tempat}
                        onChange={(e) => setTempat(e.target.value)}
                        placeholder="Contoh: Solok"
                        className="w-full px-3 py-2 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1">Tanggal</label>
                      <input
                        type="date"
                        value={tanggal}
                        onChange={(e) => setTanggal(e.target.value)}
                        className="w-full px-3 py-2 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Mode Generation Tabs */}
            <div className="bg-white p-1 rounded-xl shadow-sm border border-stone-200 flex gap-1 relative z-0">
              <button
                type="button"
                onClick={() => setGenerationMode('harian')}
                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                  generationMode === 'harian' 
                    ? 'bg-emerald-50 text-emerald-700 shadow-sm ring-1 ring-emerald-200/50' 
                    : 'text-stone-500 hover:text-stone-700 hover:bg-stone-50'
                }`}
              >
                <FileText className="w-4 h-4" />
                Mode Harian (1 Pertemuan)
              </button>
              <button
                type="button"
                onClick={() => setGenerationMode('bab')}
                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                  generationMode === 'bab' 
                    ? 'bg-emerald-50 text-emerald-700 shadow-sm ring-1 ring-emerald-200/50' 
                    : 'text-stone-500 hover:text-stone-700 hover:bg-stone-50'
                }`}
              >
                <Layers className="w-4 h-4" />
                Mode Modul Utuh (1 Bab)
              </button>
            </div>

            {/* Sasaran Section */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-stone-800">
                <BookOpen className="w-5 h-5 text-emerald-600" />
                Sasaran
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Jenjang *</label>
                  <select
                    value={jenjang}
                    onChange={(e) => {
                      const newJenjang = e.target.value;
                      setJenjang(newJenjang);
                      // Auto select first class of the jenjang
                      const firstClass = newJenjang === 'SD' ? 'Kelas 1' : newJenjang === 'SMP' ? 'Kelas 7' : 'Kelas 10';
                      setGrade(firstClass);
                      setFase(newJenjang === 'SD' ? 'Fase A' : newJenjang === 'SMP' ? 'Fase D' : 'Fase E');
                    }}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all bg-white"
                    required
                  >
                    <option value="SD">SD/MI</option>
                    <option value="SMP">SMP/MTs</option>
                    <option value="SMA">SMA/MA</option>
                    <option value="SMK">SMK/MAK</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Kelas *</label>
                  <select
                    value={grade}
                    onChange={(e) => {
                      const newGrade = e.target.value;
                      setGrade(newGrade);
                      // Auto calculate Fase
                      if (['Kelas 1', 'Kelas 2'].includes(newGrade)) setFase('Fase A');
                      else if (['Kelas 3', 'Kelas 4'].includes(newGrade)) setFase('Fase B');
                      else if (['Kelas 5', 'Kelas 6'].includes(newGrade)) setFase('Fase C');
                      else if (['Kelas 7', 'Kelas 8', 'Kelas 9'].includes(newGrade)) setFase('Fase D');
                      else if (['Kelas 10'].includes(newGrade)) setFase('Fase E');
                      else if (['Kelas 11', 'Kelas 12'].includes(newGrade)) setFase('Fase F');
                    }}
                    className="w-full px-3 py-2 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all bg-white"
                    required
                  >
                    {jenjang === 'SD' && ['Kelas 1', 'Kelas 2', 'Kelas 3', 'Kelas 4', 'Kelas 5', 'Kelas 6'].map(c => <option key={c} value={c}>{c}</option>)}
                    {jenjang === 'SMP' && ['Kelas 7', 'Kelas 8', 'Kelas 9'].map(c => <option key={c} value={c}>{c}</option>)}
                    {(jenjang === 'SMA' || jenjang === 'SMK') && ['Kelas 10', 'Kelas 11', 'Kelas 12'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <p className="text-xs text-emerald-600 mt-1 font-medium">Otomatis: {fase}</p>
                </div>
              </div>
            </div>

            {/* Konten Section */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-stone-800">
                <FileText className="w-5 h-5 text-emerald-600" />
                Konten
              </h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Mata Pelajaran *</label>
                    <select
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="w-full px-3 py-2 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all bg-white"
                      required
                    >
                      {JENJANG_DATA[jenjang]?.mapels.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                      <option value="Lainnya">Lainnya...</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Alokasi Waktu</label>
                    <input
                      type="text"
                      value={timeAllocation}
                      onChange={(e) => setTimeAllocation(e.target.value)}
                      placeholder="Contoh: 2 x 35 Menit"
                      className="w-full px-3 py-2 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    />
                  </div>
                </div>

                {subject === 'Lainnya' && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="block text-sm font-medium text-stone-700 mb-1">Tulis Mata Pelajaran *</label>
                    <input
                      type="text"
                      autoFocus
                      value={customSubject}
                      onChange={(e) => setCustomSubject(e.target.value)}
                      placeholder="Masukkan nama mata pelajaran"
                      className="w-full px-3 py-2 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                      required
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Bab / Tema</label>
                    {isLoadingBabs ? (
                      <div className="w-full px-3 py-2 border border-stone-300 rounded-xl bg-stone-50 flex items-center gap-2 text-stone-500 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>AI sedang menyusun daftar bab...</span>
                      </div>
                    ) : (suggestedBabs.length > 0 && !isManualBab) ? (
                      <select
                        value={bab}
                        onChange={(e) => {
                          if (e.target.value === 'MANUAL_INPUT') {
                            setIsManualBab(true);
                            setBab('');
                          } else {
                            setBab(e.target.value);
                          }
                        }}
                        className="w-full px-3 py-2 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all bg-white text-sm"
                      >
                        {suggestedBabs.map((b, i) => (
                          <option key={i} value={b}>{b}</option>
                        ))}
                        <option value="MANUAL_INPUT" className="font-semibold text-emerald-600">➕ Lainnya (Ketik Manual)</option>
                      </select>
                    ) : (
                      <div className="relative">
                        <input
                          type="text"
                          value={bab}
                          onChange={(e) => setBab(e.target.value)}
                          placeholder="Contoh: Bab 1 - Pancasila"
                          className="w-full px-3 py-2 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                        />
                        {suggestedBabs.length > 0 && (
                          <button 
                            type="button"
                            onClick={() => {
                              setIsManualBab(false);
                              setBab(suggestedBabs[0]);
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-emerald-600 hover:text-emerald-700 font-medium bg-emerald-50 px-2 py-1 rounded-md"
                          >
                            Kembali ke Saran AI
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Topik / Materi *</label>
                    {isLoadingTopics ? (
                      <div className="w-full px-3 py-2 border border-stone-300 rounded-xl bg-stone-50 flex items-center gap-2 text-stone-500 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>AI sedang menyusun daftar topik...</span>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {topic.map((t, i) => (
                            <div key={i} className="flex items-center gap-1 bg-emerald-100 text-emerald-800 px-3 py-1.5 rounded-full text-sm">
                              <span>{t}</span>
                              <button
                                type="button"
                                onClick={() => setTopic(topic.filter((_, index) => index !== i))}
                                className="hover:bg-emerald-200 rounded-full p-0.5 transition-colors"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                        
                        {!isManualTopic && suggestedTopics.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {suggestedTopics.filter(t => !topic.includes(t)).map((t, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => setTopic([...topic, t])}
                                className="text-xs bg-stone-100 hover:bg-stone-200 text-stone-700 px-3 py-1.5 rounded-full transition-colors border border-stone-200"
                              >
                                + {t}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => setIsManualTopic(true)}
                              className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-full transition-colors border border-emerald-200 font-medium"
                            >
                              + Lainnya (Ketik Manual)
                            </button>
                          </div>
                        )}

                        {(isManualTopic || suggestedTopics.length === 0) && (
                          <div className="relative flex gap-2">
                            <input
                              type="text"
                              value={topicInput}
                              onChange={(e) => setTopicInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && topicInput.trim()) {
                                  e.preventDefault();
                                  if (!topic.includes(topicInput.trim())) {
                                    setTopic([...topic, topicInput.trim()]);
                                  }
                                  setTopicInput('');
                                }
                              }}
                              placeholder="Ketik topik lalu tekan Enter..."
                              className="flex-1 px-3 py-2 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (topicInput.trim() && !topic.includes(topicInput.trim())) {
                                  setTopic([...topic, topicInput.trim()]);
                                  setTopicInput('');
                                }
                              }}
                              className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors text-sm font-medium"
                            >
                              Tambah
                            </button>
                            {suggestedTopics.length > 0 && (
                              <button 
                                type="button"
                                onClick={() => setIsManualTopic(false)}
                                className="absolute right-24 top-1/2 -translate-y-1/2 text-xs text-emerald-600 hover:text-emerald-700 font-medium bg-emerald-50 px-2 py-1 rounded-md"
                              >
                                Kembali ke Saran AI
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                
                {generationMode === 'bab' && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300 bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
                    <label className="block text-sm font-medium text-emerald-800 mb-1">Jumlah Pertemuan *</label>
                    <div className="flex gap-2">
                      <select
                        value={jumlahPertemuan > 5 ? 'Lainnya' : jumlahPertemuan}
                        onChange={(e) => {
                          if (e.target.value === 'Lainnya') {
                            setJumlahPertemuan(6); // Default to 6 when 'Lainnya' is selected
                          } else {
                            setJumlahPertemuan(Number(e.target.value));
                          }
                        }}
                        className="w-full px-3 py-2 border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all bg-white"
                      >
                        <option value={2}>2 Pertemuan</option>
                        <option value={3}>3 Pertemuan</option>
                        <option value={4}>4 Pertemuan</option>
                        <option value={5}>5 Pertemuan</option>
                        <option value="Lainnya">Lainnya...</option>
                      </select>
                      {jumlahPertemuan > 5 && (
                        <input
                          type="number"
                          min="6"
                          max="20"
                          value={jumlahPertemuan}
                          onChange={(e) => setJumlahPertemuan(Number(e.target.value))}
                          className="w-24 px-3 py-2 border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all bg-white"
                        />
                      )}
                    </div>
                    <p className="text-xs text-emerald-600 mt-2">
                      Sistem akan memanggil AI berkali-kali untuk menyusun materi per pertemuan secara detail. Proses ini akan memakan waktu sekitar 1 menit.
                      {jumlahPertemuan > 5 && " Peringatan: Jumlah pertemuan yang banyak dapat memakan waktu lebih lama dan berisiko gagal."}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Lampiran Section */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-stone-800">
                <FileText className="w-5 h-5 text-emerald-600" />
                Lampiran
              </h2>
              
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="includeMateri"
                    checked={includeMateri}
                    onChange={(e) => setIncludeMateri(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 border-stone-300 rounded focus:ring-emerald-500"
                  />
                  <label htmlFor="includeMateri" className="text-sm font-medium text-stone-700 cursor-pointer">
                    1. Materi Ajar
                  </label>
                </div>
                
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="includeLKPD"
                    checked={includeLKPD}
                    onChange={(e) => setIncludeLKPD(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 border-stone-300 rounded focus:ring-emerald-500"
                  />
                  <label htmlFor="includeLKPD" className="text-sm font-medium text-stone-700 cursor-pointer">
                    2. LKPD
                  </label>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="includeAsesmen"
                      checked={includeAsesmen}
                      onChange={(e) => setIncludeAsesmen(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 border-stone-300 rounded focus:ring-emerald-500"
                    />
                    <label htmlFor="includeAsesmen" className="text-sm font-medium text-stone-700 cursor-pointer">
                      3. Asesmen
                    </label>
                  </div>
                  
                  {includeAsesmen && (
                    <div className="ml-6 p-4 bg-stone-50 rounded-xl border border-stone-200 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-stone-700 mb-1">Tipe Asesmen</label>
                          <select
                            value={asesmenType}
                            onChange={(e) => setAsesmenType(e.target.value)}
                            className="w-full px-3 py-2 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all bg-white"
                          >
                            <option value="Formatif">Formatif</option>
                            <option value="Sumatif">Sumatif</option>
                            <option value="Diagnostik">Diagnostik</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-stone-700 mb-1">Jumlah Soal</label>
                          <input
                            type="number"
                            min="1"
                            max="50"
                            value={asesmenCount}
                            onChange={(e) => setAsesmenCount(parseInt(e.target.value) || 1)}
                            className="w-full px-3 py-2 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                          />
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-stone-700 mb-2">Pilihan Tipe Soal</label>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="pg"
                              checked={asesmenQuestionTypes.pilihanGanda}
                              onChange={(e) => setAsesmenQuestionTypes({...asesmenQuestionTypes, pilihanGanda: e.target.checked})}
                              className="w-4 h-4 text-emerald-600 border-stone-300 rounded focus:ring-emerald-500"
                            />
                            <label htmlFor="pg" className="text-sm text-stone-600 cursor-pointer">Pilihan Ganda</label>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="pgk"
                              checked={asesmenQuestionTypes.pgKompleks}
                              onChange={(e) => setAsesmenQuestionTypes({...asesmenQuestionTypes, pgKompleks: e.target.checked})}
                              className="w-4 h-4 text-emerald-600 border-stone-300 rounded focus:ring-emerald-500"
                            />
                            <label htmlFor="pgk" className="text-sm text-stone-600 cursor-pointer">PG Kompleks</label>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="isian"
                              checked={asesmenQuestionTypes.isian}
                              onChange={(e) => setAsesmenQuestionTypes({...asesmenQuestionTypes, isian: e.target.checked})}
                              className="w-4 h-4 text-emerald-600 border-stone-300 rounded focus:ring-emerald-500"
                            />
                            <label htmlFor="isian" className="text-sm text-stone-600 cursor-pointer">Isian</label>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="uraian"
                              checked={asesmenQuestionTypes.uraian}
                              onChange={(e) => setAsesmenQuestionTypes({...asesmenQuestionTypes, uraian: e.target.checked})}
                              className="w-4 h-4 text-emerald-600 border-stone-300 rounded focus:ring-emerald-500"
                            />
                            <label htmlFor="uraian" className="text-sm text-stone-600 cursor-pointer">Uraian</label>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="menjodohkan"
                              checked={asesmenQuestionTypes.menjodohkan}
                              onChange={(e) => setAsesmenQuestionTypes({...asesmenQuestionTypes, menjodohkan: e.target.checked})}
                              className="w-4 h-4 text-emerald-600 border-stone-300 rounded focus:ring-emerald-500"
                            />
                            <label htmlFor="menjodohkan" className="text-sm text-stone-600 cursor-pointer">Menjodohkan</label>
                          </div>
                        </div>
                      </div>
                      
                      <div className="pt-2 border-t border-stone-200">
                        <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-stone-200">
                          <div className="flex flex-col">
                            <label htmlFor="withImages" className="text-sm font-medium text-stone-700 cursor-pointer">
                              Sertakan Gambar AI?
                            </label>
                            <span className="text-[10px] text-stone-400">Ilustrasi otomatis (Random)</span>
                          </div>
                          <input
                            type="checkbox"
                            id="withImages"
                            checked={asesmenWithImages}
                            onChange={(e) => setAsesmenWithImages(e.target.checked)}
                            className="w-5 h-5 text-emerald-600 border-stone-300 rounded focus:ring-emerald-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isGenerating}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-sm"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {generationMode === 'bab' ? 'Menyusun Modul...' : 'Menyusun RPM...'}
                </>
              ) : (
                generationMode === 'bab' ? 'Buat Modul Utuh (1 Bab)' : 'Buat Rencana Pembelajaran'
              )}
            </button>
          </form>
        </div>

        {/* Output Section */}
        <div className="lg:col-span-8">
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 min-h-[600px] flex flex-col print:border-none print:shadow-none">
            {/* Toolbar */}
            <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-white rounded-t-2xl sticky top-0 z-10 shadow-sm print:hidden">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 border border-emerald-100">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="flex flex-col">
                  <h2 className="font-semibold text-stone-800">Preview Dokumen</h2>
                  {generatedRPM ? (
                    <span className="text-xs font-medium text-emerald-600">
                      Siap Diunduh
                    </span>
                  ) : (
                    <span className="text-xs text-stone-500">Draft Rencana Pembelajaran</span>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {generatedRPM && (
                  <div className="flex items-center bg-stone-50 border border-stone-200 rounded-lg px-1 py-1 mr-2">
                    <button
                      onClick={() => setZoom(prev => Math.max(prev - 10, 50))}
                      className="p-1.5 hover:bg-white hover:shadow-sm rounded transition-all"
                      title="Zoom Out"
                    >
                      <ZoomOut className="w-4 h-4 text-stone-600" />
                    </button>
                    <span className="text-xs font-medium text-stone-600 min-w-[3rem] text-center">
                      {zoom}%
                    </span>
                    <button
                      onClick={() => setZoom(prev => Math.min(prev + 10, 200))}
                      className="p-1.5 hover:bg-white hover:shadow-sm rounded transition-all"
                      title="Zoom In"
                    >
                      <ZoomIn className="w-4 h-4 text-stone-600" />
                    </button>
                    <div className="w-px h-4 bg-stone-200 mx-1" />
                    <button
                      onClick={() => setZoom(100)}
                      className="p-1.5 hover:bg-white hover:shadow-sm rounded transition-all"
                      title="Reset Zoom"
                    >
                      <Maximize className="w-4 h-4 text-stone-600" />
                    </button>
                    <div className="w-px h-4 bg-stone-200 mx-1" />
                    <div className="relative">
                      <button
                        onClick={() => setShowPageSetup(!showPageSetup)}
                        className="p-1.5 hover:bg-white hover:shadow-sm rounded transition-all flex items-center gap-1"
                        title="Pengaturan Kertas"
                      >
                        <Settings2 className="w-4 h-4 text-stone-600" />
                      </button>
                      
                      {showPageSetup && (
                        <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-stone-200 rounded-xl shadow-xl z-30 p-4 text-left">
                          <h3 className="font-semibold text-sm mb-3 text-stone-800">Pengaturan Kertas</h3>
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs text-stone-500 mb-1">Ukuran</label>
                              <select value={paperSize} onChange={(e) => setPaperSize(e.target.value)} className="w-full text-sm border rounded p-1.5 focus:ring-2 focus:ring-emerald-500 outline-none">
                                <option value="A4">A4 (210 x 297 mm)</option>
                                <option value="F4">F4 / Folio (210 x 330 mm)</option>
                                <option value="Letter">Letter (215.9 x 279.4 mm)</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-stone-500 mb-1">Orientasi</label>
                              <select value={orientation} onChange={(e) => setOrientation(e.target.value)} className="w-full text-sm border rounded p-1.5 focus:ring-2 focus:ring-emerald-500 outline-none">
                                <option value="portrait">Potret (Portrait)</option>
                                <option value="landscape">Lanskap (Landscape)</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-stone-500 mb-1">Margin</label>
                              <select value={pageMargin} onChange={(e) => setPageMargin(e.target.value)} className="w-full text-sm border rounded p-1.5 focus:ring-2 focus:ring-emerald-500 outline-none">
                                <option value="normal">Normal (20 mm)</option>
                                <option value="narrow">Sempit (12.7 mm)</option>
                                <option value="wide">Lebar (25.4 mm)</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <button
                  onClick={handleCopy}
                  disabled={!generatedRPM}
                  className="p-2 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium"
                  title="Salin ke Clipboard"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  <span className="hidden sm:inline">{copied ? 'Tersalin' : 'Salin'}</span>
                </button>
                <button
                  onClick={handlePrint}
                  disabled={!generatedRPM}
                  className="p-2 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium"
                  title="Cetak Dokumen"
                >
                  <Printer className="w-4 h-4" />
                  <span className="hidden sm:inline">Cetak</span>
                </button>
                
                <div className="w-px h-6 bg-stone-200 mx-1 hidden sm:block" />

                {generatedRPM && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDownloadPDF()}
                      className="flex items-center gap-2 px-3 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors font-medium text-sm shadow-sm"
                      title="Unduh PDF"
                    >
                      <FileText className="w-4 h-4" />
                      <span className="hidden md:inline">PDF</span>
                    </button>
                    <button
                      onClick={() => handleDownloadWord()}
                      className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm shadow-sm"
                      title="Unduh Word (.doc)"
                    >
                      <FileText className="w-4 h-4" />
                      <span className="hidden md:inline">Word (.doc)</span>
                    </button>

                    <div className="w-px h-6 bg-stone-200 mx-1 hidden sm:block" />

                    <div className="flex items-center gap-1 bg-emerald-50 p-1 rounded-lg border border-emerald-100">
                      <button
                        onClick={() => handleSaveToHistory('pdf')}
                        disabled={isSavingToHistory}
                        className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors font-medium text-xs shadow-sm disabled:opacity-50"
                        title="Simpan PDF ke Riwayat"
                      >
                        {isSavingToHistory ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        <span className="hidden lg:inline">Simpan PDF</span>
                      </button>
                      <button
                        onClick={() => handleSaveToHistory('doc')}
                        disabled={isSavingToHistory}
                        className="flex items-center gap-2 px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-md hover:bg-emerald-200 transition-colors font-medium text-xs disabled:opacity-50"
                        title="Simpan Word ke Riwayat"
                      >
                        {isSavingToHistory ? <Loader2 className="w-3 h-3 animate-spin" /> : <History className="w-3 h-3" />}
                        <span className="hidden lg:inline">Simpan Word</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto bg-zinc-800 rounded-b-2xl print:bg-white print:overflow-visible flex justify-center p-8">
              {isGenerating ? (
                <div className="h-full min-h-[600px] w-full max-w-4xl bg-white rounded-xl shadow-sm border border-stone-200 flex flex-col items-center justify-center text-stone-400 space-y-6">
                  <div className="relative w-24 h-24 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle
                        cx="48"
                        cy="48"
                        r="40"
                        stroke="currentColor"
                        strokeWidth="8"
                        fill="transparent"
                        className="text-stone-100"
                      />
                      <circle
                        cx="48"
                        cy="48"
                        r="40"
                        stroke="currentColor"
                        strokeWidth="8"
                        fill="transparent"
                        strokeDasharray={251.2}
                        strokeDashoffset={251.2 - (251.2 * progress) / 100}
                        className="text-emerald-500 transition-all duration-500 ease-out"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-3xl">
                      {loadingEmote}
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-medium text-stone-700 mb-1">
                      {progress}% Selesai
                    </p>
                    <p className="text-sm text-stone-500">
                      {generationMode === 'bab' 
                        ? 'Sistem sedang memanggil AI berkali-kali untuk menyusun materi per pertemuan. Proses ini memakan waktu sekitar 1 menit.' 
                        : 'AI sedang menyusun Rencana Pembelajaran yang bermakna...'}
                    </p>
                    {loadingStep && (
                      <p className="text-sm text-emerald-600 mt-3 font-medium animate-pulse">
                        {loadingStep}
                      </p>
                    )}
                  </div>
                </div>
              ) : generatedRPM ? (
                <div 
                  className="flex flex-col items-center pb-12"
                  style={{ 
                    transform: `scale(${zoom / 100})`,
                    transformOrigin: 'top center',
                  }}
                >
                  <style>{`
                    .preview-paper {
                      width: ${paperSize === 'A4' ? '210mm' : paperSize === 'F4' ? '210mm' : '215.9mm'};
                      min-height: ${paperSize === 'A4' ? '297mm' : paperSize === 'F4' ? '330mm' : '279.4mm'};
                      ${orientation === 'landscape' ? `
                        width: ${paperSize === 'A4' ? '297mm' : paperSize === 'F4' ? '330mm' : '279.4mm'};
                        min-height: ${paperSize === 'A4' ? '210mm' : paperSize === 'F4' ? '210mm' : '215.9mm'};
                      ` : ''}
                      background: white;
                      box-shadow: 0 10px 25px -5px rgb(0 0 0 / 0.5), 0 8px 10px -6px rgb(0 0 0 / 0.5);
                      padding: ${pageMargin === 'narrow' ? '12.7mm' : pageMargin === 'wide' ? '25.4mm' : '20mm'};
                      position: relative;
                      font-family: 'Arial', sans-serif;
                      border-radius: 4px;
                    }
                    .preview-paper .markdown-body {
                      font-family: 'Arial', sans-serif;
                      color: black;
                      line-height: 1.5;
                      text-align: justify;
                      font-size: 12pt;
                    }
                    .preview-paper .markdown-body p {
                      margin-bottom: 8pt;
                      margin-top: 0;
                      text-align: justify;
                    }
                    .preview-paper .markdown-body ol, .preview-paper .markdown-body ul {
                      text-align: justify;
                      margin-bottom: 16pt;
                      margin-top: 0;
                    }
                    .preview-paper .markdown-body p:empty {
                      display: none;
                    }
                    .preview-paper .markdown-body ol {
                      list-style-type: decimal;
                      padding-left: 2rem;
                    }
                    .preview-paper .markdown-body ul {
                      list-style-type: disc;
                      padding-left: 2rem;
                    }
                    .preview-paper .markdown-body li {
                      margin-bottom: 6px;
                      margin-top: 0;
                      text-align: justify;
                    }
                    .preview-paper .markdown-body .appendix-section,
                    .preview-paper .markdown-body .appendix-section p,
                    .preview-paper .markdown-body .appendix-section li,
                    .preview-paper .markdown-body .appendix-section h4 {
                      text-align: justify !important;
                    }
                    .preview-paper table {
                      border-collapse: collapse;
                      width: 100%;
                      margin-bottom: 1rem;
                      border: 1px solid black;
                      page-break-inside: avoid;
                    }
                    .preview-paper tr {
                      page-break-inside: avoid;
                      page-break-after: auto;
                    }
                    .preview-paper th, .preview-paper td {
                      border: 1px solid black;
                      padding: 12px;
                      text-align: left;
                      vertical-align: top;
                    }
                    .preview-paper .no-border, .preview-paper .no-border th, .preview-paper .no-border td {
                      border: none !important;
                    }
                    .preview-paper h3 {
                      background-color: #87CEEB;
                      border: 1px solid #000;
                      padding: 8px;
                      text-align: center;
                      margin-top: 24px;
                      margin-bottom: 16px;
                      font-size: 1.25rem;
                      font-weight: bold;
                      page-break-after: avoid;
                    }
                    .preview-paper h1, .preview-paper h2, .preview-paper h4, .preview-paper h5, .preview-paper h6 {
                      page-break-after: avoid;
                    }
                    @media print {
                      @page {
                        size: ${paperSize === 'A4' ? '210mm 297mm' : paperSize === 'F4' ? '210mm 330mm' : '215.9mm 279.4mm'};
                        margin: ${pageMargin === 'narrow' ? '12.7mm' : pageMargin === 'wide' ? '25.4mm' : '20mm'};
                      }
                      body {
                        background: white;
                      }
                      .preview-paper {
                        box-shadow: none;
                        padding: 0;
                        width: 100%;
                        min-height: auto;
                        margin: 0;
                        border-radius: 0;
                      }
                      .preview-paper .page-break {
                        border: none;
                        margin: 0;
                        height: 0;
                      }
                      .jodit-toolbar__box, .jodit-status-bar {
                        display: none !important;
                      }
                      .jodit-workplace {
                        border: none !important;
                      }
                      .jodit-container {
                        border: none !important;
                      }
                    }
                    .preview-paper img {
                      page-break-inside: avoid;
                    }
                    .preview-paper .page-break {
                      height: 40px;
                      background-color: #27272a;
                      margin: 20mm -20mm;
                      border-top: 1px solid #52525b;
                      border-bottom: 1px solid #52525b;
                      position: relative;
                      page-break-before: always;
                    }
                    .preview-paper .page-break::after {
                      display: none;
                    }
                  `}</style>
                  <div className="preview-paper print:shadow-none print:p-0 print:w-full">
                    <div className="markdown-body">
                      <JoditEditor
                        ref={null}
                        value={generatedRPM}
                        config={joditConfig}
                        onBlur={newContent => setGeneratedRPM(newContent)}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full min-h-[600px] w-full max-w-4xl bg-white rounded-xl shadow-sm border border-stone-200 flex flex-col items-center justify-center text-stone-400 space-y-4 p-8">
                  <div className="w-20 h-20 bg-stone-50 rounded-2xl flex items-center justify-center border border-stone-100 mb-2">
                    <FileText className="w-10 h-10 text-stone-300" />
                  </div>
                  <h3 className="text-lg font-medium text-stone-600">Belum Ada Dokumen</h3>
                  <p className="text-sm text-center max-w-sm text-stone-500">
                    Isi formulir di sebelah kiri dan klik "Buat Rencana Pembelajaran" untuk mulai menyusun dokumen Anda.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
