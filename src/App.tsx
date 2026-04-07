/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import Login from './components/Login';
import UserDashboard from './components/UserDashboard';
import AdminDashboard from './components/AdminDashboard';
import { AuthState, User } from './types';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { Loader2, Key, AlertTriangle } from 'lucide-react';

// Add type for window.aistudio
declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-full items-center justify-center bg-slate-50 p-4">
          <div className="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full text-center border border-red-100">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 mb-2">Oops! Terjadi Kesalahan</h1>
            <p className="text-slate-600 mb-6">
              Maaf, aplikasi mengalami masalah saat memuat halaman ini.
            </p>
            <div className="bg-slate-100 p-4 rounded-lg text-left overflow-auto max-h-40 mb-6 text-sm text-slate-700 font-mono">
              {this.state.error?.message || "Unknown error"}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-xl transition-colors"
            >
              Muat Ulang Aplikasi
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function AppContent() {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    role: null,
    user: null,
  });
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isAdminUserMode, setIsAdminUserMode] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Fetch user document from Firestore to get role and other details
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          let userDocSnap;
          try {
            userDocSnap = await getDoc(userDocRef);
          } catch (err) {
            handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`);
            return;
          }
          
          if (userDocSnap && userDocSnap.exists()) {
            const userData = userDocSnap.data() as User;
            
            // Token Reset Logic
            const lastReset = userData.last_reset ? new Date(userData.last_reset) : new Date(0);
            const now = new Date();
            const diffInDays = (now.getTime() - lastReset.getTime()) / (1000 * 3600 * 24);
            
            if (diffInDays >= 30) {
              let newTokenCount = userData.role === 'admin' ? 100 : 5;
              
              // Check for PRO subscription
              if (userData.subscription === 'pro') {
                const expiry = userData.subscriptionExpiry ? new Date(userData.subscriptionExpiry) : null;
                if (expiry && expiry > now) {
                  newTokenCount = 30; // Pro users get 30 tokens
                } else {
                  // Subscription expired, revert to free
                  await updateDoc(userDocRef, { subscription: 'free' });
                  userData.subscription = 'free';
                }
              }
              
              await updateDoc(userDocRef, {
                sisa_token: newTokenCount,
                last_reset: now.toISOString()
              });
              userData.sisa_token = newTokenCount;
              userData.last_reset = now.toISOString();
            }

            setAuthState({
              isAuthenticated: true,
              role: userData.role as 'admin' | 'user',
              user: { ...userData, id: firebaseUser.uid },
            });
          } else {
            // Fallback if user doc doesn't exist yet (e.g. during registration or if it failed)
            const isAdminEmail = firebaseUser.email === 'admin@gurupintar.com' || firebaseUser.email === 'ps.erik007@gmail.com';
            const role = isAdminEmail ? 'admin' : 'user';
            
            // Try to create the document if it doesn't exist
            try {
               await setDoc(userDocRef, {
                  name: firebaseUser.displayName || 'User',
                  nip: '-',
                  email: firebaseUser.email || '',
                  role: role,
                  status: 'aktif',
                  createdAt: new Date().toISOString(),
                  sisa_token: role === 'admin' ? 50 : 5,
                  last_reset: new Date().toISOString(),
                  subscription: 'free',
                  subscriptionExpiry: null
               });
            } catch (e) {
               handleFirestoreError(e, OperationType.WRITE, `users/${firebaseUser.uid}`);
            }

            setAuthState({
              isAuthenticated: true,
              role: role,
              user: {
                id: firebaseUser.uid,
                name: firebaseUser.displayName || 'User',
                email: firebaseUser.email || '',
                nip: '-',
                role: role,
                status: 'aktif',
                subscription: 'free'
              }
            });
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
          setAuthState({ isAuthenticated: false, role: null, user: null });
        }
      } else {
        setAuthState({ isAuthenticated: false, role: null, user: null });
      }
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!authState.isAuthenticated || !authState.user) {
    return <Login />;
  }

  if (authState.role === 'admin' && !isAdminUserMode) {
    return (
      <AdminDashboard 
        onLogout={handleLogout} 
        user={authState.user} 
        onSwitchToUserMode={() => setIsAdminUserMode(true)} 
      />
    );
  }

  return (
    <UserDashboard 
      onLogout={handleLogout} 
      user={authState.user} 
      isAdminMode={authState.role === 'admin'}
      onBackToAdmin={() => setIsAdminUserMode(false)}
    />
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

export default App;
