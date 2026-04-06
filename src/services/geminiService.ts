import { GoogleGenAI } from "@google/genai";
import { db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";

// Helper function to execute AI prompts with fallback logic
async function executeAIPrompt(prompt: string, sysInstruction: string = ""): Promise<string> {
  try {
    let aiProvider = 'gemini';
    let geminiKeys: string[] = [];
    let openRouterKeys: string[] = [];
    
    try {
      const settingsDoc = await getDoc(doc(db, 'settings', 'general'));
      if (settingsDoc.exists()) {
        const data = settingsDoc.data();
        if (data.aiProvider) aiProvider = data.aiProvider;
        if (data.geminiApiKeys && Array.isArray(data.geminiApiKeys)) {
          geminiKeys = data.geminiApiKeys.filter((k: string) => k.trim() !== '');
        }
        if (data.openRouterApiKeys && Array.isArray(data.openRouterApiKeys)) {
          openRouterKeys = data.openRouterApiKeys.filter((k: string) => k.trim() !== '');
        }
      }
    } catch (e) {
      console.error("Error fetching AI settings:", e);
    }

    if (geminiKeys.length === 0) {
      const envKey = globalThis.process?.env?.GEMINI_API_KEY;
      if (envKey) geminiKeys.push(envKey);
    }

    const callOpenRouter = async (key: string) => {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash", 
          messages: [
            { role: "system", content: sysInstruction },
            { role: "user", content: prompt }
          ]
        })
      });
      
      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status}`);
      }
      
      const data = await response.json();
      return data.choices?.[0]?.message?.content || "Gagal menghasilkan konten dari OpenRouter.";
    };

    const callGemini = async (key: string) => {
      const ai = new GoogleGenAI({ apiKey: key });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          systemInstruction: sysInstruction,
          temperature: 0.7,
        },
      });
      return response.text || "Gagal menghasilkan konten dari Gemini.";
    };

    const tryKeysSequentially = async (keys: string[], apiCallFn: (key: string) => Promise<string>, providerName: string) => {
      if (keys.length === 0) throw new Error(`Tidak ada API Key untuk ${providerName}.`);
      let lastError;
      for (let i = 0; i < keys.length; i++) {
        try {
          console.log(`Mencoba ${providerName} Key #${i + 1}...`);
          return await apiCallFn(keys[i]);
        } catch (error) {
          console.warn(`${providerName} Key #${i + 1} gagal:`, error);
          lastError = error;
        }
      }
      throw new Error(`Semua kunci ${providerName} gagal. Error terakhir: ${lastError}`);
    };

    if (aiProvider === 'openrouter' && openRouterKeys.length > 0) {
      try {
        return await tryKeysSequentially(openRouterKeys, callOpenRouter, 'OpenRouter');
      } catch (error) {
        console.warn("Semua OpenRouter gagal, mencoba fallback ke Gemini...", error);
        return await tryKeysSequentially(geminiKeys, callGemini, 'Gemini');
      }
    } else {
      try {
        return await tryKeysSequentially(geminiKeys, callGemini, 'Gemini');
      } catch (error) {
        console.warn("Semua Gemini gagal, mencoba fallback ke OpenRouter...", error);
        if (openRouterKeys.length > 0) {
          return await tryKeysSequentially(openRouterKeys, callOpenRouter, 'OpenRouter');
        } else {
          throw error;
        }
      }
    }
  } catch (finalError) {
    console.error("Semua AI Provider gagal:", finalError);
    throw new Error("Gagal menghubungi AI. Semua layanan sedang sibuk atau bermasalah. Silakan coba lagi.");
  }
}

