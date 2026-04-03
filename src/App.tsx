/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import UserDashboard from './components/UserDashboard';
import AdminDashboard from './components/AdminDashboard';
import { AuthState, User } from './types';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { Loader2, Key } from 'lucide-react';

// Add type for window.aistudio
declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

function App() {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    role: null,
    user: null,
  });
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Fetch user document from Firestore to get role and other details
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDocSnap = await getDoc(userDocRef);
          
          if (userDocSnap.exists()) {
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
               console.error("Could not create initial user doc", e);
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

  if (authState.role === 'admin') {
    return <AdminDashboard onLogout={handleLogout} user={authState.user} />;
  }

  return <UserDashboard onLogout={handleLogout} user={authState.user} />;
}

export default App;
