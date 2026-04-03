import React, { useState } from 'react';
import { Eye, EyeOff, GraduationCap, Loader2 } from 'lucide-react';
import { auth, db } from '../firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';

export default function Login() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  
  // Form States
  const [name, setName] = useState('');
  const [nip, setNip] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // UI States
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!email) {
      setError('Masukkan email Anda untuk mereset password.');
      return;
    }

    setIsLoading(true);
    const cleanEmail = email.trim().toLowerCase();

    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setSuccessMessage('Tautan reset password telah dikirim ke email Anda. Silakan periksa kotak masuk atau folder spam.');
    } catch (err: any) {
      console.error('Error sending password reset email:', err);
      let errorMessage = 'Gagal mengirim email reset password.';
      if (err.code === 'auth/user-not-found') errorMessage = 'Email tidak terdaftar.';
      if (err.code === 'auth/invalid-email') errorMessage = 'Format email tidak valid.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      // App.tsx will handle the redirect and initial document creation via onAuthStateChanged
    } catch (err: any) {
      console.error('Error with Google Login:', err);
      let errorMessage = 'Gagal login dengan Google.';
      if (err.code === 'auth/unauthorized-domain') {
        errorMessage = 'Domain ini belum diotorisasi di Firebase. Silakan tambahkan domain ini ke Authorized Domains di Firebase Console (Authentication -> Settings).';
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!email || !password) {
      setError('Email dan password wajib diisi.');
      return;
    }

    setIsLoading(true);
    const cleanEmail = email.trim().toLowerCase();

    try {
      await signInWithEmailAndPassword(auth, cleanEmail, password);
      // App.tsx will handle the redirect via onAuthStateChanged
    } catch (err: any) {
      console.error('Error logging in via Firebase:', err);
      let errorMessage = 'Email atau password salah.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        errorMessage = 'Email atau password salah.';
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'Format email tidak valid.';
      } else if (err.code === 'auth/user-disabled') {
        errorMessage = 'Akun ini telah dinonaktifkan.';
      } else if (err.code === 'auth/too-many-requests') {
        errorMessage = 'Terlalu banyak percobaan login. Silakan coba lagi nanti.';
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!name || !email || !password) {
      setError('Nama, Email, dan Password wajib diisi.');
      return;
    }

    setIsLoading(true);
    const cleanEmail = email.trim().toLowerCase();

    try {
      // Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      const user = userCredential.user;

      // Update profile with name
      await updateProfile(user, { displayName: name });

      // Save user data to Firestore
      const role = (cleanEmail === 'admin@gurupintar.com' || cleanEmail === 'ps.erik007@gmail.com') ? 'admin' : 'user';
      await setDoc(doc(db, 'users', user.uid), {
        name,
        nip: nip || '-',
        email: cleanEmail,
        role: role,
        status: 'aktif',
        createdAt: new Date().toISOString(),
        sisa_token: role === 'admin' ? 50 : 5,
        last_reset: new Date().toISOString()
      });

      setSuccessMessage('Akun berhasil dibuat! Anda akan segera dialihkan...');
      // App.tsx will automatically redirect since the user is now logged in
    } catch (err: any) {
      console.error('Error registering via Firebase:', err);
      let errorMessage = 'Gagal mendaftar akun.';
      if (err.code === 'auth/email-already-in-use') errorMessage = 'Email sudah terdaftar. Silakan gunakan email lain atau langsung Login.';
      if (err.code === 'auth/weak-password') errorMessage = 'Password terlalu lemah (minimal 6 karakter).';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-white font-sans text-slate-800">
      {/* Left Side - Form */}
      <div className="w-full md:w-[450px] lg:w-[500px] flex flex-col px-8 md:px-12 py-10 overflow-y-auto shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-12">
          <GraduationCap className="w-10 h-10 text-[#2563eb]" fill="#2563eb" />
          <span className="text-3xl font-extrabold text-[#2563eb] tracking-tight">
            Guru<span className="text-[#d99b3b]">PintarAI</span>
          </span>
        </div>

        {/* Heading */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-blue-600 mb-3">
            {isForgotPassword ? 'Lupa Password' : (isRegistering ? 'Buat Akun' : 'Login')}
          </h1>
          <p className="text-gray-500 text-lg leading-relaxed">
            {isForgotPassword
              ? 'Masukkan email Anda dan kami akan mengirimkan tautan untuk mereset password.'
              : (isRegistering 
                ? 'Daftarkan diri Anda untuk mengakses perangkat pembelajaran.' 
                : 'Bagi Bapak/Ibu Guru yang sudah terdaftar, silakan login.')}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={isForgotPassword ? handleForgotPassword : (isRegistering ? handleRegister : handleLogin)} className="space-y-5 flex-1">
          {error && (
            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
              {error}
            </div>
          )}
          
          {successMessage && (
            <div className="p-3 bg-green-50 text-green-700 text-sm rounded-lg border border-green-100">
              {successMessage}
            </div>
          )}

          {!isForgotPassword && isRegistering && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nama Lengkap *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Budi Santoso, S.Pd."
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-gray-800 placeholder-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">NIP (Opsional)</label>
                <input
                  type="text"
                  value={nip}
                  onChange={(e) => setNip(e.target.value)}
                  placeholder="Masukkan NIP jika ada"
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-gray-800 placeholder-gray-400 font-mono"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email {(!isForgotPassword && isRegistering) && '*'}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alamat@email.com"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-gray-800 placeholder-gray-400"
            />
          </div>

          {!isForgotPassword && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password {isRegistering && '*'}</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password"
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-gray-800 placeholder-gray-400 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
          )}

          {!isForgotPassword && !isRegistering && (
            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm text-gray-500">Ingat saya</span>
              </label>
              <button 
                type="button"
                onClick={() => {
                  setIsForgotPassword(true);
                  setError('');
                  setSuccessMessage('');
                }} 
                className="text-sm text-gray-500 hover:text-blue-600 transition-colors"
              >
                Lupa password?
              </button>
            </div>
          )}

          <div className="flex flex-col gap-4 pt-6">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
              {isForgotPassword ? 'Kirim Tautan Reset' : (isRegistering ? 'Daftar Sekarang' : 'Login')}
            </button>
            
            {!isForgotPassword && (
              <>
                <div className="relative flex items-center py-2">
                  <div className="flex-grow border-t border-gray-200"></div>
                  <span className="flex-shrink-0 mx-4 text-gray-400 text-sm">Atau</span>
                  <div className="flex-grow border-t border-gray-200"></div>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                  className="w-full bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Login dengan Google
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsRegistering(!isRegistering);
                    setError('');
                    setSuccessMessage('');
                  }}
                  className="w-full bg-white border border-blue-600 text-blue-600 hover:bg-blue-50 font-medium py-3 px-4 rounded-lg transition-colors mt-2"
                >
                  {isRegistering ? 'Sudah punya akun? Login' : 'Buat Akun Baru'}
                </button>
              </>
            )}

            {isForgotPassword && (
              <button
                type="button"
                onClick={() => {
                  setIsForgotPassword(false);
                  setError('');
                  setSuccessMessage('');
                }}
                className="w-full bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium py-3 px-4 rounded-lg transition-colors mt-2"
              >
                Kembali ke Login
              </button>
            )}
          </div>
        </form>

        {!isForgotPassword && !isRegistering && (
          <div className="mt-8 pt-8 border-t border-gray-100 text-center text-sm text-gray-500">
            <p>Untuk mencoba aplikasi, silakan <b>Buat Akun Baru</b> terlebih dahulu.</p>
            <p className="mt-1">Gunakan email <b>admin@gurupintar.com</b> untuk menjadi Admin.</p>
          </div>
        )}
      </div>

      {/* Right Side - Hero */}
      <div className="hidden md:flex flex-1 bg-slate-50 relative items-center justify-center overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-20 right-20 w-96 h-96 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob"></div>
        <div className="absolute bottom-20 left-20 w-96 h-96 bg-amber-200 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-2000"></div>
        
        <div className="relative z-10 w-full max-w-2xl px-12 flex flex-col items-center text-center">
          {/* Big Logo in Hero */}
          <div className="flex items-center gap-4 mb-8">
            <GraduationCap className="w-20 h-20 text-[#2563eb]" fill="#2563eb" />
            <span className="text-7xl font-extrabold text-[#2563eb] tracking-tight">
              Guru<span className="text-[#d99b3b]">PintarAI</span>
            </span>
          </div>
          
          <h2 className="text-3xl font-bold text-slate-800 mb-6">
            Asisten Cerdas Guru Masa Kini
          </h2>
          <p className="text-slate-600 text-xl mb-12 max-w-lg leading-relaxed">
            Platform berbasis AI untuk menyusun Modul Ajar, RPP, dan Asesmen dengan cepat, tepat, dan sesuai kurikulum.
          </p>

          <div className="grid grid-cols-2 gap-6 w-full max-w-lg">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center hover:shadow-md transition-shadow">
              <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <div className="font-bold text-slate-800 text-lg">Lebih Cepat</div>
              <div className="text-sm text-slate-500 text-center mt-2">Buat RPP dalam hitungan detik</div>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center hover:shadow-md transition-shadow">
              <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mb-4">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div className="font-bold text-slate-800 text-lg">Sesuai Kurikulum</div>
              <div className="text-sm text-slate-500 text-center mt-2">Terintegrasi Kurikulum Merdeka</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