const systemInstruction = `Anda adalah seorang Pakar Kurikulum Merdeka Kemdikbud dan Desainer Pembelajaran yang ahli dalam menyusun "Rencana Pembelajaran Mendalam" (RPM). Tugas Anda adalah membuat modul RPP/Modul Ajar yang mendalam, bermakna, dan berpusat pada murid berdasarkan input topik atau materi yang diberikan pengguna.

PENTING: Anda WAJIB menggunakan istilah-istilah resmi Kurikulum Merdeka seperti Capaian Pembelajaran (CP), Tujuan Pembelajaran (TP), Alur Tujuan Pembelajaran (ATP), dan Profil Pelajar Pancasila. 

PENYESUAIAN FASE (COGNITIVE LEVELING): Sesuaikan tingkat kesulitan materi, gaya bahasa, dan kedalaman konsep dengan Fase/Kelas yang dipilih oleh pengguna. 
- Untuk Fase A (Kelas 1-2): Gunakan bahasa yang sangat sederhana. Materi ajar harus konkret (bercerita, contoh nyata). Asesmen TIDAK BOLEH berupa soal uraian panjang; gunakan pilihan ganda sederhana, menjodohkan, lisan, atau mewarnai.
- Untuk Fase B & C (Kelas 3-6): Gunakan bahasa yang mudah dipahami dengan contoh konkret.
- Untuk Fase D, E, F (SMP & SMA): Gunakan bahasa yang lebih analitis dan kritis.

JANGAN gunakan link gambar dari internet atau picsum.photos di bagian manapun (Materi, LKPD, Asesmen). Sebagai gantinya, buatkan visualisasi edukatif berupa Diagram, Tabel, Peta Konsep (Mind Map), atau Flowchart menggunakan format teks/Markdown/HTML yang sangat rapi dan jelas.

PENTING UNTUK SOAL BERGAMBAR (AI IMAGE): Jika pengguna mengaktifkan fitur "Soal Bergambar", Anda WAJIB menyisipkan instruksi pembuatan gambar AI di tempat-tempat yang relevan (minimal 1 di Materi Ajar dan 1 di LKPD/Asesmen). Gunakan format khusus berikut untuk instruksi gambar:
[AI_IMAGE_PROMPT: Ilustrasi buku pelajaran anak Indonesia, gaya vektor 2D datar, warna cerah, rapi, ramah anak. (Deskripsi spesifik sesuai topik, misal: Siswa SD berseragam merah putih sedang berbagi makanan). TANPA TEKS, TANPA TULISAN, TANPA HURUF APA PUN DI DALAM GAMBAR.]

PENTING UNTUK LAMPIRAN: Setiap kali Anda membuat lampiran "Lembar Kerja Peserta Didik (LKPD)" atau "Asesmen", Anda WAJIB menyertakan tabel "Kop" identitas siswa di bagian paling atas lampiran tersebut (tepat di bawah judul lampiran) dengan format HTML sebagai berikut:
<table border="1" width="100%" cellpadding="8" cellspacing="0" style="border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12pt; margin-bottom: 16pt;">
  <tr>
    <td style="padding: 8px; width: 150px;"><strong>Nama Siswa</strong></td>
    <td style="padding: 8px;"></td>
    <td style="padding: 8px; width: 150px;"><strong>Nilai</strong></td>
    <td style="padding: 8px; width: 100px;"></td>
  </tr>
  <tr>
    <td style="padding: 8px;"><strong>Kelas / Fase</strong></td>
    <td style="padding: 8px;">[Fase/Kelas]</td>
    <td style="padding: 8px;"><strong>Tanggal</strong></td>
    <td style="padding: 8px;"></td>
  </tr>
</table>

Struktur Output yang WAJIB Diikuti (Gunakan format HTML Kuno/Klasik agar tampilannya persis seperti contoh PDF dan rapi saat diekspor ke Word. Gunakan font Arial 12pt dan rata kiri/left):

<h3 style="background-color: #87CEEB; border: 1px solid #000; padding: 8px; text-align: center; margin-top: 0; margin-bottom: 16pt; font-family: Arial, sans-serif; font-size: 14pt;">RENCANA PEMBELAJARAN MENDALAM</h3>

<table width="100%" cellpadding="4" cellspacing="0" style="border: none; margin-bottom: 16pt; font-family: Arial, sans-serif; font-size: 12pt;">
  <tr>
    <td style="width: 200px; border: none; padding: 4px;"><strong>Penyusun</strong></td>
    <td style="border: none; padding: 4px;">: [Nama Penyusun]</td>
  </tr>
  <tr>
    <td style="border: none; padding: 4px;"><strong>Instansi</strong></td>
    <td style="border: none; padding: 4px;">: [Instansi]</td>
  </tr>
  <tr>
    <td style="border: none; padding: 4px;"><strong>Tahun Ajaran</strong></td>
    <td style="border: none; padding: 4px;">: [Tahun Ajaran]</td>
  </tr>
  <tr>
    <td style="border: none; padding: 4px;"><strong>Jenjang Sekolah</strong></td>
    <td style="border: none; padding: 4px;">: [Jenjang Sekolah]</td>
  </tr>
  <tr>
    <td style="border: none; padding: 4px;"><strong>Mata Pelajaran</strong></td>
    <td style="border: none; padding: 4px;">: [Mata Pelajaran]</td>
  </tr>
  <tr>
    <td style="border: none; padding: 4px;"><strong>Fase / Kelas</strong></td>
    <td style="border: none; padding: 4px;">: [Fase/Kelas]</td>
  </tr>
  <tr>
    <td style="border: none; padding: 4px;"><strong>Bab</strong></td>
    <td style="border: none; padding: 4px;">: [Bab]</td>
  </tr>
  <tr>
    <td style="border: none; padding: 4px;"><strong>Topik / Materi</strong></td>
    <td style="border: none; padding: 4px;">: [Topik/Materi]</td>
  </tr>
  <tr>
    <td style="border: none; padding: 4px;"><strong>Alokasi Waktu</strong></td>
    <td style="border: none; padding: 4px;">: [Alokasi Waktu]</td>
  </tr>
</table>

<h3 style="background-color: #87CEEB; border: 1px solid #000; padding: 8px; text-align: center; margin-top: 0; margin-bottom: 16pt; font-family: Arial, sans-serif; font-size: 14pt;">IDENTIFIKASI</h3>

<p style="text-align: left; font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.15; margin-bottom: 8pt;"><strong>Dimensi Profil Lulusan</strong></p>
<table width="100%" cellpadding="4" cellspacing="0" style="border: none; margin-bottom: 16pt; font-family: Arial, sans-serif; font-size: 12pt;">
  <tr>
    <td style="border: none; vertical-align: top;">
      [ ] <strong>DPL1</strong><br/>Keimanan dan Ketakwaan terhadap Tuhan YME
    </td>
    <td style="border: none; vertical-align: top;">
      [v] <strong>DPL3</strong><br/>Penalaran kritis
    </td>
    <td style="border: none; vertical-align: top;">
      [v] <strong>DPL5</strong><br/>Kolaborasi
    </td>
    <td style="border: none; vertical-align: top;">
      [ ] <strong>DPL7</strong><br/>Kesehatan
    </td>
  </tr>
  <tr>
    <td style="border: none; vertical-align: top;">
      [ ] <strong>DPL2</strong><br/>Kewargaan
    </td>
    <td style="border: none; vertical-align: top;">
      [ ] <strong>DPL4</strong><br/>Kreativitas
    </td>
    <td style="border: none; vertical-align: top;">
      [ ] <strong>DPL6</strong><br/>Kemandirian
    </td>
    <td style="border: none; vertical-align: top;">
      [v] <strong>DPL8</strong><br/>Komunikasi
    </td>
  </tr>
</table>
<p style="text-align: left; font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.15; margin-bottom: 8pt;"><em>(Catatan: Berikan tanda [v] pada dimensi yang relevan dengan materi, dan [ ] untuk yang tidak)</em></p>

<h3 style="background-color: #87CEEB; border: 1px solid #000; padding: 8px; text-align: center; margin-top: 0; margin-bottom: 16pt; font-family: Arial, sans-serif; font-size: 14pt;">DESAIN PEMBELAJARAN</h3>

<p style="text-align: left; font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.15; margin-bottom: 8pt;"><strong>Capaian Pembelajaran (CP)</strong><br/>
[Tuliskan CP yang relevan]</p>

<p style="text-align: left; font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.15; margin-bottom: 8pt;"><strong>Tujuan Pembelajaran (TP)</strong></p>
<ul style="text-align: left; font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.15; margin-bottom: 16pt;">
  <li>Menjelaskan pengertian dan fungsi...</li>
  <li>Mengidentifikasi aturan...</li>
  <li>Menggunakan...</li>
</ul>

<p style="text-align: left; font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.15; margin-bottom: 8pt;"><strong>Pemahaman Bermakna</strong><br/>
[Tuliskan pesan moral atau inti materi yang akan diingat siswa selamanya, relevan dengan kehidupan sehari-hari]</p>

<p style="text-align: left; font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.15; margin-bottom: 8pt;"><strong>Pertanyaan Pemantik</strong></p>
<ul style="text-align: left; font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.15; margin-bottom: 16pt;">
  <li>[Pertanyaan yang menggugah rasa ingin tahu siswa terkait materi]</li>
  <li>[Pertanyaan kedua]</li>
</ul>

<p style="text-align: left; font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.15; margin-bottom: 8pt;"><strong>Praktik Pedagogis</strong></p>
<ul style="text-align: left; font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.15; margin-bottom: 16pt;">
  <li><strong>Pendekatan</strong> : Pembelajaran Mendalam (Deep Learning)</li>
  <li><strong>Model</strong> : Problem Based Learning (PBL) (atau model lain yang relevan)</li>
  <li><strong>Metode</strong> : Tanya jawab, diskusi, penugasan dan ceramah</li>
</ul>

<p style="text-align: left; font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.15; margin-bottom: 8pt;"><strong>KEMITRAAN PEMBELAJARAN</strong></p>
<ul style="text-align: left; font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.15; margin-bottom: 16pt;">
  <li><strong>Teman sekelas</strong>: Berbagi peran dalam pengamatan...</li>
  <li><strong>Guru</strong>: Sebagai fasilitator dan motivator...</li>
  <li><strong>Orang tua murid</strong>: Mendampingi murid melakukan pengamatan...</li>
</ul>

<p style="text-align: left; font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.15; margin-bottom: 8pt;"><strong>LINGKUNGAN PEMBELAJARAN</strong></p>
<ul style="text-align: left; font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.15; margin-bottom: 16pt;">
  <li><strong>Lingkungan Fisik</strong>: Ruang kelas yang ditata berkelompok...</li>
  <li><strong>Budaya belajar</strong>: Menekankan gotong royong, kedisiplinan dan saling menghargai</li>
</ul>

<p style="text-align: left; font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.15; margin-bottom: 8pt;"><strong>PEMANFAATAN DIGITAL</strong></p>
<ul style="text-align: left; font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.15; margin-bottom: 16pt;">
  <li>Power point</li>
  <li>Video pembelajaran</li>
  <li>Aplikasi quiziz</li>
</ul>

<h3 style="background-color: #87CEEB; border: 1px solid #000; padding: 8px; text-align: center; margin-top: 0; margin-bottom: 16pt; font-family: Arial, sans-serif; font-size: 14pt;">PENGALAMAN BELAJAR</h3>

<p style="text-align: left; font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.15; margin-bottom: 8pt;"><strong>Langkah-langkah Pembelajaran</strong></p>

<table border="1" width="100%" cellpadding="8" cellspacing="0" style="border-collapse: collapse; margin-bottom: 16pt; font-family: Arial, sans-serif; font-size: 12pt;">
  <thead>
    <tr>
      <th style="padding: 12px; text-align: center; border: 1px solid #000; background-color: #f2f2f2;">Kegiatan</th>
      <th style="padding: 12px; text-align: center; border: 1px solid #000; background-color: #f2f2f2;">Deskripsi</th>
      <th style="padding: 12px; text-align: center; border: 1px solid #000; background-color: #f2f2f2;">Alokasi Waktu</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="padding: 12px; vertical-align: top; border: 1px solid #000; text-align: center;">Awal</td>
      <td style="padding: 12px; vertical-align: top; border: 1px solid #000; text-align: left;">
        <strong>Prinsip: Bermakna, Menggembirakan</strong><br/>
        1. Guru mengucapkan salam dan meminta ketua kelas memimpin doa sebelum pembelajaran dimulai.<br/>
        2. Guru mengecek kehadiran murid dengan penuh perhatian.<br/>
        3. <strong>Apersepsi:</strong> Guru mengajak murid untuk menenangkan diri dengan sejenak dengan posisi tubuh tegak, menarik napas dalam dan memejamkan mata sejenak.<br/>
        4. Guru menyampaikan materi yang akan dipelajari hari ini menghubungkan materi baru dengan pengalaman yang sudah dimiliki murid agar lebih mudah dipahami.<br/>
        5. Guru menyampaikan tujuan pembelajaran dengan bahasa yang mudah dipahami.
      </td>
      <td style="padding: 12px; vertical-align: top; border: 1px solid #000; text-align: center;">15 menit</td>
    </tr>
    <tr>
      <td style="padding: 12px; vertical-align: top; border: 1px solid #000; text-align: center;">Inti</td>
      <td style="padding: 12px; vertical-align: top; border: 1px solid #000; text-align: left;">
        <strong>Prinsip: Berkesadaran, Bermakna, Menggembirakan</strong><br/><br/>
        <strong>MEMAHAMI</strong><br/>
        1. Guru menampilkan video pembelajaran tentang materi melalui proyektor.<br/>
        2. Murid fokus untuk bernyanyi bersama dan memahami isi dari lagu.<br/>
        3. Guru memberikan stimulus agar murid dapat memahami permasalahan yang dihadapi.<br/><br/>
        <strong>MENGAPLIKASIKAN</strong><br/>
        4. Murid dibagi menjadi 4-5 kelompok dan diberikan arahan tentang kegiatan yang akan dilakukan.<br/>
        5. Setiap kelompok mengerjakan LKPD yang diberikan oleh guru.<br/>
        6. Setiap kelompok berdiskusi menyelesaikan LKPD.<br/><br/>
        <strong>MEREFLEKSI</strong><br/>
        7. Setiap kelompok mempresentasikan hasil diskusi kelompok.<br/>
        8. Guru memberikan umpan balik terkait presentasi yang di sampaikan oleh murid.<br/>
        9. Kelompok lain memberikan pendapat/komentar positif dan masukan perbaikan.<br/>
        10. Guru memberikan apresiasi berupa pujian atau stiker penghargaan untuk mendorong motivasi murid dalam belajar.
      </td>
      <td style="padding: 12px; vertical-align: top; border: 1px solid #000; text-align: center;">20 menit</td>
    </tr>
    <tr>
      <td style="padding: 12px; vertical-align: top; border: 1px solid #000; text-align: center;">Penutup</td>
      <td style="padding: 12px; vertical-align: top; border: 1px solid #000; text-align: left;">
        1. Murid diberikan soal evaluasi untuk dikerjakan secara individu.<br/>
        2. Guru bersama murid melakukan ice breaking dengan melakukan permainan ringan.<br/>
        3. Guru bersama murid melakukan refleksi pembelajaran.<br/>
        4. Kegiatan pembelajaran diakhiri dengan doa bersama.
      </td>
      <td style="padding: 12px; vertical-align: top; border: 1px solid #000; text-align: center;">15 menit</td>
    </tr>
  </tbody>
</table>

<p style="text-align: left; font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.15; margin-bottom: 8pt;"><strong>Asesmen Pembelajaran</strong><br/>
A. Penilaian Sikap<br/>
&nbsp;&nbsp;&nbsp;&nbsp;• Teknik : Observasi<br/>
&nbsp;&nbsp;&nbsp;&nbsp;• Instrumen : Rubrik<br/>
B. Penilaian Keterampilan<br/>
&nbsp;&nbsp;&nbsp;&nbsp;• Bentuk : LKPD<br/>
&nbsp;&nbsp;&nbsp;&nbsp;• Teknik : Non tes (menyajikan informasi dalam lembaran kerja)<br/>
&nbsp;&nbsp;&nbsp;&nbsp;• Instrumen : Rubrik<br/>
C. Penilaian Pengetahuan<br/>
&nbsp;&nbsp;&nbsp;&nbsp;• Bentuk : Soal evaluasi<br/>
&nbsp;&nbsp;&nbsp;&nbsp;• Teknik : Tes tertulis<br/>
&nbsp;&nbsp;&nbsp;&nbsp;• Instrumen : Rubrik (Terlampir)</p>

<div class="avoid-page-break" style="page-break-inside: avoid;">
<table width="100%" cellpadding="4" cellspacing="0" style="border: none; margin-top: 48pt; font-family: Arial, sans-serif; font-size: 12pt;">
  <tr>
    <td style="width: 50%; text-align: center; border: none; vertical-align: top;">
      Mengetahui,<br/>
      Kepala Sekolah<br/><br/><br/><br/><br/>
      <strong>[Nama Kepala Sekolah]</strong><br/>
      NIP. [NIP Kepala Sekolah]
    </td>
    <td style="width: 50%; text-align: center; border: none; vertical-align: top;">
      [Tempat], [Tanggal]<br/>
      Guru Kelas [Kelas]<br/><br/><br/><br/><br/>
      <strong>[Nama Penyusun]</strong><br/>
      NIP. [NIP Penyusun]
    </td>
  </tr>
</table>
</div>

Gaya Bahasa: Gunakan bahasa yang edukatif, suportif, dan instruksi yang jelas bagi guru. Pastikan setiap langkah mencerminkan nilai-nilai karakter dan profil lulusan. Sesuaikan isi dengan Topik/Materi yang diminta pengguna. WAJIB gunakan tag <p style="text-align: left; font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.15; margin-bottom: 8pt;"> untuk setiap paragraf biasa. WAJIB gunakan tag <ul> atau <ol> beserta <li> untuk setiap daftar, poin-poin, tujuan pembelajaran, pertanyaan pemantik, dan sejenisnya. JANGAN HANYA menggunakan enter (baris baru) untuk memisahkan poin-poin.`;

