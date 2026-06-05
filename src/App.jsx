import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
// --- Firebase SDK Imports ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from 'firebase/auth'; 
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, deleteDoc, query, orderBy, limit, onSnapshot, serverTimestamp } from 'firebase/firestore';

// --- API & Env Configuration ---
// Safely retrieving Vite environment variables
const getEnvVar = (key) => {
  try { return import.meta.env[key]; } catch(e) { return ""; }
};
const apiKey = getEnvVar('VITE_VAIDYA_MITHRA_GEMINI_KEY') || "";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

const JSON_SCHEMA = {
  type: "OBJECT",
  properties: {
    emergency_flag: { type: "BOOLEAN", description: "True if symptoms indicate a severe emergency." },
    predictions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          disease: { type: "STRING" },
          confidence: { type: "NUMBER" },
          description: { type: "STRING" }
        },
        required: ["disease", "confidence", "description"]
      }
    }
  },
  required: ["emergency_flag", "predictions"]
};

const ALL_SYMPTOMS_CATEGORIZED = {
  General: ['Fatigue', 'Fever', 'Headache', 'Dizziness', 'Nausea', 'Vomiting', 'Body Ache', 'Chills', 'Sore Throat', 'Diarrhea', 'Constipation', 'Runny Nose'],
  Respiratory: ['Cough', 'Shortness of Breath', 'Wheezing', 'Chest Tightness', 'Difficulty Breathing', 'Sputum Production', 'Sneezing', 'Hoarseness'],
  Cardiac: ['Chest Pain', 'Palpitations', 'Fainting', 'Swelling of Legs/Ankles', 'Rapid Heartbeat', 'Lightheadedness', 'Pain Radiating to Jaw/Arm'],
  Skin: ['Rash', 'Itching', 'Hives', 'Dry Skin', 'Jaundice', 'Bruising', 'Change in Mole appearance', 'Redness/Inflammation'],
  Musculoskeletal: ['Joint Pain', 'Muscle Pain', 'Back Pain', 'Stiffness', 'Swollen Joints', 'Limited Range of Motion', 'Numbness/Tingling'],
};
const SYMPTOM_CATEGORIES = Object.keys(ALL_SYMPTOMS_CATEGORIZED);

const Icon = ({ name, size = 20, color = 'currentColor', className = '' }) => {
  const icons = {
    home: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    stethoscope: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 2a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V5a3 3 0 0 0-3-3h-6zM9 12h-4a2 2 0 0 0-2 2v2M21 12h-4a2 2 0 0 1-2 2v2M12 9v6M15 15v-6M18 15v-6M9 15v-6"/></svg>,
    messageSquare: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
    hospital: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 11v6m-3-3h6m7 0h-3v4a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-4H3m7-10l-1 4H5l-1 4m16-8l-1 4h-4l-1 4m4 4H4a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2z"/></svg>,
    history: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 2v10l4-4m-6-6a9 9 0 1 1 0 18a9 9 0 0 1 0-18z"/></svg>,
    user: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    users: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    calendar: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    fileText: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
    activity: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    shield: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    settings: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
    bell: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
    logOut: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
    mail: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
    phone: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-4.75-4.75A19.79 19.79 0 0 1 2.08 3.18 2 2 0 0 1 4.08 1h3a2 2 0 0 1 2 1.72 17.51 17.51 0 0 0 .15 3.37 2 2 0 0 1-1.28 2.13l-1.3 1.3A15 15 0 0 0 15 16.5l1.3-1.3a2 2 0 0 1 2.13-1.28A17.51 17.51 0 0 0 20.28 16.92z"/></svg>,
    alertTriangle: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    chevronRight: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="9 18 15 12 9 6"/></svg>,
    send: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
    x: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    menu: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
    search: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
    checkCircle: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
    clock: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    plus: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    lightbulb: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M15.09 16.05A6.47 6.47 0 0 1 12 21.03a6.47 6.47 0 0 1-3.09-4.98c0-.62.07-1.23.21-1.81l.15-.62.62-.15c.58-.14 1.19-.21 1.81-.21h0c.62 0 1.23.07 1.81.21l.62.15.15.62c.14.58.21 1.19.21 1.81zM12 21.03V22m0-11.03V4a2 2 0 1 1 4 0v2.03M8 6.03V4a2 2 0 1 0-4 0v2.03m5.5 10.44C13.5 16 13 14.83 13 14c0-1.04.2-1.9.5-2.65M10.5 16c.5.5 1 1.17 1 2 0 1.04-.2 1.9-.5 2.65m-2-12.09c.39-.28.8-.53 1.24-.75M14.76 3.18c.44.22.85.47 1.24.75m-6 12.09c-.39.28-.8.53-1.24.75M9.24 3.18c-.44.22-.85.47-1.24.75M12 6.03V4m0 17.03V21m-3.5-13.44c-.5.5-1 1.17-1 2 0 1.04.2 1.9.5 2.65m6.5-2.65c.5.5 1 1.17 1 2 0 1.04-.2 1.9-.5 2.65"/></svg>
  };
  return icons[name] || <div style={{ width: size, height: size }}>?</div>;
};

const Logo = ({ className = "" }) => (
  <div className={`flex items-center flex-shrink-0 ${className}`}>
    <div className="p-1.5 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl shadow-md">
      <Icon name="stethoscope" size={24} color="white" />
    </div>
    <span className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-900 to-indigo-800 ml-3 tracking-tight">
      Vaidya<span className="text-blue-600 font-extrabold">Mithra</span>
    </span>
  </div>
);

const SkeletonCard = () => (
  <div className="p-4 rounded-xl border border-gray-200 bg-gray-50 shadow-sm animate-pulse">
    <div className="flex justify-between items-center mb-3">
      <div className="h-5 w-3/5 bg-gray-300 rounded-md"></div>
      <div className="h-4 w-1/4 bg-gray-300 rounded-full"></div>
    </div>
    <div className="space-y-2">
      <div className="h-3 w-full bg-gray-300 rounded-md"></div>
      <div className="h-3 w-5/6 bg-gray-300 rounded-md"></div>
    </div>
  </div>
);

