import React, { useState, useRef, useEffect } from 'react';
import JoditEditor from 'jodit-react';
import { marked } from 'marked';
import { motion, AnimatePresence } from 'framer-motion';
import { generateRPM, generateAIImage, suggestBabs, suggestTopics, generateRPMChained } from '../services/geminiService';
import { BookOpen, Loader2, Copy, Check, Printer, FileText, Download, Settings2, ZoomIn, ZoomOut, Maximize, ChevronDown, Layers, X, Save, History, Sparkles, ListChecks, CheckCircle2, Bot, ArrowRight } from 'lucide-react';
import { doc, runTransaction, getDoc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, auth, storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { asBlob } from 'html-docx-js-typescript';

const inlineImages = async (html: string): Promise<string> => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  const images = Array.from(tempDiv.querySelectorAll('img'));
  
  await Promise.all(images.map(async (img) => {
    try {
      // Only process external URLs
      if (img.src.startsWith('http')) {
        const response = await fetch(img.src);
        const blob = await response.blob();
        await new Promise<void>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            img.src = reader.result as string;
            resolve();
          };
          reader.readAsDataURL(blob);
        });
      }
    } catch (e) {
      console.error("Failed to inline image", e);
    }
  }));
  
  return tempDiv.innerHTML;
};

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
  const [isDownloadingWord, setIsDownloadingWord] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

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
      // Don't auto-select subject to allow step-by-step flow
      setSubject('');
      setBab('');
      setTopic([]);
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
          // Don't auto-select to make it truly step-by-step
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

  const processDocxContent = (html: string) => {
    // 1. Checkbox replacements (safe to do via regex on string)
    let processed = html.replace(/\[v\]/g, '☑').replace(/\[ \]/g, '☐');

    // 2. Parse HTML using DOMParser for robust manipulation
    const parser = new DOMParser();
    const doc = parser.parseFromString(processed, 'text/html');

    // 3. Global Spacing (1.15)
    const allElements = doc.querySelectorAll('p, td, th, li');
    allElements.forEach(el => {
      const htmlEl = el as HTMLElement;
      htmlEl.style.lineHeight = '1.15';
      if (htmlEl.tagName.toLowerCase() === 'p' || htmlEl.tagName.toLowerCase() === 'li') {
        htmlEl.style.marginBottom = '4pt';
        htmlEl.style.marginTop = '0pt';
      }
    });

    // 4. Tables Processing
    const tables = doc.querySelectorAll('table');
    tables.forEach(table => {
      const textContent = table.textContent || '';
      const isIdentity = textContent.includes('Penyusun') && textContent.includes('Instansi');
      const isDPL = textContent.includes('DPL1') || textContent.includes('Dimensi Profil Lulusan');
      const isSignature = textContent.includes('Mengetahui,') && textContent.includes('Kepala Sekolah');

      if (isIdentity || isDPL || isSignature) {
        // No borders for these specific tables
        table.setAttribute('border', '0');
        table.style.border = 'none';
        table.style.borderCollapse = 'collapse';
        table.style.width = '100%';
        table.style.marginBottom = '12pt';
        
        const cells = table.querySelectorAll('td, th');
        cells.forEach(cell => {
          const htmlCell = cell as HTMLElement;
          htmlCell.style.border = 'none';
          htmlCell.style.padding = '4px';
          htmlCell.style.verticalAlign = 'top';
        });

        if (isSignature) {
          // Anti page-break for signature
          table.style.pageBreakInside = 'avoid';
          table.style.marginTop = '24pt';
        }
      } else {
        // With borders for all other tables (like Langkah Pembelajaran, Soal, dll)
        table.setAttribute('border', '1');
        table.style.border = '1px solid black';
        table.style.borderCollapse = 'collapse';
        table.style.width = '100%';
        table.style.marginBottom = '12pt';
        
        const cells = table.querySelectorAll('td, th');
        cells.forEach(cell => {
          const htmlCell = cell as HTMLElement;
          htmlCell.style.border = '1px solid black';
          htmlCell.style.padding = '4px';
          htmlCell.style.verticalAlign = 'top';
        });
      }
    });

    // 5. Images (Strict 10x10 cm -> 378x378 px)
    const images = doc.querySelectorAll('img');
    images.forEach(img => {
      img.setAttribute('width', '378');
      img.setAttribute('height', '378');
      img.style.width = '378px';
      img.style.height = '378px';
      img.style.display = 'block';
      img.style.margin = '12pt auto';
      img.style.objectFit = 'contain';
    });

    // 6. Headings (H3)
    const h3s = doc.querySelectorAll('h3');
    h3s.forEach(h3 => {
      h3.style.backgroundColor = '#87CEEB';
      h3.style.padding = '6px';
      h3.style.textAlign = 'center';
      h3.style.border = '1px solid black';
      h3.style.marginTop = '12pt';
      h3.style.marginBottom = '6pt';
      h3.style.fontSize = '14pt';
      h3.style.fontWeight = 'bold';
    });

    // 7. Page Breaks
    // We apply page-break-before: always directly to the H3 elements.
    // LAMPIRAN and MATERI AJAR will be together because we only break before LAMPIRAN.
    h3s.forEach(h3 => {
      const text = (h3.textContent || '').toUpperCase();
      if (
        text.includes('LAMPIRAN') ||
        text.includes('LEMBAR KERJA PESERTA DIDIK') ||
        text.includes('ASESMEN') ||
        text.includes('KUNCI JAWABAN') ||
        text.includes('RUBRIK PENILAIAN')
      ) {
        h3.style.pageBreakBefore = 'always';
      }
    });

    // 8. Single Spacing for Top Section (Before DESAIN PEMBELAJARAN)
    // Iterate through body children until we hit an H3 with "DESAIN PEMBELAJARAN"
    let currentEl = doc.body.firstElementChild;
    while (currentEl) {
      if (currentEl.tagName.toLowerCase() === 'h3' && (currentEl.textContent || '').toUpperCase().includes('DESAIN PEMBELAJARAN')) {
        break; // Stop when we reach DESAIN PEMBELAJARAN
      }
      
      // Apply single spacing to this element and its children
      const applySingleSpacing = (el: Element) => {
        const htmlEl = el as HTMLElement;
        if (htmlEl.style) {
          htmlEl.style.lineHeight = '1.0';
          if (htmlEl.tagName.toLowerCase() === 'p' || htmlEl.tagName.toLowerCase() === 'li') {
            htmlEl.style.marginBottom = '0pt';
          }
        }
        Array.from(el.children).forEach(applySingleSpacing);
      };
      
      applySingleSpacing(currentEl);
      currentEl = currentEl.nextElementSibling;
    }

    return doc.body.innerHTML;
  };

  const handleSaveToHistory = async (type: 'doc' | 'pdf') => {
    if (!generatedRPM || !auth.currentUser) return;
    
    setIsSavingToHistory(true);
    try {
      let blob: Blob;
      let extension: string;
      
      if (type === 'doc') {
        extension = 'docx';
        const processedHtml = processDocxContent(generatedRPM);
        
        const docxHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>Document</title>
            <style>
              /* Base styling: Line spacing 1.15, Before: 0pt, After: 0pt */
              body { 
                font-family: Arial, sans-serif; 
                font-size: 12pt; 
                line-height: 1.15; 
                text-align: left; 
              }
              p, h1, h2, h3, h4, h5, h6 { 
                margin-top: 0pt; 
                margin-bottom: 0pt; 
              }
              
              /* Specific section styling: Single spacing (1.0) */
              .single-spacing-section, .single-spacing-section p, .single-spacing-section table, .single-spacing-section td {
                line-height: 1.0 !important;
              }
              .single-spacing-section p {
                margin-bottom: 4pt; /* Slight margin for readability even in single space */
              }

              /* Lists */
              ul, ol { margin-top: 0pt; margin-bottom: 0pt; padding-left: 24px; }
              li { margin-bottom: 0pt; line-height: 1.15; }

              /* Tables */
              table { border-collapse: collapse; width: 100%; margin-bottom: 12pt; border: 1px solid black; }
              th, td { border: 1px solid black; padding: 4px; vertical-align: top; text-align: left; }
              
              /* Headers */
              h3 { background-color: #87CEEB; padding: 6px; text-align: center; border: 1px solid black; margin-top: 12pt; margin-bottom: 6pt; }
              
              /* Images: 10cm x 10cm (approx 378px at 96dpi) */
              img { 
                width: 10cm; 
                height: 10cm; 
                object-fit: contain; 
                display: block;
                margin: 12pt auto; /* Center the image */
              }
              
              /* Page Breaks */
              .page-break { page-break-before: always; }
            </style>
          </head>
          <body>
            ${processedHtml}
          </body>
          </html>
        `;
        
        blob = await asBlob(docxHtml, { orientation: orientation as 'portrait' | 'landscape', margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }) as Blob;
      } else {
        extension = 'pdf';
        const inlinedContent = await inlineImages(generatedRPM);
        const pdfHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; color: black; font-size: 12pt; line-height: 1.15; text-align: left; }
              p, h1, h2, h3, h4, h5, h6 { margin-top: 0; margin-bottom: 0; }
              h3 { background-color: #87CEEB !important; border: 1px solid black; padding: 6px 0; text-align: center; margin: 0 0 8pt 0; line-height: 1.2; page-break-after: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              h4, h5, h6 { page-break-after: avoid; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 16px; border: 1px solid black; page-break-inside: auto; }
              tr { page-break-inside: avoid; page-break-after: auto; }
              th, td { border: 1px solid black; padding: 4px; vertical-align: top; overflow-wrap: break-word; word-wrap: break-word; text-align: left; line-height: 1.15; }
              img { max-width: 100%; max-height: 400px; object-fit: contain; page-break-inside: avoid; display: block; margin: 0 auto; }
              p { margin-top: 0; margin-bottom: 4pt; page-break-inside: avoid; }
              ul { list-style-type: disc; padding-left: 2rem; margin-top: 0; margin-bottom: 8pt; }
              ol { list-style-type: decimal; padding-left: 2rem; margin-top: 0; margin-bottom: 8pt; }
              li { margin-top: 0; margin-bottom: 4px; page-break-inside: avoid; }
              .page-break { page-break-before: always; height: 0; border: none; margin: 0; padding: 0; }
            </style>
          </head>
          <body>
            <div class="markdown-body">
              ${inlinedContent}
            </div>
          </body>
          </html>
        `;
        
        const marginVal = pageMargin === 'narrow' ? '12.7mm' : pageMargin === 'wide' ? '25.4mm' : '20mm';
        
        const response = await fetch('/api/generate-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            html: pdfHtml,
            paperSize: paperSize.toLowerCase(),
            orientation: orientation,
            margin: marginVal
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.details || errData.error || 'Failed to generate PDF');
        }
        
        blob = await response.blob();
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
    
    setIsDownloadingWord(true);
    try {
      const processedHtml = processDocxContent(htmlContent);
      
      const docxHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Document</title>
          <style>
            /* Base styling: Line spacing 1.15, Before: 0pt, After: 0pt */
            body { 
              font-family: Arial, sans-serif; 
              font-size: 12pt; 
              line-height: 1.15; 
              text-align: left; 
            }
            p, h1, h2, h3, h4, h5, h6 { 
              margin-top: 0pt; 
              margin-bottom: 0pt; 
            }
            
            /* Specific section styling: Single spacing (1.0) */
            .single-spacing-section, .single-spacing-section p, .single-spacing-section table, .single-spacing-section td {
              line-height: 1.0 !important;
            }
            .single-spacing-section p {
              margin-bottom: 4pt; /* Slight margin for readability even in single space */
            }

            /* Lists */
            ul, ol { margin-top: 0pt; margin-bottom: 0pt; padding-left: 24px; }
            li { margin-bottom: 0pt; line-height: 1.15; }

            /* Tables */
            table { border-collapse: collapse; width: 100%; margin-bottom: 12pt; border: 1px solid black; }
            th, td { border: 1px solid black; padding: 4px; vertical-align: top; text-align: left; }
            
            /* Headers */
            h3 { background-color: #87CEEB; padding: 6px; text-align: center; border: 1px solid black; margin-top: 12pt; margin-bottom: 6pt; }
            
            /* Images: 10cm x 10cm (approx 378px at 96dpi) */
            img { 
              width: 10cm; 
              height: 10cm; 
              object-fit: contain; 
              display: block;
              margin: 12pt auto; /* Center the image */
            }
            
            /* Page Breaks */
            .page-break { page-break-before: always; }
          </style>
        </head>
        <body>
          ${processedHtml}
        </body>
        </html>
      `;

      // Use html-docx-js-typescript in the browser
      const blob = await asBlob(docxHtml, { orientation: orientation as 'portrait' | 'landscape', margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }) as Blob;
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `RPM_${subject}_${grade}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error("Error generating .docx:", error);
      alert("Gagal mengunduh file Word: " + (error.message || "Terjadi kesalahan."));
    } finally {
      setIsDownloadingWord(false);
      setShowDownloadMenu(false);
    }
  };

  const handleDownloadPDF = async (contentToDownload?: string) => {
    const htmlContent = contentToDownload || generatedRPM;
    if (!htmlContent) return;
    
    const inlinedContent = await inlineImages(htmlContent);
    
    // Create a styled HTML string for PDF rendering
    const pdfHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, Helvetica, sans-serif; color: black; font-size: 12pt; line-height: 1.15; text-align: left; }
          p, h1, h2, h3, h4, h5, h6 { margin-top: 0; margin-bottom: 0; }
          h3 { background-color: #87CEEB !important; border: 1px solid black; padding: 6px 0; text-align: center; margin: 0 0 8pt 0; line-height: 1.2; page-break-after: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          h4, h5, h6 { page-break-after: avoid; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 16px; border: 1px solid black; page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          th, td { border: 1px solid black; padding: 4px; vertical-align: top; overflow-wrap: break-word; word-wrap: break-word; text-align: left; line-height: 1.15; }
          img { max-width: 100%; max-height: 400px; object-fit: contain; page-break-inside: avoid; display: block; margin: 0 auto; }
          p { margin-top: 0; margin-bottom: 4pt; page-break-inside: avoid; }
          ul { list-style-type: disc; padding-left: 2rem; margin-top: 0; margin-bottom: 8pt; }
          ol { list-style-type: decimal; padding-left: 2rem; margin-top: 0; margin-bottom: 8pt; }
          li { margin-top: 0; margin-bottom: 4px; page-break-inside: avoid; }
          .page-break { page-break-before: always; height: 0; border: none; margin: 0; padding: 0; }
        </style>
      </head>
      <body>
        <div class="markdown-body">
          ${inlinedContent}
        </div>
      </body>
      </html>
    `;
    
    const marginVal = pageMargin === 'narrow' ? '12.7mm' : pageMargin === 'wide' ? '25.4mm' : '20mm';
    
    try {
      const response = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: pdfHtml,
          paperSize: paperSize.toLowerCase(),
          orientation: orientation,
          margin: marginVal
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.details || errData.error || 'Failed to generate PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `RPM_${subject}_${grade}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Gagal mengunduh PDF. Silakan coba lagi.");
    } finally {
      setShowDownloadMenu(false);
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
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-stone-800">
                  <FileText className="w-5 h-5 text-emerald-600" />
                  Konten Pembelajaran
                </h2>
                <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 rounded-full border border-emerald-100">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">AI Assisted</span>
                </div>
              </div>
              
              <div className="relative space-y-12">
                {/* Vertical Stepper Line */}
                <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-stone-100 -z-0" />

                {/* STEP 1: MATA PELAJARAN */}
                <div className="relative pl-12">
                  <div className={`absolute left-0 top-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm z-10 transition-all duration-500 ${subject ? 'bg-emerald-600 text-white scale-110' : 'bg-white border-2 border-emerald-500 text-emerald-600'}`}>
                    {subject ? <CheckCircle2 className="w-5 h-5" /> : '1'}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-stone-400" />
                        <label className="text-sm font-bold text-stone-700">Mata Pelajaran *</label>
                      </div>
                      <select
                        value={subject}
                        onChange={(e) => {
                          setSubject(e.target.value);
                          setBab(''); // Reset bab when subject changes
                          setTopic([]); // Reset topic when subject changes
                          setSuggestedBabs([]); // Clear suggestions
                          setSuggestedTopics([]); // Clear suggestions
                        }}
                        className="w-full px-4 py-3 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all bg-white shadow-sm font-medium"
                        required
                      >
                        <option value="" disabled>-- Pilih Mata Pelajaran --</option>
                        {JENJANG_DATA[jenjang]?.mapels.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                        <option value="Lainnya">Lainnya...</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <History className="w-4 h-4 text-stone-400" />
                        <label className="text-sm font-bold text-stone-700">Alokasi Waktu</label>
                      </div>
                      <input
                        type="text"
                        value={timeAllocation}
                        onChange={(e) => setTimeAllocation(e.target.value)}
                        placeholder="Contoh: 2 x 35 Menit"
                        className="w-full px-4 py-3 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all shadow-sm"
                      />
                    </div>
                  </div>

                  {subject === 'Lainnya' && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-4 p-4 bg-stone-50 rounded-xl border border-stone-200"
                    >
                      <label className="block text-xs font-bold text-stone-500 mb-2 uppercase tracking-wider">Tulis Mata Pelajaran Kustom</label>
                      <input
                        type="text"
                        autoFocus
                        value={customSubject}
                        onChange={(e) => setCustomSubject(e.target.value)}
                        placeholder="Masukkan nama mata pelajaran"
                        className="w-full px-4 py-2.5 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all shadow-sm bg-white"
                        required
                      />
                    </motion.div>
                  )}
                </div>

                {/* STEP 2: BAB / TEMA */}
                <AnimatePresence mode="wait">
                  {(subject || (subject === 'Lainnya' && customSubject)) && (
                    <motion.div 
                      key="step-2"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="relative pl-12"
                    >
                      <div className={`absolute left-0 top-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm z-10 transition-all duration-500 ${bab ? 'bg-emerald-600 text-white scale-110' : 'bg-white border-2 border-emerald-500 text-emerald-600'}`}>
                        {bab ? <CheckCircle2 className="w-5 h-5" /> : '2'}
                      </div>
                      
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Layers className="w-4 h-4 text-stone-400" />
                            <label className="text-sm font-bold text-stone-700">Bab / Tema Pembelajaran</label>
                          </div>
                          {isLoadingBabs && (
                            <div className="flex items-center gap-2 text-emerald-600">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span className="text-[10px] font-bold uppercase animate-pulse">AI Thinking...</span>
                            </div>
                          )}
                        </div>
                        
                        {isLoadingBabs ? (
                          <div className="grid grid-cols-1 gap-3">
                            {[1, 2, 3].map(i => (
                              <div key={i} className="h-12 bg-stone-50 rounded-xl border border-stone-100 animate-pulse flex items-center px-4 gap-3">
                                <div className="w-4 h-4 bg-stone-200 rounded-full" />
                                <div className="h-3 bg-stone-200 rounded w-2/3" />
                              </div>
                            ))}
                          </div>
                        ) : (suggestedBabs.length > 0 && !isManualBab) ? (
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {suggestedBabs.map((b, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => {
                                    setBab(b);
                                    setTopic([]); // Reset topic when bab changes
                                  }}
                                  className={`text-left px-4 py-3 rounded-xl border transition-all flex items-center justify-between group ${bab === b ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-100' : 'bg-white border-stone-200 text-stone-700 hover:border-emerald-300 hover:bg-emerald-50'}`}
                                >
                                  <span className="text-sm font-medium line-clamp-1">{b}</span>
                                  {bab === b ? <Check className="w-4 h-4 shrink-0" /> : <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />}
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={() => {
                                  setIsManualBab(true);
                                  setBab('');
                                }}
                                className="text-left px-4 py-3 rounded-xl border border-dashed border-stone-300 text-stone-500 hover:border-emerald-500 hover:text-emerald-600 transition-all flex items-center gap-2 text-sm font-bold bg-stone-50/50"
                              >
                                <X className="w-4 h-4 rotate-45" />
                                Ketik Manual...
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="relative group">
                            <input
                              type="text"
                              value={bab}
                              onChange={(e) => setBab(e.target.value)}
                              placeholder="Contoh: Bab 1 - Mengenal Lingkungan"
                              className="w-full px-4 py-3 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all shadow-sm bg-white"
                            />
                            {suggestedBabs.length > 0 && (
                              <button 
                                type="button"
                                onClick={() => setIsManualBab(false)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-emerald-600 hover:text-emerald-700 font-bold bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 transition-colors"
                              >
                                Lihat Saran AI
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* STEP 3: TOPIK / MATERI */}
                <AnimatePresence mode="wait">
                  {bab && (
                    <motion.div 
                      key="step-3"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="relative pl-12"
                    >
                      <div className={`absolute left-0 top-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm z-10 transition-all duration-500 ${topic.length > 0 ? 'bg-emerald-600 text-white scale-110' : 'bg-white border-2 border-emerald-500 text-emerald-600'}`}>
                        {topic.length > 0 ? <CheckCircle2 className="w-5 h-5" /> : '3'}
                      </div>
                      
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ListChecks className="w-4 h-4 text-stone-400" />
                            <label className="text-sm font-bold text-stone-700">Topik / Materi Spesifik *</label>
                          </div>
                          {isLoadingTopics && (
                            <div className="flex items-center gap-2 text-emerald-600">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span className="text-[10px] font-bold uppercase animate-pulse">AI Researching...</span>
                            </div>
                          )}
                        </div>
                        
                        {isLoadingTopics ? (
                          <div className="bg-emerald-50/30 p-6 rounded-2xl border border-emerald-100 flex flex-col items-center justify-center gap-4 text-center">
                            <div className="relative">
                              <Bot className="w-10 h-10 text-emerald-600 animate-bounce" />
                              <Sparkles className="w-4 h-4 text-emerald-400 absolute -top-1 -right-1 animate-pulse" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-emerald-800">AI sedang menganalisis kurikulum...</p>
                              <p className="text-xs text-emerald-600 mt-1">Menyusun daftar topik yang paling relevan untuk Anda.</p>
                            </div>
                            <div className="flex gap-1.5">
                              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-6">
                            {/* Selected Topics Chips */}
                            <div className="flex flex-wrap gap-2.5">
                              {topic.map((t, i) => (
                                <motion.div 
                                  key={i} 
                                  initial={{ scale: 0.8, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  className="flex items-center gap-2 bg-emerald-600 text-white pl-4 pr-2 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-emerald-100 group"
                                >
                                  <span>{t}</span>
                                  <button
                                    type="button"
                                    onClick={() => setTopic(topic.filter((_, index) => index !== i))}
                                    className="bg-emerald-700/50 hover:bg-emerald-800 rounded-lg p-1 transition-colors"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </motion.div>
                              ))}
                              {topic.length === 0 && (
                                <div className="text-xs text-stone-400 italic py-2">Belum ada topik yang dipilih...</div>
                              )}
                            </div>
                            
                            {/* AI Suggestions Box */}
                            {!isManualTopic && suggestedTopics.length > 0 && (
                              <div className="bg-stone-50 p-6 rounded-2xl border border-stone-200 shadow-inner relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-5">
                                  <Bot className="w-24 h-24" />
                                </div>
                                
                                <div className="flex items-center gap-2 mb-5">
                                  <Sparkles className="w-4 h-4 text-emerald-500" />
                                  <p className="text-[10px] uppercase tracking-widest font-black text-stone-400">Saran Topik dari AI</p>
                                </div>
                                
                                <div className="flex flex-wrap gap-2.5 relative z-10">
                                  {suggestedTopics.filter(t => !topic.includes(t)).map((t, i) => (
                                    <button
                                      key={i}
                                      type="button"
                                      onClick={() => setTopic([...topic, t])}
                                      className="text-xs bg-white hover:bg-emerald-600 hover:text-white hover:border-emerald-600 text-stone-600 px-4 py-3 rounded-xl transition-all border border-stone-200 shadow-sm flex items-center gap-2 group font-medium"
                                    >
                                      <span className="text-emerald-500 font-bold group-hover:text-white transition-colors">+</span> 
                                      {t}
                                    </button>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => setIsManualTopic(true)}
                                    className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-4 py-3 rounded-xl transition-all border border-emerald-200 font-black flex items-center gap-2"
                                  >
                                    <X className="w-4 h-4 rotate-45" />
                                    Ketik Manual
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Manual Input Field */}
                            {(isManualTopic || suggestedTopics.length === 0) && (
                              <div className="relative flex gap-3 animate-in slide-in-from-top-2 duration-300">
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
                                  className="flex-1 px-4 py-3 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-sm shadow-sm bg-white"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (topicInput.trim() && !topic.includes(topicInput.trim())) {
                                      setTopic([...topic, topicInput.trim()]);
                                      setTopicInput('');
                                    }
                                  }}
                                  className="px-8 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all text-sm font-bold shadow-lg shadow-emerald-100 active:scale-95"
                                >
                                  Tambah
                                </button>
                                {suggestedTopics.length > 0 && (
                                  <button 
                                    type="button"
                                    onClick={() => setIsManualTopic(false)}
                                    className="absolute right-32 top-1/2 -translate-y-1/2 text-[10px] text-stone-400 hover:text-stone-600 font-bold bg-stone-100 px-2 py-1 rounded-md border border-stone-200"
                                  >
                                    Batal
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                
                {/* Mode Bab Option (Pertemuan) */}
                <AnimatePresence mode="wait">
                  {topic.length > 0 && generationMode === 'bab' && (
                    <motion.div 
                      key="pertemuan"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="pl-12 pt-4"
                    >
                      <div className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100 shadow-sm flex items-center gap-6">
                        <div className="flex-1">
                          <label className="block text-sm font-bold text-emerald-800 mb-2">Jumlah Pertemuan *</label>
                          <div className="flex gap-3">
                            <select
                              value={jumlahPertemuan > 5 ? 'Lainnya' : jumlahPertemuan}
                              onChange={(e) => {
                                if (e.target.value === 'Lainnya') {
                                  setJumlahPertemuan(6);
                                } else {
                                  setJumlahPertemuan(Number(e.target.value));
                                }
                              }}
                              className="flex-1 px-4 py-2.5 border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none bg-white text-sm font-medium"
                            >
                              {[1, 2, 3, 4, 5].map(n => (
                                <option key={n} value={n}>{n} Pertemuan</option>
                              ))}
                              <option value="Lainnya">Lainnya...</option>
                            </select>
                            
                            {jumlahPertemuan > 5 && (
                              <input
                                type="number"
                                min="1"
                                max="20"
                                value={jumlahPertemuan}
                                onChange={(e) => setJumlahPertemuan(Number(e.target.value))}
                                className="w-24 px-4 py-2.5 border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none bg-white text-sm font-medium"
                              />
                            )}
                          </div>
                        </div>
                        <div className="hidden sm:block">
                          <div className="w-16 h-16 bg-white rounded-2xl border border-emerald-100 flex items-center justify-center shadow-sm">
                            <History className="w-8 h-8 text-emerald-600 opacity-20" />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
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
                    <div className="relative">
                      <button
                        onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                        disabled={isDownloadingWord}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium text-sm shadow-sm disabled:opacity-70"
                        title="Unduh Dokumen"
                      >
                        {isDownloadingWord ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        <span className="hidden md:inline">{isDownloadingWord ? 'Memproses...' : 'Unduh Dokumen'}</span>
                        <ChevronDown className="w-4 h-4 ml-1" />
                      </button>

                      {showDownloadMenu && (
                        <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-stone-200 rounded-xl shadow-xl z-30 overflow-hidden">
                          <button
                            onClick={() => handleDownloadWord()}
                            className="w-full text-left px-4 py-3 hover:bg-stone-50 flex items-center gap-3 text-sm font-medium text-stone-700 border-b border-stone-100"
                          >
                            <div className="w-8 h-8 rounded bg-blue-100 text-blue-600 flex items-center justify-center">
                              <FileText className="w-4 h-4" />
                            </div>
                            Word (.docx)
                          </button>
                          <button
                            onClick={() => handleDownloadPDF()}
                            className="w-full text-left px-4 py-3 hover:bg-stone-50 flex items-center gap-3 text-sm font-medium text-stone-700"
                          >
                            <div className="w-8 h-8 rounded bg-rose-100 text-rose-600 flex items-center justify-center">
                              <FileText className="w-4 h-4" />
                            </div>
                            PDF (.pdf)
                          </button>
                        </div>
                      )}
                    </div>

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
                      line-height: 1.15;
                      text-align: left;
                      font-size: 12pt;
                    }
                    .preview-paper .markdown-body p {
                      margin-bottom: 4pt;
                      margin-top: 0;
                      text-align: left;
                    }
                    .preview-paper .markdown-body ol, .preview-paper .markdown-body ul {
                      text-align: left;
                      margin-bottom: 8pt;
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
                      margin-bottom: 4px;
                      margin-top: 0;
                      text-align: left;
                    }
                    .preview-paper .markdown-body .appendix-section,
                    .preview-paper .markdown-body .appendix-section p,
                    .preview-paper .markdown-body .appendix-section li,
                    .preview-paper .markdown-body .appendix-section h4 {
                      text-align: left !important;
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
                      overflow-wrap: break-word;
                      word-wrap: break-word;
                    }
                    .preview-paper .no-border, .preview-paper .no-border th, .preview-paper .no-border td {
                      border: none !important;
                    }
                    .preview-paper h3 {
                      background-color: #87CEEB;
                      border: 1px solid #000;
                      padding: 6px 0;
                      text-align: center;
                      margin: 0 0 8pt 0;
                      font-size: 1.25rem;
                      font-weight: bold;
                      line-height: 1.2;
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
                      height: 24px;
                      background-color: #f3f4f6; /* Tailwind gray-100 */
                      margin: 20mm -20mm;
                      border-top: 1px dashed #d1d5db; /* Tailwind gray-300 */
                      border-bottom: 1px dashed #d1d5db;
                      box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.05);
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