export async function generateRPM(
  topic: string | string[],
  bab: string,
  subject: string,
  jenjang: string,
  grade: string,
  fase: string,
  timeAllocation: string,
  author: string,
  school: string,
  kepsek: string,
  nipKepsek: string,
  nipGuru: string,
  tempat: string,
  tanggal: string,
  includeMateri: boolean,
  includeLKPD: boolean,
  includeAsesmen: boolean,
  asesmenType: string,
  asesmenCount: number,
  asesmenQuestionTypes: {
    pilihanGanda: boolean;
    pgKompleks: boolean;
    isian: boolean;
    uraian: boolean;
    menjodohkan: boolean;
  },
  asesmenWithImages: boolean
): Promise<string> {
  let asesmenTypesStr = [];
  if (asesmenQuestionTypes.pilihanGanda) asesmenTypesStr.push("Pilihan Ganda");
  if (asesmenQuestionTypes.pgKompleks) asesmenTypesStr.push("PG Kompleks");
  if (asesmenQuestionTypes.isian) asesmenTypesStr.push("Isian");
  if (asesmenQuestionTypes.uraian) asesmenTypesStr.push("Uraian");
  if (asesmenQuestionTypes.menjodohkan) asesmenTypesStr.push("Menjodohkan");

  const topicStr = Array.isArray(topic) ? topic.join(', ') : topic;

  const prompt = `Buatkan Rencana Pembelajaran Mendalam (RPM) untuk:
Bab/Tema: ${bab || '-'}
Topik/Materi: ${topicStr}
Mata Pelajaran: ${subject}
Jenjang Sekolah: ${jenjang}
Fase/Kelas: ${fase} / ${grade}
Alokasi Waktu: ${timeAllocation}
Penyusun: ${author}
Instansi: ${school}

Data untuk bagian Tanda Tangan:
Kepala Sekolah: ${kepsek || '[Nama Kepala Sekolah]'}
NIP Kepala Sekolah: ${nipKepsek || '[NIP Kepala Sekolah]'}
Penyusun (Guru Kelas): ${author || '[Nama Penyusun]'}
NIP Penyusun: ${nipGuru || '[NIP Penyusun]'}
Tempat: ${tempat || '[Tempat]'}
Tanggal: ${tanggal || '[Tanggal]'}

PENTING: Jika ada lampiran yang diminta di bawah ini, tambahkan bagian <div class="page-break" style="page-break-before: always;"></div><h3 style="background-color: #87CEEB; border: 1px solid #000; padding: 8px; text-align: center; margin-top: 0; margin-bottom: 16pt; font-family: Arial, sans-serif; font-size: 14pt;">LAMPIRAN</h3> tepat SETELAH bagian Tanda Tangan (di paling akhir dokumen). Lalu masukkan lampiran-lampiran tersebut di bawahnya.

PENTING: Seluruh isi lampiran (Materi Ajar, LKPD, Asesmen) WAJIB dibungkus dalam tag <div class="appendix-section">...</div> dan gunakan format RATA KIRI (Left-aligned) dengan font Arial 12pt untuk semua teks di dalamnya. Pisahkan setiap lampiran dengan halaman baru menggunakan tag <div class="page-break" style="page-break-before: always;"></div>.

PENTING: Pastikan bagian Tanda Tangan dibungkus dengan <div class="avoid-page-break" style="page-break-inside: avoid;">...</div>

${asesmenWithImages ? 'INSTRUKSI SANGAT KRITIKAL: Anda WAJIB MENYISIPKAN MINIMAL 3 GAMBAR ILUSTRASI di dalam dokumen ini (bisa di Materi, LKPD, atau Asesmen). Untuk menyisipkan gambar, Anda HARUS menuliskan kode ini persis seperti ini: [AI_IMAGE_PROMPT: deskripsi gambar yang detail dalam bahasa inggris]. JANGAN gunakan tag <img>, HANYA gunakan format kurung siku tersebut. Jika Anda tidak menyisipkan kode ini, sistem akan gagal.' : ''}

BAGIAN LAMPIRAN:
${includeMateri ? '- Tambahkan lampiran "Materi Ajar": Berisi ringkasan materi ajar yang relevan dengan topik. Awali dengan <div class="appendix-section"><h3 style="background-color: #87CEEB; border: 1px solid #000; padding: 8px; text-align: center; margin-top: 0; margin-bottom: 16pt; font-family: Arial, sans-serif; font-size: 14pt;">MATERI AJAR</h3>' : '- DILARANG KERAS membuat lampiran "Materi Ajar". JANGAN menuliskan kata "Materi Ajar" di bagian lampiran.'}
${includeLKPD ? '- Tambahkan lampiran "Lembar Kerja Peserta Didik (LKPD)": Berisi aktivitas atau tugas untuk siswa. Awali dengan <div class="page-break" style="page-break-before: always;"></div><div class="appendix-section"><h3 style="background-color: #87CEEB; border: 1px solid #000; padding: 8px; text-align: center; margin-top: 0; margin-bottom: 16pt; font-family: Arial, sans-serif; font-size: 14pt;">LEMBAR KERJA PESERTA DIDIK (LKPD)</h3>. WAJIB berikan nomor pada setiap soal/tugas.' : '- DILARANG KERAS membuat lampiran "LKPD". JANGAN menuliskan kata "LKPD" di bagian lampiran.'}
${includeAsesmen ? `- Tambahkan lampiran "Asesmen": Awali dengan <div class="page-break" style="page-break-before: always;"></div><div class="appendix-section"><h3 style="background-color: #87CEEB; border: 1px solid #000; padding: 8px; text-align: center; margin-top: 0; margin-bottom: 16pt; font-family: Arial, sans-serif; font-size: 14pt;">ASESMEN</h3>
  - Tipe Asesmen: ${asesmenType}
  - Jumlah Soal: ${asesmenCount}
  - Tipe Soal: ${asesmenTypesStr.join(', ')}
  - Soal Bergambar: ${asesmenWithImages ? 'Ya. Ingat instruksi kritikal di atas, Anda WAJIB menyisipkan [AI_IMAGE_PROMPT: deskripsi].' : 'Tidak'}
  - Aturan Penulisan Soal: WAJIB ikuti kaidah penulisan soal yang baik dan benar. Berikan nomor urut pada setiap soal. JANGAN gunakan spasi kosong (enter) yang berlebihan antar soal.
    * Pilihan Ganda (Soal Objektif): Pokok soal harus dirumuskan dengan jelas dan tegas. Pilihan jawaban harus homogen dan logis. Gunakan format Ordered List (<ol>) untuk nomor soal, dan Unordered List (<ul>) dengan style list-style-type: upper-alpha; untuk pilihan jawaban (A, B, C, D). Contoh:
      <ol style="margin-top: 0; margin-bottom: 8pt; padding-left: 20px; text-align: left;">
        <li>Teks pokok soal yang jelas dan tegas...
          <ul style="list-style-type: upper-alpha; margin-top: 4pt; padding-left: 20px; text-align: left;">
            <li>Pilihan jawaban A</li>
            <li>Pilihan jawaban B</li>
            <li>Pilihan jawaban C</li>
            <li>Pilihan jawaban D</li>
          </ul>
        </li>
      </ol>
    * Isian Singkat: Tuliskan soal, lalu tekan Enter (baris baru), dan tuliskan "Kunci Jawaban:" dengan format yang jelas, tidak menyambung di sebelah soal.
    * Uraian: Tuliskan soal, lalu di baris bawahnya tuliskan "Kunci Jawaban / Rubrik Penilaian:" secara terstruktur.
    * Menjodohkan: Gunakan format daftar (list) ke bawah, bukan dipisahkan dengan koma ke samping.
  Buatkan soal-soal asesmen sesuai dengan kriteria di atas.
  
  SETELAH SEMUA SOAL SELESAI, buatlah sub-judul <div class="page-break" style="page-break-before: always;"></div><h3 style="background-color: #87CEEB; border: 1px solid #000; padding: 8px; text-align: center; margin-top: 0; margin-bottom: 16pt; font-family: Arial, sans-serif; font-size: 14pt;">KUNCI JAWABAN</h3> dan tuliskan kunci jawaban secara terpisah dan rapi.
  SETELAH KUNCI JAWABAN, buatlah sub-judul <div class="page-break" style="page-break-before: always;"></div><h3 style="background-color: #87CEEB; border: 1px solid #000; padding: 8px; text-align: center; margin-top: 0; margin-bottom: 16pt; font-family: Arial, sans-serif; font-size: 14pt;">RUBRIK PENILAIAN SIKAP & KETERAMPILAN</h3> dan buatkan tabel rubrik penilaian sikap dan keterampilan yang relevan dengan topik dan aktivitas.</div>` : '- DILARANG KERAS membuat lampiran "Asesmen". JANGAN menuliskan kata "Asesmen" di bagian lampiran.'}
${includeMateri || includeLKPD || includeAsesmen ? '</div>' : ''}

PENTING: Hanya buat lampiran yang diinstruksikan di atas. Jika ada instruksi "DILARANG KERAS", maka bagian tersebut TIDAK BOLEH ada di dalam output Anda sama sekali.

Pastikan format output menggunakan HTML yang rapi sesuai dengan instruksi sistem agar tampilannya persis seperti contoh PDF. Ganti placeholder [Jenjang Sekolah], [Nama Kepala Sekolah], [NIP Kepala Sekolah], [Nama Penyusun], [NIP Penyusun], [Tempat], [Bab], dan [Tanggal] dengan data yang diberikan di atas.`;

  try {
    return await executeAIPrompt(prompt, systemInstruction);
  } catch (error) {
    console.error("Error generating RPM:", error);
    throw new Error("Terjadi kesalahan saat menghubungi AI. Silakan coba lagi.");
  }
}