const Footer = ({ className = '' }) => (
  <div id="footer" className={`bg-white/70 backdrop-blur-sm border-t border-gray-200 py-4 px-4 sm:px-8 ${className}`}>
    <p className="text-xs text-gray-600 text-center max-w-4xl mx-auto mb-2">
      <strong>Disclaimer:</strong> This application is for informational and educational purposes only and is <strong>NOT</strong> a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of your physician with any questions you may have regarding a medical condition.
    </p>
    <p className="text-xs text-gray-500 text-center">
      &copy; {new Date().getFullYear()} Vaidya Mithra. All rights reserved.
    </p>
  </div>
);

// =================================================================================
// --- AUTHENTICATION SCREEN ---
// =================================================================================

const AuthScreen = ({ auth, db, appId }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('patient'); 
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Hardcoded Admin Override for Demonstration
    if (email === 'admin@gmail.com' && password === 'Admin@123') {
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err) {
            if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
                const userCred = await createUserWithEmailAndPassword(auth, email, password);
                await updateProfile(userCred.user, { displayName: 'Super Admin' });
                await setDoc(doc(db, 'artifacts', appId, 'users', userCred.user.uid, 'profile', 'data'), {
                    uid: userCred.user.uid, email, name: 'Super Admin', role: 'admin', status: 'approved', createdAt: serverTimestamp()
                });
            } else {
                setError(err.message);
            }
        }
        setLoading(false);
        return;
    }

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        await updateProfile(user, { displayName: name });
        
        // Doctors and attenders require admin approval
        const status = role === 'patient' ? 'approved' : 'pending';
        
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), {
          uid: user.uid, email: user.email, name, role, status, createdAt: serverTimestamp()
        });

        // Add to pending queue if needed
        if (status === 'pending') {
            await setDoc(doc(db, 'artifacts', appId, 'pending_users', user.uid), {
                uid: user.uid, email: user.email, name, role, status: 'pending', createdAt: serverTimestamp()
            });
        }
      }
    } catch (err) {
      console.error("Auth Error:", err);
      if (err.code === 'auth/operation-not-allowed') {
        setError("Email/Password auth is disabled. Enable it in your Firebase Console under Authentication > Sign-in method.");
      } else {
        setError(err.message.replace("Firebase: ", ""));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-100 via-white to-cyan-50 p-4">
      <div className="absolute inset-0 bg-grid-slate-100/[0.04] bg-[size:32px_32px]"></div>
      
      <div className="max-w-md w-full bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 p-8 z-10 relative overflow-hidden animate-fadeInUp">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-400"></div>
        <div className="flex justify-center mb-8"><Logo className="scale-110" /></div>
        
        <h2 className="text-3xl font-extrabold text-gray-900 text-center mb-2 tracking-tight">
          {isLogin ? 'Welcome Back' : 'Create Account'}
        </h2>
        <p className="text-gray-500 text-center mb-6">
          {isLogin ? 'Sign in to access your healthcare portal' : 'Join Vaidya Mithra today'}
        </p>

        <div className="flex p-1 bg-gray-100/80 rounded-xl mb-6">
          <button onClick={() => {setIsLogin(true); setError('');}} className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-300 ${isLogin ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Sign In</button>
          <button onClick={() => {setIsLogin(false); setError('');}} className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-300 ${!isLogin ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Sign Up</button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100 flex items-start">
            <Icon name="alertTriangle" size={16} className="mr-2 mt-0.5 flex-shrink-0" /><span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Icon name="user" size={18} className="text-gray-400" /></div>
                  <input type="text" value={name} onChange={e=>setName(e.target.value)} required className="w-full pl-10 pr-4 py-3 bg-white/50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" placeholder="John Doe" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Role</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Icon name="users" size={18} className="text-gray-400" /></div>
                  <select value={role} onChange={e=>setRole(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-white/50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none appearance-none">
                    <option value="patient">Patient</option>
                    <option value="doctor">Doctor</option>
                    <option value="attender">Attender</option>
                  </select>
                </div>
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Icon name="mail" size={18} className="text-gray-400" /></div>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required className="w-full pl-10 pr-4 py-3 bg-white/50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" placeholder="name@example.com" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Icon name="shield" size={18} className="text-gray-400" /></div>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={6} className="w-full pl-10 pr-4 py-3 bg-white/50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" placeholder="••••••••" />
            </div>
          </div>
          <button type="submit" disabled={loading} className="w-full mt-2 py-3.5 px-4 text-white font-bold rounded-xl shadow-lg transition-all duration-300 transform hover:-translate-y-0.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 flex items-center justify-center disabled:opacity-70">
            {loading ? 'Processing...' : (isLogin ? 'Sign In to Portal' : 'Create Account')}
            {!loading && <Icon name="chevronRight" size={20} className="ml-2" />}
          </button>
        </form>
      </div>
    </div>
  );
};

const PendingApprovalScreen = ({ auth }) => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
    <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-gray-100 p-8 text-center animate-fadeInUp">
      <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <Icon name="clock" size={32} className="text-amber-600" />
      </div>
      <h2 className="text-2xl font-extrabold text-gray-900 mb-3">Account Pending Review</h2>
      <p className="text-gray-600 mb-8 leading-relaxed">
        Your registration as a healthcare professional has been received. Please wait while administration verifies your credentials. You will be granted access once approved.
      </p>
      <button onClick={() => signOut(auth)} className="px-6 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition">
        Sign Out
      </button>
    </div>
  </div>
);

// =================================================================================
// --- DYNAMIC NAVBAR WITH NOTIFICATIONS ---
// =================================================================================

const NavBar = ({ currentPage, onNavigate, userRole, auth, db, userId, appId }) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [showNotifMenu, setShowNotifMenu] = useState(false);
    
    // Patient Notifications Listener
    useEffect(() => {
        if (!userId || !db || !appId || userRole !== 'patient') return;
        const q = query(collection(db, `artifacts/${appId}/users/${userId}/notifications`), orderBy('timestamp', 'desc'), limit(10));
        return onSnapshot(q, (snap) => setNotifications(snap.docs.map(d => ({id: d.id, ...d.data()}))));
    }, [db, userId, appId, userRole]);

    const markAsRead = async (notifId) => {
        await updateDoc(doc(db, `artifacts/${appId}/users/${userId}/notifications`, notifId), { read: true });
    };

    const getNavItems = () => {
      if (userRole === 'admin') return [{ id: "admin-home", name: "Dashboard", icon: "activity" }];
      if (userRole === 'doctor') return [{ id: "doctor-home", name: "My Queue", icon: "users" }];
      if (userRole === 'attender') return [{ id: "attender-home", name: "Triage & Scheduling", icon: "calendar" }];
      return [
          { id: "home", name: "Home", icon: "home" },
          { id: "appointments", name: "Appointments", icon: "calendar" },
          { id: "prediction", name: "AI Triage", icon: "activity" },
          { id: "docbot", name: "DocBot", icon: "messageSquare" },
          { id: "hospitals", name: "Hospitals", icon: "hospital" },
      ];
    };

    const navItems = getNavItems();
    const handleNavigation = (id) => { onNavigate(id); setIsMenuOpen(false); };
    const unreadCount = notifications.filter(n => !n.read).length;

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md shadow-sm border-b border-gray-200/80 flex-shrink-0 transition-all">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                    <a href="#" onClick={(e) => { e.preventDefault(); handleNavigation(navItems[0].id); }} className="no-underline">
                        <Logo />
                    </a>
                    
                    <div className="hidden md:flex items-center space-x-1">
                        {navItems.map((item) => {
                            const isActive = currentPage === item.id;
                            return (
                                <button key={item.id} onClick={() => handleNavigation(item.id)} className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center transition duration-150 ${isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}>
                                    <Icon name={item.icon} size={18} className="mr-2" /> {item.name}
                                </button>
                            );
                        })}
                        
                        {/* Notification Bell */}
                        {userRole === 'patient' && (
                            <div className="relative ml-2">
                                <button onClick={() => setShowNotifMenu(!showNotifMenu)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-full relative">
                                    <Icon name="bell" size={20} />
                                    {unreadCount > 0 && <span className="absolute top-1 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>}
                                </button>
                                {showNotifMenu && (
                                    <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50">
                                        <div className="p-4 bg-gray-50 border-b border-gray-100 font-bold text-gray-800">Notifications</div>
                                        <div className="max-h-64 overflow-y-auto">
                                            {notifications.length === 0 ? <p className="p-4 text-sm text-gray-500 text-center">No notifications yet.</p> : 
                                                notifications.map(n => (
                                                    <div key={n.id} onClick={() => markAsRead(n.id)} className={`p-4 border-b border-gray-50 text-sm cursor-pointer hover:bg-gray-50 transition ${!n.read ? 'bg-blue-50/50' : ''}`}>
                                                        <p className={`${!n.read ? 'font-bold text-gray-900' : 'text-gray-700'}`}>{n.message}</p>
                                                    </div>
                                                ))
                                            }
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="w-px h-6 bg-gray-200 mx-3"></div>
                        <button onClick={() => signOut(auth)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition" title="Sign Out">
                          <Icon name="logOut" size={20} />
                        </button>
                    </div>
                    
                    <button className="md:hidden p-2 text-gray-700 hover:bg-gray-100 rounded-lg" onClick={() => setIsMenuOpen(!isMenuOpen)}>
                         {isMenuOpen ? <Icon name="x" size={24} /> : <Icon name="menu" size={24} />}
                    </button>
                </div>
            </div>

            {isMenuOpen && (
                <div className="md:hidden absolute top-16 left-0 w-full bg-white/95 backdrop-blur-lg shadow-xl border-t border-gray-200/80">
                    <div className="flex flex-col p-4 space-y-2">
                        {navItems.map((item) => (
                            <button key={item.id} onClick={() => handleNavigation(item.id)} className={`px-4 py-3 text-left rounded-xl text-lg font-medium flex items-center ${currentPage === item.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}>
                                <Icon name={item.icon} size={20} className="mr-3" /> {item.name}
                            </button>
                        ))}
                        <button onClick={() => signOut(auth)} className="px-4 py-3 text-left rounded-xl text-lg font-medium flex items-center text-red-600 hover:bg-red-50">
                          <Icon name="logOut" size={20} className="mr-3" /> Sign Out
                        </button>
                    </div>
                </div>
            )}
        </nav>
    );
};

// =================================================================================
// --- DASHBOARDS FOR ALL ROLES ---
// =================================================================================

const StatCard = ({ title, value, icon, colorClass }) => (
  <div className="bg-white/80 backdrop-blur-lg rounded-2xl p-6 border border-gray-200/50 shadow-sm">
    <div className="flex justify-between items-start">
      <div><p className="text-sm font-medium text-gray-500 mb-1">{title}</p><h3 className="text-3xl font-extrabold text-gray-900">{value}</h3></div>
      <div className={`p-3 rounded-xl ${colorClass}`}><Icon name={icon} size={24} /></div>
    </div>
  </div>
);

const AppointmentBadge = ({ status }) => {
    const styles = {
        requested: 'bg-yellow-100 text-yellow-800',
        scheduled: 'bg-blue-100 text-blue-800',
        ready: 'bg-purple-100 text-purple-800',
        completed: 'bg-green-100 text-green-800'
    };
    return <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${styles[status]}`}>{status}</span>;
};

// --- ADMIN DASHBOARD ---
const AdminDashboard = ({ db, appId }) => {
    const [pendingUsers, setPendingUsers] = useState([]);
    useEffect(() => {
        const q = query(collection(db, `artifacts/${appId}/pending_users`), orderBy('createdAt', 'desc'));
        return onSnapshot(q, (snap) => setPendingUsers(snap.docs.map(d => ({id: d.id, ...d.data()}))));
    }, [db, appId]);

    const handleApprove = async (user) => {
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), { status: 'approved' });
        if (user.role === 'doctor') await setDoc(doc(db, 'artifacts', appId, 'approved_doctors', user.uid), { uid: user.uid, name: user.name });
        await deleteDoc(doc(db, 'artifacts', appId, 'pending_users', user.uid));
    };

    return (
        <div className="p-4 sm:p-8 max-w-7xl mx-auto h-full animate-fadeInUp">
            <h1 className="text-3xl font-extrabold text-gray-900 mb-8">Admin Control Center</h1>
            <h3 className="font-bold text-lg mb-4 text-blue-800">Pending Approvals</h3>
            {pendingUsers.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center"><p>No pending approvals.</p></div>
            ) : (
                <div className="grid gap-4">
                    {pendingUsers.map(user => (
                        <div key={user.id} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex justify-between items-center">
                            <div><p className="font-bold">{user.name}</p><p className="text-sm text-gray-500 uppercase">{user.role}</p></div>
                            <button onClick={() => handleApprove(user)} className="px-4 py-2 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700">Approve</button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// --- ATTENDER DASHBOARD ---
const AttenderDashboard = ({ db, appId, userId }) => {
    const [appointments, setAppointments] = useState([]);
    const [doctors, setDoctors] = useState([]);
    const [scheduleModal, setScheduleModal] = useState(null); 
    const [vitalsModal, setVitalsModal] = useState(null);

    useEffect(() => {
        const unsubApt = onSnapshot(query(collection(db, `artifacts/${appId}/appointments`), orderBy('timestamp', 'desc')), (snap) => setAppointments(snap.docs.map(d => ({id: d.id, ...d.data()}))));
        const unsubDoc = onSnapshot(collection(db, `artifacts/${appId}/approved_doctors`), (snap) => setDoctors(snap.docs.map(d => d.data())));
        return () => { unsubApt(); unsubDoc(); };
    }, [db, appId]);

    const handleSchedule = async (e) => {
        e.preventDefault();
        const docId = e.target.doctorId.value;
        const doctorName = doctors.find(d => d.uid === docId)?.name || 'Doctor';
        await updateDoc(doc(db, `artifacts/${appId}/appointments`, scheduleModal.id), { status: 'scheduled', doctorId: docId, doctorName, date: e.target.date.value, time: e.target.time.value });
        await setDoc(doc(collection(db, `artifacts/${appId}/users/${scheduleModal.patientId}/notifications`)), { message: `Your appointment is scheduled with ${doctorName} on ${e.target.date.value} at ${e.target.time.value}.`, timestamp: serverTimestamp(), read: false });
        setScheduleModal(null);
    };

    const handleVitals = async (e) => {
        e.preventDefault();
        await updateDoc(doc(db, `artifacts/${appId}/appointments`, vitalsModal.id), { status: 'ready', vitals: { bp: e.target.bp.value, hr: e.target.hr.value, glucose: e.target.glucose.value } });
        setVitalsModal(null);
    };

    return (
        <div className="p-4 sm:p-8 max-w-7xl mx-auto h-full animate-fadeInUp">
            <h1 className="text-3xl font-extrabold text-gray-900 mb-6">Attender Triage Hub</h1>
            <div className="grid gap-4">
                <h3 className="font-bold text-lg text-blue-800">New Requests</h3>
                {appointments.filter(a => a.status === 'requested').map(a => (
                    <div key={a.id} className="bg-white p-5 rounded-2xl border border-gray-200 flex justify-between items-center">
                        <div><p className="font-bold">{a.patientName}</p><p className="text-sm">Reason: {a.reason}</p></div>
                        <button onClick={() => setScheduleModal(a)} className="px-4 py-2 bg-blue-600 text-white font-bold rounded-xl">Schedule</button>
                    </div>
                ))}
                <h3 className="font-bold text-lg text-purple-800 mt-4">Scheduled Arrivals</h3>
                {appointments.filter(a => a.status === 'scheduled').map(a => (
                    <div key={a.id} className="bg-white p-5 rounded-2xl border border-gray-200 flex justify-between items-center">
                        <div><p className="font-bold">{a.patientName}</p><p className="text-sm">With {a.doctorName} at {a.time}</p></div>
                        <button onClick={() => setVitalsModal(a)} className="px-4 py-2 bg-purple-600 text-white font-bold rounded-xl">Enter Vitals</button>
                    </div>
                ))}
            </div>

            {/* Modals for Attender */}
            {scheduleModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <form onSubmit={handleSchedule} className="bg-white p-6 rounded-3xl w-full max-w-md"><h3 className="font-bold text-xl mb-4">Schedule</h3>
                        <div className="space-y-4">
                            <select name="doctorId" required className="w-full p-3 border rounded-xl">{doctors.map(d => <option key={d.uid} value={d.uid}>{d.name}</option>)}</select>
                            <input type="date" name="date" required className="w-full p-3 border rounded-xl"/>
                            <input type="time" name="time" required className="w-full p-3 border rounded-xl"/>
                        </div>
                        <div className="mt-6 flex justify-end space-x-3"><button type="button" onClick={()=>setScheduleModal(null)} className="px-4 py-2 text-gray-600">Cancel</button><button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-xl">Confirm</button></div>
                    </form>
                </div>
            )}
            {vitalsModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <form onSubmit={handleVitals} className="bg-white p-6 rounded-3xl w-full max-w-md"><h3 className="font-bold text-xl mb-4">Record Vitals</h3>
                        <div className="space-y-4"><input type="text" name="bp" placeholder="BP (e.g. 120/80)" required className="w-full p-3 border rounded-xl"/><input type="number" name="hr" placeholder="Heart Rate" required className="w-full p-3 border rounded-xl"/><input type="number" name="glucose" placeholder="Glucose" className="w-full p-3 border rounded-xl"/></div>
                        <div className="mt-6 flex justify-end space-x-3"><button type="button" onClick={()=>setVitalsModal(null)} className="px-4 py-2 text-gray-600">Cancel</button><button type="submit" className="px-4 py-2 bg-purple-600 text-white rounded-xl">Save</button></div>
                    </form>
                </div>
            )}
        </div>
    );
};

// --- DOCTOR DASHBOARD ---
const DoctorDashboard = ({ db, appId, userId }) => {
    const [appointments, setAppointments] = useState([]);
    const [consultModal, setConsultModal] = useState(null);

    useEffect(() => {
        const q = query(collection(db, `artifacts/${appId}/appointments`), orderBy('timestamp', 'desc'));
        return onSnapshot(q, (snap) => setAppointments(snap.docs.map(d => ({id: d.id, ...d.data()})).filter(a => a.doctorId === userId)));
    }, [db, appId, userId]);

    const handleComplete = async (e) => {
        e.preventDefault();
        await updateDoc(doc(db, `artifacts/${appId}/appointments`, consultModal.id), { status: 'completed', doctorNotes: e.target.notes.value, completedAt: serverTimestamp() });
        setConsultModal(null);
    };

    return (
        <div className="p-4 sm:p-8 max-w-7xl mx-auto h-full animate-fadeInUp">
            <h1 className="text-3xl font-extrabold text-gray-900 mb-6">Doctor Workspace</h1>
            <h3 className="font-bold text-lg mb-4 text-green-800">Patients Ready</h3>
            <div className="grid gap-4">
                {appointments.filter(a => a.status === 'ready').map(a => (
                    <div key={a.id} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex justify-between items-center">
                        <div>
                            <p className="font-bold text-lg">{a.patientName}</p>
                            <p className="text-sm text-gray-600">BP: {a.vitals?.bp} | HR: {a.vitals?.hr}</p>
                        </div>
                        <button onClick={() => setConsultModal(a)} className="px-6 py-2 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700">Start</button>
                    </div>
                ))}
            </div>

            {consultModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <form onSubmit={handleComplete} className="bg-white p-6 rounded-3xl w-full max-w-lg">
                        <h3 className="font-bold text-xl mb-4">Consultation: {consultModal.patientName}</h3>
                        <p className="text-sm bg-gray-50 p-3 rounded-xl mb-4"><strong>Reason:</strong> {consultModal.reason}</p>
                        <textarea name="notes" required rows="4" placeholder="Prescription & Notes..." className="w-full p-4 border rounded-xl outline-none"></textarea>
                        <div className="mt-6 flex justify-end space-x-3"><button type="button" onClick={()=>setConsultModal(null)} className="px-4 py-2">Cancel</button><button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-xl">Complete Consultation</button></div>
                    </form>
                </div>
            )}
        </div>
    );
};

// --- PATIENT APPOINTMENTS ---
const PatientAppointments = ({ db, userId, appId, userName }) => {
    const [appointments, setAppointments] = useState([]);
    const [isBooking, setIsBooking] = useState(false);
    const [reason, setReason] = useState('');

    useEffect(() => {
        const q = query(collection(db, `artifacts/${appId}/appointments`), orderBy('timestamp', 'desc'));
        return onSnapshot(q, (snap) => setAppointments(snap.docs.map(d => ({id: d.id, ...d.data()})).filter(a => a.patientId === userId)));
    }, [db, userId, appId]);

    const handleBook = async (e) => {
        e.preventDefault();
        await setDoc(doc(collection(db, `artifacts/${appId}/appointments`)), { patientId: userId, patientName: userName || 'Patient', reason, status: 'requested', timestamp: serverTimestamp() });
        setIsBooking(false); setReason('');
    };

    return (
        <div className="p-4 sm:p-8 max-w-4xl mx-auto animate-fadeInUp">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-extrabold text-gray-900">My Appointments</h1>
                <button onClick={() => setIsBooking(true)} className="px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl shadow-md">Book New</button>
            </div>
            {isBooking && (
                <form onSubmit={handleBook} className="bg-white p-6 rounded-2xl shadow-lg mb-8">
                    <label className="block font-bold mb-2">Reason for Visit</label>
                    <textarea value={reason} onChange={e=>setReason(e.target.value)} required rows="3" className="w-full p-3 border rounded-xl mb-4"></textarea>
                    <div className="flex justify-end"><button type="button" onClick={()=>setIsBooking(false)} className="px-4 py-2 mr-2">Cancel</button><button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-xl">Submit Request</button></div>
                </form>
            )}
            <div className="space-y-4">
                {appointments.map(a => (
                    <div key={a.id} className="bg-white p-5 rounded-2xl shadow-sm border">
                        <div className="flex justify-between mb-2">
                            <AppointmentBadge status={a.status} />
                            {(a.status==='scheduled'||a.status==='ready') && <span className="font-bold text-blue-600">{a.date} @ {a.time} with {a.doctorName}</span>}
                        </div>
                        <p className="text-sm"><strong>Reason:</strong> {a.reason}</p>
                        {a.status === 'completed' && <div className="mt-4 pt-4 border-t"><p className="text-sm font-bold text-green-700">Doctor's Notes:</p><p className="text-sm">{a.doctorNotes}</p></div>}
                    </div>
                ))}
            </div>
        </div>
    );
};

// =================================================================================
// --- PATIENT COMPONENTS (ORIGINAL AI FEATURES) ---
// =================================================================================

const HomePage = ({ onNavigate }) => (
  <div className="h-full flex flex-col items-center justify-center bg-gradient-to-r from-blue-500 to-cyan-500 overflow-hidden p-4 sm:p-8">
    <div className="absolute inset-0 opacity-10 bg-cover bg-center" style={{backgroundImage: "url('https://placehold.co/1920x800/ffffff/000000?text=Health+Data+Analysis')"}}></div>
    <div className="z-10 text-center text-white p-4 max-w-4xl">
      <h1 className="text-4xl md:text-6xl font-extrabold mb-4 drop-shadow-lg tracking-tight animate-fadeInUp">Welcome to Vaidya Mithra</h1>
      <p className="text-lg md:text-xl mb-8 font-light drop-shadow-md animate-fadeInUp" style={{animationDelay: '0.1s'}}>Get non-diagnostic insights and next steps in seconds. Powered by Gemini AI for responsible health guidance.</p>
      <button onClick={() => onNavigate('prediction')} className="inline-flex items-center px-8 py-3 bg-white text-blue-700 text-lg font-bold rounded-xl shadow-xl hover:scale-105 transition-all animate-fadeInUp" style={{animationDelay: '0.2s'}}>Start AI Triage <Icon name="chevronRight" size={24} className="ml-2" /></button>
    </div>
  </div>
);

const PredictionPage = ({ db, userId, authReady, appId }) => {
  const [selectedSymptoms, setSelectedSymptoms] = useState([]);
  const [age, setAge] = useState(30);
  const [gender, setGender] = useState('Male');
  const [predictionResult, setPredictionResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState(SYMPTOM_CATEGORIES[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (!authReady || !userId || !db || !appId) return;
    try {
      const q = query(collection(db, `artifacts/${appId}/users/${userId}/symptom_history`), orderBy('timestamp', 'desc'), limit(5));
      return onSnapshot(q, (snapshot) => setHistory(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }))));
    } catch (e) { console.error(e); }
  }, [db, userId, authReady, appId]);

  const handlePrediction = useCallback(async () => {
    if (selectedSymptoms.length === 0) return;
    setIsLoading(true); setPredictionResult(null);
    setTimeout(() => document.getElementById('prediction-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);

    const userQuery = `The patient is a ${age} year old ${gender}. Symptoms: ${selectedSymptoms.join(', ')}. Act as a professional medical analyst. Provide top 3 differential diagnoses, confidence score (0.0 to 1.0), and concise next steps. Focus strictly on JSON output.`;

    try {
      const payload = { contents: [{ parts: [{ text: userQuery }] }], generationConfig: { responseMimeType: "application/json", responseSchema: JSON_SCHEMA } };
      const response = await fetch(GEMINI_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json();
      const parsedResult = JSON.parse(result.candidates?.[0]?.content?.parts?.[0]?.text);
      setPredictionResult(parsedResult);
      if (db && userId && appId) {
        await setDoc(doc(collection(db, `artifacts/${appId}/users/${userId}/symptom_history`)), { symptoms: selectedSymptoms, age, gender, result: parsedResult, timestamp: serverTimestamp() });
      }
    } catch (error) {
      setPredictionResult({ error: `Prediction failed. Please check API Key.` });
    } finally { setIsLoading(false); }
  }, [selectedSymptoms, age, gender, db, userId, appId]);

  const toggleSymptom = (s) => setSelectedSymptoms(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);
  const isEmergency = predictionResult?.emergency_flag || selectedSymptoms.some(s => s.toLowerCase().includes('chest pain') || s.toLowerCase().includes('difficulty breathing'));
  const filteredSymptoms = useMemo(() => {
    let symptoms = searchQuery ? SYMPTOM_CATEGORIES.flatMap(cat => ALL_SYMPTOMS_CATEGORIZED[cat]) : ALL_SYMPTOMS_CATEGORIZED[activeCategory] || [];
    return symptoms.filter(s => s.toLowerCase().includes(searchQuery.toLowerCase())).sort((a, b) => a.localeCompare(b));
  }, [activeCategory, searchQuery]);

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto w-full animate-fadeInUp">
      <div className="mb-6"><h2 className="text-3xl font-extrabold text-gray-900">Symptom Assessment</h2></div>
      
      <div className="bg-white/80 backdrop-blur-lg shadow-sm rounded-2xl border border-gray-200/50 p-6 mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="block"><span className="text-sm font-bold text-gray-700">Age:</span><input type="number" value={age} onChange={e => setAge(Math.max(1, parseInt(e.target.value) || 1))} className="mt-1 w-full p-3 bg-gray-50 border rounded-xl" /></label>
          <label className="block"><span className="text-sm font-bold text-gray-700">Gender:</span><select value={gender} onChange={e => setGender(e.target.value)} className="mt-1 w-full p-3 bg-gray-50 border rounded-xl"><option>Male</option><option>Female</option></select></label>
          <label className="block"><span className="text-sm font-bold text-gray-700">Search:</span><input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search..." className="mt-1 w-full p-3 bg-gray-50 border rounded-xl" /></label>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-1/2 bg-white/80 shadow-sm rounded-2xl border border-gray-200/50 p-5">
          <div className="flex space-x-2 overflow-x-auto pb-3 mb-2 border-b border-gray-100 hide-scrollbar">
            {SYMPTOM_CATEGORIES.map(cat => (
              <button key={cat} onClick={() => { setActiveCategory(cat); setSearchQuery(''); }} className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap ${activeCategory === cat && !searchQuery ? 'bg-gray-900 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>{cat}</button>
            ))}
          </div>
          <div className="overflow-y-auto pr-2 grid grid-cols-2 gap-3 max-h-[350px]">
            {filteredSymptoms.map(symptom => (
              <button key={symptom} onClick={() => toggleSymptom(symptom)} className={`p-3 text-sm rounded-xl text-left ${selectedSymptoms.includes(symptom) ? 'bg-blue-600 text-white font-bold' : 'bg-gray-50 border hover:bg-gray-100'}`}>{symptom}</button>
            ))}
          </div>
        </div>

        <div className="lg:w-1/2 flex flex-col bg-white/80 shadow-sm rounded-2xl border border-gray-200/50 p-5">
          <h3 className="text-lg font-bold text-gray-900 mb-3">Selected ({selectedSymptoms.length})</h3>
          <div className="flex-grow flex flex-wrap content-start gap-2 bg-gray-50 rounded-xl p-4 border border-dashed overflow-y-auto min-h-[150px]">
            {selectedSymptoms.length === 0 ? <p className="text-gray-400 italic m-auto text-sm">Start selecting symptoms...</p> : 
              selectedSymptoms.map(symptom => (
                <div key={symptom} className="flex h-fit items-center bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1.5 rounded-full">
                  {symptom} <button onClick={() => toggleSymptom(symptom)} className="ml-2 text-blue-600 hover:text-red-500"><Icon name="x" size={14} /></button>
                </div>
              ))
            }
          </div>
          <div className="flex justify-end space-x-3 mt-4">
            <button onClick={() => setSelectedSymptoms([])} className="px-5 py-2.5 text-sm font-bold text-gray-600 bg-gray-200 rounded-xl">Clear</button>
            <button onClick={handlePrediction} disabled={selectedSymptoms.length===0 || isLoading} className="px-6 py-2.5 text-white font-bold bg-blue-600 rounded-xl shadow-md disabled:opacity-50">
              {isLoading ? "Analyzing..." : "Get AI Triage"}
            </button>
          </div>
        </div>
      </div>

      <div id="prediction-results" className="mt-8">
        {isLoading && <div className="space-y-4"><SkeletonCard /></div>}
        {isEmergency && !isLoading && (
          <div className="bg-red-50 border border-red-200 p-5 rounded-2xl mb-6 flex items-start text-red-800"><Icon name="alertTriangle" size={28} className="mt-0.5 mr-3" color="#ef4444" /><div><h4 className="font-extrabold text-lg">EMERGENCY WARNING</h4><p className="text-sm">Seek professional medical help immediately.</p></div></div>
        )}
        {predictionResult && !isLoading && !predictionResult.error && (
          <div className="space-y-4">
             <h3 className="text-2xl font-extrabold text-gray-900 mb-2 border-b pb-3">AI Diagnostic Report</h3>
             <p className="text-xs text-amber-600 font-bold mb-4 bg-amber-50 p-2 rounded-lg border border-amber-200 inline-block">Educational information only. Consult qualified healthcare professionals.</p>
            {predictionResult.predictions.map((p, index) => (
                <div key={index} className="p-6 rounded-2xl border border-gray-100 bg-white shadow-sm">
                  <div className="flex justify-between items-center mb-3"><h4 className="font-extrabold text-xl text-gray-900">{p.disease}</h4><span className="font-extrabold">{Math.round(p.confidence * 100)}%</span></div>
                  <div className="w-full bg-gray-100 rounded-full h-2 mb-4"><div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.round(p.confidence * 100)}%` }}></div></div>
                  <p className="text-sm text-gray-600">{p.description}</p>
                </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const DocBotPage = ({ db, userId, authReady, appId }) => {
  const [chatHistory, setChatHistory] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatHistory]);
  useEffect(() => {
    if (!authReady || !userId || !db || !appId) return;
    const q = query(collection(db, `artifacts/${appId}/users/${userId}/docbot_chat`), orderBy('timestamp', 'asc'), limit(50));
    return onSnapshot(q, (snapshot) => setChatHistory(snapshot.docs.map(doc => ({...doc.data(), id: doc.id }))));
  }, [db, userId, authReady, appId]);

  const handleSend = async (messageText) => {
    const message = (typeof messageText === 'string') ? messageText : currentMessage;
    if (!message.trim() || isTyping || !db) return;
    const userMessage = message.trim(); setCurrentMessage('');
    const colRef = collection(db, `artifacts/${appId}/users/${userId}/docbot_chat`);
    await setDoc(doc(colRef), { text: userMessage, role: 'user', timestamp: serverTimestamp() });
    setIsTyping(true);

    try {
      const apiHistory = chatHistory.map(msg => ({ role: msg.role === 'ai' ? 'model' : 'user', parts: [{ text: msg.text }] }));
      apiHistory.push({ role: 'user', parts: [{ text: userMessage }] });
      const payload = { contents: apiHistory, tools: [{ "google_search": {} }], systemInstruction: { parts: [{ text: "You are DocBot. Answer health questions safely. Add: Educational info only." }] } };
      const res = await fetch(GEMINI_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await res.json();
      await setDoc(doc(colRef), { text: result.candidates[0].content.parts[0].text, role: 'ai', timestamp: serverTimestamp() });
    } catch (e) {
      await setDoc(doc(colRef), { text: "Error connecting to AI.", role: 'ai_error', timestamp: serverTimestamp() });
    } finally { setIsTyping(false); }
  };

  return (
    <div className="h-full p-4 md:p-8 max-w-4xl mx-auto w-full flex flex-col">
      <div className="bg-white/90 backdrop-blur-xl shadow-sm rounded-3xl border border-gray-200/50 flex flex-col flex-grow overflow-hidden">
        <div className="flex-grow overflow-y-auto p-4 md:p-6 bg-gray-50/30 flex flex-col space-y-4">
          {chatHistory.length === 0 ? <p className="m-auto text-gray-500">Ask DocBot a question.</p> : chatHistory.map((msg, idx) => (
              <div key={idx} className={`max-w-[85%] sm:max-w-md p-4 rounded-2xl shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white self-end rounded-br-sm' : 'bg-white text-gray-800 self-start rounded-tl-sm'}`}><p className="whitespace-pre-wrap text-sm">{msg.text}</p></div>
          ))}
          {isTyping && <div className="self-start bg-white p-4 rounded-2xl"><span className="dot-flashing"></span></div>}
          <div ref={messagesEndRef} />
        </div>
        <div className="p-4 bg-white border-t flex items-center">
          <input type="text" value={currentMessage} onChange={e => setCurrentMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} className="flex-grow p-3 bg-gray-50 border rounded-2xl mr-2" placeholder="Ask a health question..." />
          <button onClick={handleSend} className="p-3 bg-blue-600 text-white rounded-xl"><Icon name="send" size={18} /></button>
        </div>
      </div>
    </div>
  );
};

// =================================================================================
// --- MAIN APP COMPONENT ---
// =================================================================================
const App = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState(null); 
  const [authReady, setAuthReady] = useState(false);
  const [appId, setAppId] = useState(null);
  const [currentPage, setCurrentPage] = useState('');
  const [initError, setInitError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    try {
      const firebaseConfigStr = getEnvVar('VITE_FIREBASE_CONFIG') || '{}';
      if (firebaseConfigStr === '{}') { setInitError("Missing VITE_FIREBASE_CONFIG"); setAuthReady(true); return; }
      
      const config = JSON.parse(firebaseConfigStr);
      const newAppId = config.appId;
      
      const appInstance = initializeApp(config);
      const firestoreInstance = getFirestore(appInstance);
      const authInstance = getAuth(appInstance);
      
      if (isMounted) {
        setDb(firestoreInstance);
        setAuth(authInstance);
        setAppId(newAppId);
      }

      const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
        if (!isMounted) return;
        if (user) {
          setUserId(user.uid);
          setUserName(user.displayName);
          try {
            const profileSnap = await getDoc(doc(firestoreInstance, 'artifacts', newAppId, 'users', user.uid, 'profile', 'data'));
            if (profileSnap.exists()) {
              const data = profileSnap.data();
              setUserRole(data.role);
              if (data.status === 'pending') setCurrentPage('pending');
              else if(data.role === 'doctor') setCurrentPage('doctor-home');
              else if(data.role === 'attender') setCurrentPage('attender-home');
              else if(data.role === 'admin') setCurrentPage('admin-home');
              else setCurrentPage('home');
            } else { setUserRole('patient'); setCurrentPage('home'); }
          } catch (err) { setUserRole('patient'); setCurrentPage('home'); }
        } else {
          setUserId(null); setUserRole(null); setCurrentPage('');
        }
        setAuthReady(true);
      });
      return () => unsubscribe();
    } catch (e) {
      if (isMounted) setAuthReady(true);
    }
    return () => { isMounted = false; };
  }, []);

  const renderContent = () => {
    if (initError) return <div className="h-full flex items-center justify-center p-8 text-red-500">{initError}</div>;
    if (!authReady) return <div className="h-full flex items-center justify-center"><span className="dot-flashing"></span></div>;
    if (!userId) return <AuthScreen auth={auth} db={db} appId={appId} />;
    if (currentPage === 'pending') return <PendingApprovalScreen auth={auth} />;

    const pageContainerClasses = "h-full w-full pt-16 overflow-y-auto";
    switch (currentPage) {
      case 'home': return <div className={pageContainerClasses}><HomePage onNavigate={setCurrentPage} /></div>;
      case 'prediction': return <div className={pageContainerClasses}><PredictionPage db={db} userId={userId} authReady={authReady} appId={appId} /></div>;
      case 'docbot': return <div className={pageContainerClasses}><DocBotPage db={db} userId={userId} authReady={authReady} appId={appId} /></div>;
      case 'appointments': return <div className={pageContainerClasses}><PatientAppointments db={db} userId={userId} appId={appId} userName={userName} /></div>;
      case 'doctor-home': return <div className={pageContainerClasses}><DoctorDashboard db={db} appId={appId} userId={userId} /></div>;
      case 'attender-home': return <div className={pageContainerClasses}><AttenderDashboard db={db} appId={appId} userId={userId} /></div>;
      case 'admin-home': return <div className={pageContainerClasses}><AdminDashboard db={db} appId={appId} /></div>;
      default: return <div className={pageContainerClasses}><HomePage onNavigate={setCurrentPage} /></div>;
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-gradient-to-br from-gray-50 to-blue-50/30 font-inter overflow-hidden">
      <style>{`
        body { font-family: 'Inter', sans-serif; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .animate-fadeInUp { animation: fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-fadeIn { animation: fadeIn 0.4s ease-out forwards; }
        .dot-flashing { position: relative; width: 5px; height: 5px; border-radius: 5px; background-color: #3b82f6; animation: dotFlashing 1s infinite linear alternate; display: inline-block; }
        .dot-flashing::before, .dot-flashing::after { content: ""; display: inline-block; position: absolute; top: 0; width: 5px; height: 5px; border-radius: 5px; background-color: #3b82f6; animation: dotFlashing 1s infinite alternate; }
        .dot-flashing::before { left: -8px; animation-delay: 0.4s; }
        .dot-flashing::after { left: 8px; animation-delay: 0.8s; }
        @keyframes dotFlashing { 0% { opacity: 0.2; } 50% { opacity: 1; } 100% { opacity: 0.2; } }
      `}</style>
      
      {userId && currentPage !== 'pending' && <NavBar currentPage={currentPage} onNavigate={setCurrentPage} userRole={userRole} auth={auth} db={db} userId={userId} appId={appId} />}
      <main className="flex-grow overflow-hidden relative z-10">{renderContent()}</main>
      <Footer className="flex-shrink-0 z-20 bg-white" />
    </div>
  );
};

export default App;