export async function suggestBabs(jenjang: string, grade: string, subject: string): Promise<string[]> {
  const prompt = `Berikan daftar 5-8 Bab atau Tema utama untuk mata pelajaran ${subject} tingkat ${jenjang} kelas ${grade} berdasarkan Kurikulum Merdeka.
  HANYA kembalikan daftar nama babnya saja, dipisahkan dengan baris baru (enter). Jangan ada teks pengantar, nomor urut, atau simbol bullet point.`;
  
  try {
    const responseText = await executeAIPrompt(prompt);
    const babs = responseText
      .split('\n')
      .map(b => b.replace(/^[\d\.\-\*\s]+/, '').trim()) // Clean up numbers or bullets if AI ignores instructions
      .filter(b => b.length > 0);
    return babs;
  } catch (error) {
    console.error("Error suggesting Babs:", error);
    return [];
  }
}

export async function suggestTopics(jenjang: string, grade: string, subject: string, bab: string): Promise<string[]> {
  const prompt = `Berikan daftar 3-6 sub-topik atau materi spesifik untuk Bab/Tema "${bab}" pada mata pelajaran ${subject} tingkat ${jenjang} kelas ${grade} berdasarkan Kurikulum Merdeka.
  HANYA kembalikan daftar nama sub-topiknya saja, dipisahkan dengan baris baru (enter). Jangan ada teks pengantar, nomor urut, atau simbol bullet point.`;
  
  try {
    const responseText = await executeAIPrompt(prompt);
    const topics = responseText
      .split('\n')
      .map(t => t.replace(/^[\d\.\-\*\s]+/, '').trim())
      .filter(t => t.length > 0);
    return topics;
  } catch (error) {
    console.error("Error suggesting Topics:", error);
    return [];
  }
}

export async function generateRPMChained(
  topic: string | string[],
  bab: string,
  subject: string,
  jenjang: string,
  grade: string,
  fase: string,
  timeAllocation: string,
  author: string,
  school: string,
  kepsek: string,
  nipKepsek: string,
  nipGuru: string,
  tempat: string,
  tanggal: string,
  includeMateri: boolean,
  includeLKPD: boolean,
  includeAsesmen: boolean,
  asesmenType: string,
  asesmenCount: number,
  asesmenQuestionTypes: {
    pilihanGanda: boolean;
    pgKompleks: boolean;
    isian: boolean;
    uraian: boolean;
    menjodohkan: boolean;
  },
  asesmenWithImages: boolean,
  jumlahPertemuan: number,
  onProgress: (step: string) => void
): Promise<string> {
  
  let asesmenTypesStr = [];
  if (asesmenQuestionTypes.pilihanGanda) asesmenTypesStr.push("Pilihan Ganda");
  if (asesmenQuestionTypes.pgKompleks) asesmenTypesStr.push("PG Kompleks");
  if (asesmenQuestionTypes.isian) asesmenTypesStr.push("Isian");
  if (asesmenQuestionTypes.uraian) asesmenTypesStr.push("Uraian");
  if (asesmenQuestionTypes.menjodohkan) asesmenTypesStr.push("Menjodohkan");

  const topicStr = Array.isArray(topic) ? topic.join(', ') : topic;

  try {
    // STEP 1: Generate Main RPP (Identitas, CP, TP, and Kegiatan Pembelajaran for all meetings)
    onProgress(`Menyusun RPP Utama & Langkah Pembelajaran untuk ${jumlahPertemuan} pertemuan...`);
    const mainPrompt = `Buatkan Rencana Pembelajaran Mendalam (RPM) UTAMA untuk:
Bab/Tema: ${bab || '-'}
Topik/Materi: ${topicStr}
Mata Pelajaran: ${subject}
Jenjang Sekolah: ${jenjang}
Fase/Kelas: ${fase} / ${grade}
Alokasi Waktu per Pertemuan: ${timeAllocation}
Jumlah Pertemuan: ${jumlahPertemuan} Pertemuan
Penyusun: ${author}
Instansi: ${school}

Data untuk bagian Tanda Tangan:
Kepala Sekolah: ${kepsek || '[Nama Kepala Sekolah]'}
NIP Kepala Sekolah: ${nipKepsek || '[NIP Kepala Sekolah]'}
Penyusun (Guru Kelas): ${author || '[Nama Penyusun]'}
NIP Penyusun: ${nipGuru || '[NIP Penyusun]'}
Tempat: ${tempat || '[Tempat]'}
Tanggal: ${tanggal || '[Tanggal]'}

INSTRUKSI KHUSUS: 
1. Pada bagian "Langkah-langkah Pembelajaran", Anda WAJIB membuat tabel kegiatan untuk SETIAP PERTEMUAN (Pertemuan 1 hingga Pertemuan ${jumlahPertemuan}). 
2. JANGAN membuat lampiran LKPD atau Asesmen di tahap ini. Fokus pada struktur utama RPP saja.
3. Pastikan format output menggunakan HTML yang rapi sesuai dengan instruksi sistem agar tampilannya persis seperti contoh PDF.
4. Pastikan bagian Tanda Tangan dibungkus dengan <div class="avoid-page-break" style="page-break-inside: avoid;">...</div>`;

    let finalHtml = await executeAIPrompt(mainPrompt, systemInstruction);

    // Prepare Appendix section if needed
    if (includeMateri || includeLKPD || includeAsesmen) {
      finalHtml += `\n<div class="page-break" style="page-break-before: always;"></div><h3 style="background-color: #87CEEB; border: 1px solid #000; padding: 8px; text-align: center; margin-top: 0; margin-bottom: 16px;">LAMPIRAN</h3>\n`;
    }

    // STEP 2: Generate Materi (Optional)
    if (includeMateri) {
      onProgress("Menyusun Lampiran Materi Ajar...");
      const materiPrompt = `Buatkan Lampiran "Materi Ajar" yang komprehensif untuk Bab: ${bab}, Topik: ${topicStr}, Mata Pelajaran: ${subject}, Kelas: ${grade}. Materi ini mencakup bahan untuk ${jumlahPertemuan} pertemuan.
      Awali dengan <div class="appendix-section"><h4>Materi Ajar</h4> dan akhiri dengan </div>. Gunakan format HTML yang rapi.
      ${asesmenWithImages ? 'INSTRUKSI SANGAT KRITIKAL: Anda WAJIB MENYISIPKAN MINIMAL 1 GAMBAR ILUSTRASI menggunakan format [AI_IMAGE_PROMPT: deskripsi gambar dalam bahasa inggris].' : ''}`;
      
      const materiHtml = await executeAIPrompt(materiPrompt, systemInstruction);
      finalHtml += `\n${materiHtml}\n`;
    }

    // STEP 3: Generate LKPD
    if (includeLKPD) {
      onProgress(`Membuat Lembar Kerja Peserta Didik (LKPD) untuk ${jumlahPertemuan} pertemuan...`);
      const lkpdPrompt = `Buatkan Lampiran "Lembar Kerja Peserta Didik (LKPD)" untuk Bab: ${bab}, Topik: ${topicStr}, Mata Pelajaran: ${subject}, Kelas: ${grade}. 
      Anda WAJIB membuat LKPD yang berbeda untuk SETIAP PERTEMUAN (Pertemuan 1 hingga Pertemuan ${jumlahPertemuan}).
      Awali dengan <div class="page-break" style="page-break-before: always;"></div><div class="appendix-section"><h4>Lembar Kerja Peserta Didik (LKPD)</h4> dan akhiri dengan </div>. Gunakan format HTML yang rapi.
      ${asesmenWithImages ? 'INSTRUKSI SANGAT KRITIKAL: Anda WAJIB MENYISIPKAN MINIMAL 2 GAMBAR ILUSTRASI menggunakan format [AI_IMAGE_PROMPT: deskripsi gambar dalam bahasa inggris].' : ''}`;
      
      const lkpdHtml = await executeAIPrompt(lkpdPrompt, systemInstruction);
      finalHtml += `\n${lkpdHtml}\n`;
    }

    // STEP 4: Generate Asesmen
    if (includeAsesmen) {
      onProgress("Menyusun Asesmen Sumatif Akhir Bab...");
      const asesmenPrompt = `Buatkan Lampiran "Asesmen Sumatif Akhir Bab" untuk Bab: ${bab}, Topik: ${topicStr}, Mata Pelajaran: ${subject}, Kelas: ${grade}.
      Tipe Asesmen: ${asesmenType}
      Jumlah Soal: ${asesmenCount}
      Tipe Soal: ${asesmenTypesStr.join(', ')}
      
      Awali dengan <div class="page-break" style="page-break-before: always;"></div><div class="appendix-section"><h4>Asesmen Akhir Bab</h4> dan akhiri dengan </div>. 
      Sertakan juga Kunci Jawaban dan Rubrik Penilaian di bagian bawahnya.
      ${asesmenWithImages ? 'INSTRUKSI SANGAT KRITIKAL: Anda WAJIB MENYISIPKAN MINIMAL 1 GAMBAR ILUSTRASI menggunakan format [AI_IMAGE_PROMPT: deskripsi gambar dalam bahasa inggris].' : ''}`;
      
      const asesmenHtml = await executeAIPrompt(asesmenPrompt, systemInstruction);
      finalHtml += `\n${asesmenHtml}\n`;
    }

    onProgress("Menyatukan dokumen... Selesai!");
    return finalHtml;

  } catch (error) {
    console.error("Error generating chained RPM:", error);
    throw new Error("Terjadi kesalahan saat menghubungi AI dalam proses penyusunan Bab. Silakan coba lagi.");
  }
}

export async function generateAIImage(prompt: string): Promise<string> {
  try {
    // Fetch AI Provider Settings
    let geminiKeys: string[] = [];
    try {
      const settingsDoc = await getDoc(doc(db, 'settings', 'general'));
      if (settingsDoc.exists()) {
        const data = settingsDoc.data();
        if (data.geminiApiKeys && Array.isArray(data.geminiApiKeys)) {
          geminiKeys = data.geminiApiKeys.filter((k: string) => k.trim() !== '');
        }
      }
    } catch (e) {
      console.error("Error fetching AI settings:", e);
    }

    if (geminiKeys.length === 0) {
      const envKey = globalThis.process?.env?.GEMINI_API_KEY;
      if (envKey) geminiKeys.push(envKey);
    }

    if (geminiKeys.length === 0) throw new Error("Tidak ada API Key Gemini yang tersedia.");

    let lastError;
    for (let i = 0; i < geminiKeys.length; i++) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiKeys[i] });
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash-image",
          contents: {
            parts: [
              {
                text: `Buatkan gambar edukatif untuk materi sekolah dengan deskripsi: ${prompt}. Gaya gambar bebas, lakukan yang terbaik agar menarik bagi siswa. JANGAN sertakan teks di dalam gambar.`,
              },
            ],
          },
          config: {
            imageConfig: {
              aspectRatio: "1:1",
            },
          },
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
            return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          }
        }
        throw new Error("No image data found in response");
      } catch (error) {
        console.warn(`Gemini Image Key #${i + 1} gagal:`, error);
        lastError = error;
      }
    }
    
    throw new Error(`Semua kunci Gemini untuk gambar gagal. Error terakhir: ${lastError}`);
  } catch (error) {
    console.error("Error generating AI image:", error);
    return ""; // Return empty string on failure
  }
}
