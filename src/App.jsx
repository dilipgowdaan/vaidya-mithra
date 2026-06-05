import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc,
  deleteDoc,
  updateDoc,
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  serverTimestamp, 
  setLogLevel 
} from 'firebase/firestore';

const getEnvVar = (key) => {
  try { return import.meta.env[key]; } catch(e) { return undefined; }
};

const apiKey = getEnvVar('VITE_VAIDYA_MITHRA_GEMINI_KEY') || "";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

// Global Firebase Setup
let app, auth, db, globalAppId;
try {
  const fbConfigStr = typeof __firebase_config !== 'undefined' ? __firebase_config : getEnvVar('VITE_FIREBASE_CONFIG');
  if (fbConfigStr && fbConfigStr !== '{}') {
    const config = JSON.parse(fbConfigStr);
    app = initializeApp(config);
    auth = getAuth(app);
    db = getFirestore(app);
    globalAppId = typeof __app_id !== 'undefined' ? __app_id : (config.appId || 'default-app-id');
  }
} catch (e) {
  console.error("Firebase Global Initialization Error:", e);
}

const JSON_SCHEMA = {
  type: "OBJECT",
  properties: {
    emergency_flag: { type: "BOOLEAN", description: "True if symptoms indicate severe emergency." },
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
    clock: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
  };
  return icons[name] || <div style={{ width: size, height: size }}>?</div>;
};

const Logo = () => (
  <div className="flex items-center flex-shrink-0">
    <div className="p-1 bg-blue-600 rounded-lg shadow-md">
      <Icon name="stethoscope" size={24} color="white" />
    </div>
    <span className="text-2xl font-bold text-blue-800 ml-3 tracking-tight">
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

const Footer = () => (
  <div id="footer" className="bg-white/70 backdrop-blur-sm border-t border-gray-200 py-4 px-4 sm:px-8">
    <p className="text-xs text-gray-600 text-center max-w-4xl mx-auto mb-2">
      <strong>Disclaimer:</strong> This application is for informational and educational purposes only and is <strong>NOT</strong> a substitute for professional medical advice, diagnosis, or treatment.
    </p>
    <p className="text-xs text-gray-500 text-center">&copy; {new Date().getFullYear()} Vaidya Mithra. All rights reserved.</p>
  </div>
);

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

    // Hardcoded Admin Override
    if (email === 'admin@gmail.com' && password === 'Admin@123') {
      try {
        const userCred = await signInWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'artifacts', appId, 'users', userCred.user.uid, 'profile', 'data'), {
          uid: userCred.user.uid, email, name: 'Super Admin', role: 'admin', status: 'approved', createdAt: serverTimestamp()
        }, { merge: true });
      } catch (err) {
        if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-login-credentials') {
          try {
            const userCred = await createUserWithEmailAndPassword(auth, email, password);
            await updateProfile(userCred.user, { displayName: 'Super Admin' });
            await setDoc(doc(db, 'artifacts', appId, 'users', userCred.user.uid, 'profile', 'data'), {
              uid: userCred.user.uid, email, name: 'Super Admin', role: 'admin', status: 'approved', createdAt: serverTimestamp()
            });
          } catch (createErr) { setError(createErr.message); }
        } else { setError(err.message); }
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
        
        const status = role === 'patient' ? 'approved' : 'pending';
        
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), {
          uid: user.uid, email: user.email, name, role, status, createdAt: serverTimestamp()
        });

        if (status === 'pending') {
          // Write to pending queue
          await setDoc(doc(db, 'artifacts', appId, 'pending_users', user.uid), {
            uid: user.uid, email: user.email, name, role, status: 'pending', createdAt: serverTimestamp()
          });
        }
      }
    } catch (err) {
      if (err.code === 'auth/operation-not-allowed') {
        setError("Email/Password auth is disabled in Firebase. Enable it in Authentication > Sign-in method.");
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
        <div className="flex justify-center mb-8"><Logo /></div>
        <h2 className="text-3xl font-extrabold text-gray-900 text-center mb-2 tracking-tight">{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
        <p className="text-gray-500 text-center mb-6">{isLogin ? 'Sign in to access your portal' : 'Join Vaidya Mithra today'}</p>

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
                <div className="relative"><div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Icon name="user" size={18} className="text-gray-400" /></div><input type="text" value={name} onChange={e=>setName(e.target.value)} required className="w-full pl-10 pr-4 py-3 bg-white/50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" placeholder="John Doe" /></div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Role</label>
                <div className="relative"><div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Icon name="users" size={18} className="text-gray-400" /></div><select value={role} onChange={e=>setRole(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-white/50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none appearance-none"><option value="patient">Patient</option><option value="doctor">Doctor</option><option value="attender">Attender</option></select></div>
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <div className="relative"><div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Icon name="mail" size={18} className="text-gray-400" /></div><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required className="w-full pl-10 pr-4 py-3 bg-white/50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" placeholder="name@example.com" /></div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative"><div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Icon name="shield" size={18} className="text-gray-400" /></div><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={6} className="w-full pl-10 pr-4 py-3 bg-white/50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" placeholder="••••••••" /></div>
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
      <p className="text-gray-600 mb-8 leading-relaxed">Your registration as a healthcare professional has been received. Please wait while administration verifies your credentials. You will be granted access automatically once approved.</p>
      <button onClick={() => signOut(auth)} className="px-6 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition">Sign Out</button>
    </div>
  </div>
);

const NavBar = ({ currentPage, onNavigate, userRole, auth, db, userId, appId }) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [showNotifMenu, setShowNotifMenu] = useState(false);

    useEffect(() => {
        if (!userId || !db || !appId || userRole !== 'patient') return;
        const q = query(collection(db, `artifacts/${appId}/users/${userId}/notifications`), orderBy('timestamp', 'desc'), limit(10));
        return onSnapshot(q, (snap) => setNotifications(snap.docs.map(d => ({id: d.id, ...d.data()}))));
    }, [db, userId, appId, userRole]);

    const markAsRead = async (notifId) => {
        await updateDoc(doc(db, `artifacts/${appId}/users/${userId}/notifications`, notifId), { read: true });
    };

    const getNavItems = () => {
      if (userRole === 'doctor') return [{ id: "doctor-home", name: "Dashboard", icon: "home" }, { id: "doctor-history", name: "My Patients", icon: "users" }];
      if (userRole === 'attender') return [{ id: "attender-home", name: "Queue", icon: "home" }, { id: "attender-history", name: "History", icon: "history" }];
      if (userRole === 'admin') return [{ id: "admin-home", name: "Approvals", icon: "shield" }, { id: "admin-history", name: "System Log", icon: "activity" }];
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
                    
                    <div className="hidden md:flex items-center space-x-2">
                        {navItems.map((item) => (
                            <a key={item.id} href="#" onClick={(e) => { e.preventDefault(); handleNavigation(item.id); }} className={`px-3 py-2 rounded-xl text-sm font-semibold flex items-center transition duration-150 ${currentPage === item.id ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                                <Icon name={item.icon} size={18} className="mr-2" color="currentColor" />{item.name}
                            </a>
                        ))}
                        
                        {/* Patient Notification Bell */}
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

                        <div className="w-px h-6 bg-gray-200 mx-2"></div>
                        <button onClick={() => signOut(auth)} className="px-3 py-2 rounded-xl text-sm font-semibold flex items-center text-red-600 hover:bg-red-50 transition duration-150">
                          <Icon name="logOut" size={18} className="mr-2" /> Logout
                        </button>
                    </div>
                    
                    <button className="md:hidden p-2 rounded-lg text-gray-700 hover:bg-gray-100 transition" onClick={() => setIsMenuOpen(!isMenuOpen)}>
                         {isMenuOpen ? <Icon name="x" size={24} /> : <Icon name="menu" size={24} />}
                    </button>
                </div>
            </div>

            {isMenuOpen && (
                <div className="md:hidden absolute top-16 left-0 w-full bg-white/95 backdrop-blur-lg shadow-xl border-t border-gray-200/80 transform origin-top transition-all duration-300 ease-out" style={{ maxHeight: 'calc(100vh - 4rem)' }}>
                    <div className="flex flex-col p-4 space-y-2">
                        {navItems.map((item) => (
                            <a key={item.id} href="#" onClick={(e) => { e.preventDefault(); handleNavigation(item.id); }} className={`px-4 py-3 rounded-xl text-lg font-medium flex items-center transition duration-150 ${currentPage === item.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}>
                                <Icon name={item.icon} size={20} className="mr-3" color="currentColor" /> {item.name}
                            </a>
                        ))}
                        <div className="h-px w-full bg-gray-200 my-2"></div>
                        <button onClick={() => signOut(auth)} className="px-4 py-3 rounded-xl text-lg font-medium flex items-center text-red-600 hover:bg-red-50 transition duration-150 text-left">
                          <Icon name="logOut" size={20} className="mr-3" /> Sign Out
                        </button>
                    </div>
                </div>
            )}
        </nav>
    );
};

const StatCard = ({ title, value, icon, colorClass }) => (
  <div className="bg-white/80 backdrop-blur-lg rounded-2xl p-6 border border-gray-200/50 shadow-sm">
    <div className="flex justify-between items-start">
      <div><p className="text-sm font-medium text-gray-500 mb-1">{title}</p><h3 className="text-3xl font-extrabold text-gray-900">{value}</h3></div>
      <div className={`p-3 rounded-xl ${colorClass}`}><Icon name={icon} size={24} /></div>
    </div>
  </div>
);

const AppointmentBadge = ({ status }) => {
    const styles = { requested: 'bg-yellow-100 text-yellow-800', scheduled: 'bg-blue-100 text-blue-800', ready: 'bg-purple-100 text-purple-800', completed: 'bg-green-100 text-green-800' };
    return <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${styles[status]}`}>{status}</span>;
};

// --- ADMIN PAGES ---
const AdminDashboard = ({ db, appId }) => {
    const [pendingUsers, setPendingUsers] = useState([]);
    useEffect(() => {
        // Simple query without orderBy to avoid index errors on new projects
        const q = query(collection(db, `artifacts/${appId}/pending_users`));
        return onSnapshot(q, (snap) => {
            const users = snap.docs.map(d => ({id: d.id, ...d.data()}));
            setPendingUsers(users.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0)));
        });
    }, [db, appId]);

    const handleApprove = async (user) => {
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), { status: 'approved' });
        if (user.role === 'doctor') await setDoc(doc(db, 'artifacts', appId, 'approved_doctors', user.uid), { uid: user.uid, name: user.name });
        await deleteDoc(doc(db, 'artifacts', appId, 'pending_users', user.uid));
    };

    return (
        <div className="p-4 sm:p-8 max-w-7xl mx-auto h-full animate-fadeInUp">
            <h1 className="text-3xl font-extrabold text-gray-900 mb-8">Admin Approvals</h1>
            <h3 className="font-bold text-lg mb-4 text-blue-800">Pending Registrations</h3>
            {pendingUsers.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center text-gray-500">No pending approvals at the moment.</div>
            ) : (
                <div className="grid gap-4">
                    {pendingUsers.map(user => (
                        <div key={user.id} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex justify-between items-center">
                            <div><p className="font-bold text-lg">{user.name}</p><p className="text-sm text-gray-500 uppercase font-semibold">{user.role} | {user.email}</p></div>
                            <button onClick={() => handleApprove(user)} className="px-5 py-2.5 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 shadow-sm transition">Approve</button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const AdminHistory = ({ db, appId }) => {
    const [appointments, setAppointments] = useState([]);
    useEffect(() => {
        return onSnapshot(collection(db, `artifacts/${appId}/appointments`), (snap) => {
            setAppointments(snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => (b.timestamp?.seconds||0) - (a.timestamp?.seconds||0)));
        });
    }, [db, appId]);

    return (
        <div className="p-4 sm:p-8 max-w-7xl mx-auto h-full animate-fadeInUp">
            <h1 className="text-3xl font-extrabold text-gray-900 mb-8">System Activity Log</h1>
            <div className="space-y-4">
                {appointments.length === 0 ? <p className="text-gray-500">No system activity found.</p> : appointments.map(a => (
                    <div key={a.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between md:items-center gap-4">
                        <div>
                            <div className="flex items-center space-x-3 mb-1"><AppointmentBadge status={a.status} /><span className="text-sm text-gray-500">{new Date(a.timestamp?.seconds * 1000).toLocaleString()}</span></div>
                            <p className="font-bold">Patient: {a.patientName} <span className="text-gray-400 font-normal">→ Doctor: {a.doctorName || 'Unassigned'}</span></p>
                            <p className="text-sm text-gray-600">Reason: {a.reason}</p>
                        </div>
                        {a.status === 'completed' && <div className="text-sm bg-gray-50 p-3 rounded-lg border max-w-sm"><p className="font-semibold text-green-700">Notes:</p><p className="truncate">{a.doctorNotes}</p></div>}
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- ATTENDER PAGES ---
const AttenderDashboard = ({ db, appId, userId }) => {
    const [appointments, setAppointments] = useState([]);
    const [doctors, setDoctors] = useState([]);
    const [scheduleModal, setScheduleModal] = useState(null); 
    const [vitalsModal, setVitalsModal] = useState(null);

    useEffect(() => {
        const unsubApt = onSnapshot(collection(db, `artifacts/${appId}/appointments`), (snap) => {
            setAppointments(snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => (b.timestamp?.seconds||0) - (a.timestamp?.seconds||0)));
        });
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
            <div className="grid gap-6">
                <div>
                    <h3 className="font-bold text-lg text-blue-800 mb-3 border-b pb-2">New Requests (Needs Scheduling)</h3>
                    <div className="space-y-3">
                        {appointments.filter(a => a.status === 'requested').length === 0 ? <p className="text-sm text-gray-500">No new requests.</p> : appointments.filter(a => a.status === 'requested').map(a => (
                            <div key={a.id} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row justify-between md:items-center gap-4">
                                <div><p className="font-bold text-lg">{a.patientName}</p><p className="text-sm text-gray-600">Reason: {a.reason}</p></div>
                                <button onClick={() => setScheduleModal(a)} className="px-5 py-2 bg-blue-600 text-white font-bold rounded-xl shadow-sm hover:bg-blue-700 transition">Schedule</button>
                            </div>
                        ))}
                    </div>
                </div>
                
                <div>
                    <h3 className="font-bold text-lg text-purple-800 mb-3 border-b pb-2 mt-4">Scheduled Arrivals (Needs Vitals)</h3>
                    <div className="space-y-3">
                        {appointments.filter(a => a.status === 'scheduled').length === 0 ? <p className="text-sm text-gray-500">No scheduled arrivals pending vitals.</p> : appointments.filter(a => a.status === 'scheduled').map(a => (
                            <div key={a.id} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row justify-between md:items-center gap-4">
                                <div><p className="font-bold text-lg">{a.patientName}</p><p className="text-sm text-gray-600">With {a.doctorName} at {a.time} on {a.date}</p></div>
                                <button onClick={() => setVitalsModal(a)} className="px-5 py-2 bg-purple-600 text-white font-bold rounded-xl shadow-sm hover:bg-purple-700 transition">Enter Vitals</button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Modals */}
            {scheduleModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <form onSubmit={handleSchedule} className="bg-white p-8 rounded-3xl w-full max-w-md shadow-2xl animate-fadeInUp">
                        <h3 className="font-bold text-2xl mb-6 text-gray-900">Schedule Patient</h3>
                        <p className="mb-4 text-sm text-gray-600">Patient: <strong>{scheduleModal.patientName}</strong></p>
                        <div className="space-y-4">
                            <select name="doctorId" required className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="">Select Doctor...</option>
                                {doctors.map(d => <option key={d.uid} value={d.uid}>{d.name}</option>)}
                            </select>
                            <input type="date" name="date" required className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"/>
                            <input type="time" name="time" required className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"/>
                        </div>
                        <div className="mt-8 flex justify-end space-x-3"><button type="button" onClick={()=>setScheduleModal(null)} className="px-5 py-2.5 text-gray-600 font-semibold hover:bg-gray-100 rounded-xl transition">Cancel</button><button type="submit" className="px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl shadow-md hover:bg-blue-700 transition">Confirm Booking</button></div>
                    </form>
                </div>
            )}
            {vitalsModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <form onSubmit={handleVitals} className="bg-white p-8 rounded-3xl w-full max-w-md shadow-2xl animate-fadeInUp">
                        <h3 className="font-bold text-2xl mb-6 text-gray-900">Record Vitals</h3>
                        <p className="mb-4 text-sm text-gray-600">Patient: <strong>{vitalsModal.patientName}</strong></p>
                        <div className="space-y-4">
                            <input type="text" name="bp" placeholder="Blood Pressure (e.g. 120/80)" required className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-purple-500"/>
                            <input type="number" name="hr" placeholder="Heart Rate (BPM)" required className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-purple-500"/>
                            <input type="number" name="glucose" placeholder="Glucose (mg/dL) - Optional" className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-purple-500"/>
                        </div>
                        <div className="mt-8 flex justify-end space-x-3"><button type="button" onClick={()=>setVitalsModal(null)} className="px-5 py-2.5 text-gray-600 font-semibold hover:bg-gray-100 rounded-xl transition">Cancel</button><button type="submit" className="px-5 py-2.5 bg-purple-600 text-white font-bold rounded-xl shadow-md hover:bg-purple-700 transition">Save & Mark Ready</button></div>
                    </form>
                </div>
            )}
        </div>
    );
};

// --- DOCTOR PAGES ---
const DoctorDashboard = ({ db, appId, userId }) => {
    const [appointments, setAppointments] = useState([]);
    const [consultModal, setConsultModal] = useState(null);

    useEffect(() => {
        return onSnapshot(collection(db, `artifacts/${appId}/appointments`), (snap) => {
            const apts = snap.docs.map(d => ({id: d.id, ...d.data()}));
            setAppointments(apts.filter(a => a.doctorId === userId).sort((a,b) => (b.timestamp?.seconds||0) - (a.timestamp?.seconds||0)));
        });
    }, [db, appId, userId]);

    const handleComplete = async (e) => {
        e.preventDefault();
        await updateDoc(doc(db, `artifacts/${appId}/appointments`, consultModal.id), { status: 'completed', doctorNotes: e.target.notes.value, completedAt: serverTimestamp() });
        setConsultModal(null);
    };

    return (
        <div className="p-4 sm:p-8 max-w-7xl mx-auto h-full animate-fadeInUp">
            <h1 className="text-3xl font-extrabold text-gray-900 mb-6">Doctor Workspace</h1>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <StatCard title="Patients Ready" value={appointments.filter(a=>a.status==='ready').length} icon="user" colorClass="bg-green-100 text-green-600" />
              <StatCard title="Scheduled Today" value={appointments.filter(a=>a.status==='scheduled').length} icon="clock" colorClass="bg-blue-100 text-blue-600" />
              <StatCard title="Completed" value={appointments.filter(a=>a.status==='completed').length} icon="checkCircle" colorClass="bg-gray-100 text-gray-600" />
            </div>

            <h3 className="font-bold text-lg mb-4 text-green-800 border-b pb-2">Patients Ready for Consultation</h3>
            <div className="grid gap-4 mb-8">
                {appointments.filter(a => a.status === 'ready').length === 0 ? <p className="text-gray-500">No patients are currently waiting.</p> : appointments.filter(a => a.status === 'ready').map(a => (
                    <div key={a.id} className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row justify-between md:items-center gap-4">
                        <div>
                            <p className="font-bold text-xl text-gray-900">{a.patientName}</p>
                            <p className="text-sm text-gray-600 mt-1"><strong>Reason:</strong> {a.reason}</p>
                            <div className="flex space-x-3 mt-3">
                                <span className="px-3 py-1 bg-gray-100 rounded-lg text-xs font-semibold">BP: {a.vitals?.bp}</span>
                                <span className="px-3 py-1 bg-gray-100 rounded-lg text-xs font-semibold">HR: {a.vitals?.hr}</span>
                                {a.vitals?.glucose && <span className="px-3 py-1 bg-gray-100 rounded-lg text-xs font-semibold">Glu: {a.vitals?.glucose}</span>}
                            </div>
                        </div>
                        <button onClick={() => setConsultModal(a)} className="px-8 py-3 bg-green-600 text-white font-bold rounded-xl shadow-md hover:bg-green-700 transition">Start Consultation</button>
                    </div>
                ))}
            </div>

            {consultModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <form onSubmit={handleComplete} className="bg-white p-8 rounded-3xl w-full max-w-2xl shadow-2xl animate-fadeInUp">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-2xl text-gray-900">Consultation</h3>
                            <button type="button" onClick={()=>setConsultModal(null)} className="text-gray-400 hover:text-gray-700"><Icon name="x" size={24}/></button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                <p className="text-xs text-gray-500 uppercase font-bold mb-1">Patient Details</p>
                                <p className="font-semibold text-lg">{consultModal.patientName}</p>
                                <p className="text-sm text-gray-700 mt-2"><strong>Complaint:</strong> {consultModal.reason}</p>
                            </div>
                            <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                                <p className="text-xs text-purple-600 uppercase font-bold mb-1">Recorded Vitals</p>
                                <div className="space-y-1 mt-2 text-sm">
                                    <p><strong>Blood Pressure:</strong> {consultModal.vitals?.bp}</p>
                                    <p><strong>Heart Rate:</strong> {consultModal.vitals?.hr} bpm</p>
                                    {consultModal.vitals?.glucose && <p><strong>Glucose:</strong> {consultModal.vitals?.glucose} mg/dL</p>}
                                </div>
                            </div>
                        </div>
                        <label className="block font-bold text-gray-700 mb-2">Clinical Notes & Prescription</label>
                        <textarea name="notes" required rows="5" placeholder="Enter diagnosis, treatment plan, and prescribed medications..." className="w-full p-4 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-green-500 resize-none"></textarea>
                        <div className="mt-8 flex justify-end space-x-3"><button type="submit" className="px-6 py-3 bg-green-600 text-white font-bold rounded-xl shadow-md hover:bg-green-700 transition">Complete & Save to Record</button></div>
                    </form>
                </div>
            )}
        </div>
    );
};

const DoctorHistory = ({ db, appId, userId }) => {
    const [appointments, setAppointments] = useState([]);
    useEffect(() => {
        return onSnapshot(collection(db, `artifacts/${appId}/appointments`), (snap) => {
            const apts = snap.docs.map(d => ({id: d.id, ...d.data()}));
            setAppointments(apts.filter(a => a.doctorId === userId && a.status === 'completed').sort((a,b) => (b.timestamp?.seconds||0) - (a.timestamp?.seconds||0)));
        });
    }, [db, appId, userId]);

    return (
        <div className="p-4 sm:p-8 max-w-7xl mx-auto h-full animate-fadeInUp">
            <h1 className="text-3xl font-extrabold text-gray-900 mb-8">My Patient History</h1>
            <div className="space-y-4">
                {appointments.length === 0 ? <p className="text-gray-500">No completed consultations found.</p> : appointments.map(a => (
                    <div key={a.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="font-bold text-xl">{a.patientName}</h3>
                            <span className="text-sm text-gray-500">{new Date(a.completedAt?.seconds * 1000).toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-gray-600 mb-4"><strong>Presented With:</strong> {a.reason}</p>
                        <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                            <p className="text-xs text-green-800 uppercase font-bold mb-2">Doctor's Notes & Prescription</p>
                            <p className="text-sm text-gray-800 whitespace-pre-wrap">{a.doctorNotes}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- PATIENT APPOINTMENTS ---
const PatientAppointments = ({ db, userId, appId, userName }) => {
    const [appointments, setAppointments] = useState([]);
    const [isBooking, setIsBooking] = useState(false);
    const [reason, setReason] = useState('');

    useEffect(() => {
        return onSnapshot(collection(db, `artifacts/${appId}/appointments`), (snap) => {
            const apts = snap.docs.map(d => ({id: d.id, ...d.data()}));
            setAppointments(apts.filter(a => a.patientId === userId).sort((a,b) => (b.timestamp?.seconds||0) - (a.timestamp?.seconds||0)));
        });
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
                <button onClick={() => setIsBooking(true)} className="px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl shadow-md hover:bg-blue-700 transition">Book New</button>
            </div>
            {isBooking && (
                <form onSubmit={handleBook} className="bg-white p-6 rounded-3xl shadow-xl border border-gray-100 mb-8 animate-fadeIn">
                    <h3 className="font-bold text-xl mb-4">Request Consultation</h3>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Reason for Visit / Symptoms</label>
                    <textarea value={reason} onChange={e=>setReason(e.target.value)} required rows="3" placeholder="Briefly describe what you are experiencing..." className="w-full p-4 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 mb-4 resize-none"></textarea>
                    <div className="flex justify-end space-x-3"><button type="button" onClick={()=>setIsBooking(false)} className="px-5 py-2.5 text-gray-600 font-semibold hover:bg-gray-100 rounded-xl transition">Cancel</button><button type="submit" className="px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl shadow-md hover:bg-blue-700 transition">Submit Request</button></div>
                </form>
            )}
            <div className="space-y-4">
                {appointments.length === 0 ? <p className="text-center text-gray-500 p-8 bg-white rounded-2xl border border-gray-100">You have no appointment history.</p> : appointments.map(a => (
                    <div key={a.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 hover:shadow-md transition">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <AppointmentBadge status={a.status} />
                                <p className="text-sm text-gray-500 mt-2">{new Date(a.timestamp?.seconds * 1000).toLocaleString()}</p>
                            </div>
                            {(a.status==='scheduled'||a.status==='ready') && <div className="text-right"><span className="block font-bold text-blue-600 text-lg">{a.date} at {a.time}</span><span className="text-sm text-gray-600">with {a.doctorName}</span></div>}
                        </div>
                        <p className="text-sm text-gray-800"><strong>Reason:</strong> {a.reason}</p>
                        {a.status === 'completed' && <div className="mt-4 pt-4 border-t border-gray-100 bg-gray-50 -mx-6 -mb-6 p-6 rounded-b-2xl"><p className="text-sm font-bold text-green-700 mb-1">Doctor's Notes & Prescription:</p><p className="text-sm text-gray-700 whitespace-pre-wrap">{a.doctorNotes}</p></div>}
                    </div>
                ))}
            </div>
        </div>
    );
};

const HomePage = ({ onNavigate }) => (
  <div className="h-full flex flex-col items-center justify-center bg-gradient-to-r from-blue-500 to-cyan-500 overflow-hidden p-4 sm:p-8">
    <div className="absolute inset-0 opacity-10 bg-cover bg-center" style={{backgroundImage: "url('https://placehold.co/1920x800/ffffff/000000?text=Health+Data+Analysis')"}}></div>
    
    <div className="z-10 text-center text-white p-4 max-w-4xl">
      <h1 className="text-4xl md:text-6xl font-extrabold mb-4 drop-shadow-lg tracking-tight animate-fadeInUp">
        Welcome to Vaidya Mithra
      </h1>
      <p className="text-lg md:text-xl mb-8 font-light drop-shadow-md animate-fadeInUp" style={{animationDelay: '0.1s'}}>
        Get non-diagnostic insights and next steps in seconds. Powered by Gemini AI for responsible health guidance.
      </p>
      <a href="#prediction" onClick={(e) => { e.preventDefault(); onNavigate('prediction'); }} className="inline-flex items-center px-8 py-3 bg-white text-blue-700 text-lg font-bold rounded-xl shadow-xl hover:bg-gray-50 transition-all duration-300 transform hover:scale-105 animate-fadeInUp" style={{animationDelay: '0.2s'}}>
        Start AI Triage
        <Icon name="chevronRight" size={24} className="ml-2" />
      </a>
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

  const fetchWithBackoff = useCallback(async (url, options, retries = 3, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, options);
        if (response.ok) return response;
        if (response.status === 429 && i < retries - 1) { await new Promise(res => setTimeout(res, delay)); delay *= 2; continue; }
        throw new Error(`API status ${response.status}`);
      } catch (error) {
        if (i === retries - 1) throw error;
        await new Promise(res => setTimeout(res, delay)); delay *= 2;
      }
    }
  }, []);

  const handlePrediction = useCallback(async () => {
    if (selectedSymptoms.length === 0) return;
    setIsLoading(true); setPredictionResult(null);
    setTimeout(() => document.getElementById('prediction-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);

    const userQuery = `The patient is a ${age} year old ${gender}. Symptoms: ${selectedSymptoms.join(', ')}. Act as a professional medical analyst. Provide top 3 differential diagnoses, confidence score (0.0 to 1.0), and concise next steps. Focus strictly on JSON output.`;

    try {
      const payload = { contents: [{ parts: [{ text: userQuery }] }], generationConfig: { responseMimeType: "application/json", responseSchema: JSON_SCHEMA } };
      const response = await fetchWithBackoff(GEMINI_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json();
      const jsonString = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!jsonString) throw new Error("Invalid response.");
      const parsedResult = JSON.parse(jsonString);
      setPredictionResult(parsedResult);
      
      if (db && userId && appId) {
        // Save to user's history
        await setDoc(doc(collection(db, `artifacts/${appId}/users/${userId}/symptom_history`)), { symptoms: selectedSymptoms, age, gender, result: parsedResult, timestamp: serverTimestamp() });
        // Save to Global Log for Admin
        await setDoc(doc(collection(db, `artifacts/${appId}/global_ai_logs`)), { userId, age, gender, symptoms: selectedSymptoms, topPrediction: parsedResult.predictions[0]?.disease || 'N/A', emergency: parsedResult.emergency_flag, timestamp: serverTimestamp() });
      }
    } catch (error) {
      setPredictionResult({ error: `Analysis failed. Check API configuration.` });
    } finally {
      setIsLoading(false);
    }
  }, [selectedSymptoms, age, gender, db, userId, appId, fetchWithBackoff]);

  const toggleSymptom = (s) => setSelectedSymptoms(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);
  const isEmergency = predictionResult?.emergency_flag || selectedSymptoms.some(s => s.toLowerCase().includes('chest pain') || s.toLowerCase().includes('difficulty breathing'));
  const filteredSymptoms = useMemo(() => {
    let symptoms = searchQuery ? SYMPTOM_CATEGORIES.flatMap(cat => ALL_SYMPTOMS_CATEGORIZED[cat]) : ALL_SYMPTOMS_CATEGORIZED[activeCategory] || [];
    return symptoms.filter(s => s.toLowerCase().includes(searchQuery.toLowerCase())).sort((a, b) => a.localeCompare(b));
  }, [activeCategory, searchQuery]);

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto w-full animate-fadeInUp">
      <div className="mb-6"><h2 className="text-3xl font-extrabold text-gray-900">Symptom Assessment</h2><p className="text-gray-500">Select symptoms to get an initial, non-diagnostic AI triage.</p></div>

      <div className="bg-white/80 backdrop-blur-lg shadow-sm rounded-2xl border border-gray-200/50 p-6 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="block"><span className="text-sm font-bold text-gray-700">Age:</span><input type="number" value={age} onChange={e => setAge(Math.max(1, parseInt(e.target.value) || 1))} className="mt-1 w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" /></label>
          <label className="block"><span className="text-sm font-bold text-gray-700">Gender:</span><select value={gender} onChange={e => setGender(e.target.value)} className="mt-1 w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"><option>Male</option><option>Female</option><option>Other</option></select></label>
          <label className="block"><span className="text-sm font-bold text-gray-700">Search:</span><input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="e.g., pain, fever..." className="mt-1 w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" /></label>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-1/2 flex flex-col bg-white/80 backdrop-blur-lg shadow-sm rounded-2xl border border-gray-200/50 p-5">
          <div className="flex space-x-2 overflow-x-auto pb-3 mb-2 border-b border-gray-100 flex-shrink-0 hide-scrollbar">
            {SYMPTOM_CATEGORIES.map(cat => (
              <button key={cat} onClick={() => { setActiveCategory(cat); setSearchQuery(''); }} className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${activeCategory === cat && !searchQuery ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{cat}</button>
            ))}
          </div>
          <div className="flex-grow overflow-y-auto pr-2 grid grid-cols-2 gap-3 max-h-[350px] content-start">
            {filteredSymptoms.map(symptom => (
              <button key={symptom} onClick={() => toggleSymptom(symptom)} className={`p-3 text-sm h-fit rounded-xl text-left transition-all ${selectedSymptoms.includes(symptom) ? 'bg-blue-600 text-white font-bold shadow-md' : 'bg-gray-50 text-gray-700 font-medium hover:bg-gray-100 border border-gray-200/50'}`}>{symptom}</button>
            ))}
          </div>
        </div>

        <div className="lg:w-1/2 flex flex-col bg-white/80 backdrop-blur-lg shadow-sm rounded-2xl border border-gray-200/50 p-5">
          <h3 className="text-lg font-bold text-gray-900 mb-3">Selected ({selectedSymptoms.length})</h3>
          <div className="flex-grow flex flex-wrap content-start gap-2 bg-gray-50 rounded-xl p-4 border border-dashed border-gray-300 overflow-y-auto min-h-[150px] max-h-[250px]">
            {selectedSymptoms.length === 0 ? <p className="text-gray-400 italic m-auto text-sm">Start selecting symptoms...</p> : 
              selectedSymptoms.map(symptom => (
                <div key={symptom} className="flex h-fit items-center bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1.5 rounded-full shadow-sm transform transition-all duration-200 hover:scale-105">
                  {symptom} <button onClick={() => toggleSymptom(symptom)} className="ml-2 text-blue-600 hover:text-red-500 transition"><Icon name="x" size={14} /></button>
                </div>
              ))
            }
          </div>
          <div className="flex justify-end space-x-3 mt-4">
            <button onClick={() => setSelectedSymptoms([])} disabled={selectedSymptoms.length===0} className="px-5 py-2.5 text-sm font-bold text-gray-600 bg-gray-200 rounded-xl disabled:opacity-50 transition-all hover:scale-105">Clear</button>
            <button onClick={handlePrediction} disabled={selectedSymptoms.length===0 || isLoading || !authReady} className="px-6 py-2.5 text-white font-bold bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md disabled:opacity-50 transition-all hover:scale-105">
              {isLoading ? "Analyzing..." : "Get AI Triage"}
            </button>
          </div>
        </div>
      </div>

      <div id="prediction-results" className="mt-8">
        {isLoading && <div className="space-y-4 w-full"><SkeletonCard /><SkeletonCard /></div>}
        {isEmergency && !isLoading && (
          <div className="bg-red-50 border border-red-200 p-5 rounded-2xl mb-6 flex items-start text-red-800 animate-fadeIn w-full">
            <Icon name="alertTriangle" size={28} className="mt-0.5 flex-shrink-0" color="#ef4444" />
            <div className="ml-4">
              <h4 className="font-extrabold text-lg">EMERGENCY WARNING</h4>
              <p className="text-sm mt-1">Based on symptoms, <strong>seek professional medical help immediately.</strong></p>
            </div>
          </div>
        )}
        {predictionResult && !isLoading && !predictionResult.error && (
          <div className="space-y-4 animate-fadeInUp w-full">
             <h3 className="text-2xl font-extrabold text-gray-900 mb-2 border-b border-gray-200 pb-3">AI Diagnostic Report</h3>
             <p className="text-xs text-amber-600 font-bold mb-4 bg-amber-50 p-2 rounded-lg border border-amber-200 inline-block">
               <Icon name="alertTriangle" size={12} className="inline mr-1" /> Educational information only. Consult qualified healthcare professionals for medical advice.
             </p>
            {predictionResult.predictions.map((p, index) => {
              const confidencePercent = Math.round(p.confidence * 100);
              const barColor = confidencePercent > 70 ? 'bg-emerald-500' : confidencePercent > 40 ? 'bg-amber-500' : 'bg-rose-500';
              return (
                <div key={index} className="p-6 rounded-2xl border border-gray-100 bg-white shadow-sm">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-extrabold text-xl text-gray-900">{p.disease}</h4>
                    <span className={`text-sm font-extrabold px-3 py-1 rounded-lg ${confidencePercent > 70 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{confidencePercent}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 mb-4 overflow-hidden"><div className={`h-2 rounded-full ${barColor} transition-all duration-1000`} style={{ width: `${confidencePercent}%` }}></div></div>
                  <p className="text-sm text-gray-600 leading-relaxed">{p.description}</p>
                </div>
              );
            })}
          </div>
        )}
        {predictionResult?.error && !isLoading && (
          <div className="p-5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 font-mono text-sm w-full">{predictionResult.error}</div>
        )}
      </div>
      
      <div className="flex-shrink-0 p-4 bg-white/80 backdrop-blur-lg shadow-lg rounded-2xl border border-gray-200/50 mt-6 w-full animate-fadeInUp" style={{animationDelay: '0.2s'}}>
        <h3 className="text-xl font-semibold text-blue-800 mb-4 flex items-center"><Icon name="history" size={20} className="mr-2 text-blue-500" />Recent History</h3>
        {authReady ? (
          <><p className="text-gray-500 text-xs mb-3">Last 5 checks:</p>
            <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2">
              {history.length === 0 ? <p className="text-gray-400 italic text-sm">No recent checks found.</p> : history.map(item => (
                  <div key={item.id} className="p-3 bg-gray-50/80 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition duration-200">
                    <p className="text-xs font-semibold text-gray-800">{new Date(item.timestamp?.seconds * 1000).toLocaleString()}</p>
                    <p className="text-sm text-gray-600 mt-1 truncate">Symptoms: {item.symptoms.join(', ')}</p>
                    <p className="text-xs font-medium text-green-600 mt-1">Top Prediction: {item.result.predictions[0]?.disease || 'N/A'}</p>
                  </div>
                ))}
            </div>
          </>
        ) : (<div className="text-center p-4 text-gray-500"><p>Authenticating Firebase...</p></div>)}
      </div>
    </div>
  );
};

const DocBotPage = ({ db, userId, authReady, appId }) => {
  const CHAT_BOT_SYSTEM_INSTRUCTION = "You are DocBot, an AI health assistant. Answer health questions concisely. Do not diagnose. Include this exact text at the end of every medical response: 'Educational information only. Consult qualified healthcare professionals for medical advice.' Use search grounding.";
  const [chatHistory, setChatHistory] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatHistory]);

  useEffect(() => {
    if (!authReady || !userId || !db || !appId) return;
    try {
      const q = query(collection(db, `artifacts/${appId}/users/${userId}/docbot_chat`), orderBy('timestamp', 'asc'), limit(50));
      return onSnapshot(q, (snapshot) => setChatHistory(snapshot.docs.map(doc => ({...doc.data(), id: doc.id }))));
    } catch (e) { console.error(e); }
  }, [db, userId, authReady, appId]);

  const fetchWithBackoff = useCallback(async (url, options, retries = 3, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, options);
        if (response.ok) return response;
        if (response.status === 429 && i < retries - 1) { await new Promise(res => setTimeout(res, delay)); delay *= 2; continue; }
        throw new Error(`API status ${response.status}`);
      } catch (error) {
        if (i === retries - 1) throw error;
        await new Promise(res => setTimeout(res, delay)); delay *= 2;
      }
    }
  }, []);

  const handleSend = async (messageText) => {
    const message = (typeof messageText === 'string') ? messageText : currentMessage;
    if (!message.trim() || isTyping || !db || !userId || !appId) return;
    const userMessage = message.trim(); setCurrentMessage('');
    const colRef = collection(db, `artifacts/${appId}/users/${userId}/docbot_chat`);
    
    await setDoc(doc(colRef), { text: userMessage, role: 'user', timestamp: serverTimestamp() });
    setIsTyping(true);

    try {
      const apiHistory = chatHistory.map(msg => ({ role: msg.role === 'ai' ? 'model' : 'user', parts: [{ text: msg.text }] }));
      apiHistory.push({ role: 'user', parts: [{ text: userMessage }] });
      const payload = { contents: apiHistory, tools: [{ "google_search": {} }], systemInstruction: { parts: [{ text: CHAT_BOT_SYSTEM_INSTRUCTION }] } };
      
      const res = await fetchWithBackoff(GEMINI_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await res.json();
      const aiText = result.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, error processing.";
      await setDoc(doc(colRef), { text: aiText, role: 'ai', timestamp: serverTimestamp() });
    } catch (error) {
      await setDoc(doc(colRef), { text: "Network Error. Check API key.", role: 'ai_error', timestamp: serverTimestamp() });
    } finally { setIsTyping(false); }
  };

  return (
    <div className="h-full p-4 md:p-8 max-w-4xl mx-auto w-full flex flex-col animate-fadeInUp">
      <div className="bg-white/90 backdrop-blur-xl shadow-sm rounded-3xl border border-gray-200/50 flex flex-col flex-grow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center">
          <Icon name="messageSquare" className="text-blue-600 mr-3" size={24} />
          <div>
            <h2 className="text-lg font-bold text-gray-900">DocBot Assistant</h2>
            <p className="text-xs font-semibold text-emerald-500">Online</p>
          </div>
        </div>
        <div className="flex-grow overflow-y-auto p-4 md:p-6 bg-gray-50/30 flex flex-col space-y-4">
          {chatHistory.length === 0 && !isTyping ? (
            <div className="m-auto text-center max-w-sm">
              <Icon name="stethoscope" size={40} className="text-blue-400 mx-auto mb-4" />
              <p className="text-gray-500 mb-6">Ask me any general health questions.</p>
              <div className="space-y-2">
                {["What are flu symptoms?", "How to reduce stress?"].map(q => (
                  <button key={q} onClick={() => handleSend(q)} className="block w-full p-3 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:text-blue-600 shadow-sm text-left">"{q}"</button>
                ))}
              </div>
            </div>
          ) : (
            chatHistory.map((msg, idx) => (
              <div key={idx} className={`max-w-[85%] sm:max-w-md p-4 rounded-2xl shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white self-end rounded-br-sm' : 'bg-white border border-gray-100 text-gray-800 self-start rounded-tl-sm'}`}>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.text}</p>
              </div>
            ))
          )}
          {isTyping && <div className="self-start bg-white border border-gray-100 p-4 rounded-2xl rounded-tl-sm shadow-sm"><span className="dot-flashing"></span></div>}
          <div ref={messagesEndRef} />
        </div>
        <div className="p-4 bg-white border-t border-gray-100 flex-shrink-0">
          <div className="relative flex items-center">
            <input type="text" value={currentMessage} onChange={e => setCurrentMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} disabled={isTyping || !authReady} placeholder="Type a health question..." className="w-full pl-5 pr-14 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
            <button onClick={() => handleSend()} disabled={isTyping || !currentMessage.trim() || !authReady} className="absolute right-2 p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 shadow-sm transition"><Icon name="send" size={18} /></button>
          </div>
        </div>
      </div>
    </div>
  );
};

const HospitalPage = () => {
  return (
    <div className="p-6 max-w-3xl mx-auto w-full animate-fadeInUp flex items-center justify-center h-full">
      <div className="bg-white/90 backdrop-blur-xl shadow-sm rounded-3xl p-8 border border-gray-200/50 text-center w-full">
        <Icon name="hospital" size={48} className="text-blue-500 mx-auto mb-4" />
        <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Find Medical Care</h2>
        <p className="text-gray-500 mb-8 max-w-sm mx-auto">Locate the nearest hospitals using your device's location.</p>
        <button
          onClick={() => {
            if(navigator.geolocation) {
              navigator.geolocation.getCurrentPosition(pos => {
                window.open(`https://www.google.com/maps/search/Hospitals/@${pos.coords.latitude},${pos.coords.longitude},14z`, '_blank');
              });
            } else { alert("Location not supported"); }
          }}
          className="px-8 py-3.5 bg-gray-900 hover:bg-black text-white font-bold rounded-xl shadow-md transition-colors"
        >
          Open Google Maps
        </button>
      </div>
    </div>
  );
};

const ContactPage = () => {
  return (
    <div className="p-6 max-w-3xl mx-auto w-full animate-fadeInUp flex items-center justify-center h-full">
      <div className="bg-white/90 backdrop-blur-xl shadow-sm rounded-3xl p-8 border border-gray-200/50 text-center w-full">
        <Icon name="mail" size={48} className="text-blue-500 mx-auto mb-4" />
        <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Contact Support</h2>
        <p className="text-gray-500 mb-8">Need technical help or have a question about the platform?</p>
        <div className="space-y-4 max-w-xs mx-auto text-left">
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
            <p className="font-bold text-gray-900">Dilip Kumar A N</p>
            <p className="text-sm text-gray-600">dilipkumaran.ec23@rvce.edu.in</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
            <p className="font-bold text-gray-900">Arya B V</p>
            <p className="text-sm text-gray-600">aryabv.ec23@rvce.edu.in</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const App = () => {
  const [userId, setUserId] = useState(null);
  const [userRole, setUserRole] = useState(null); 
  const [authReady, setAuthReady] = useState(false);
  const [currentPage, setCurrentPage] = useState('home');
  const [initError, setInitError] = useState(null);

  // Use the global objects securely initialized at the top of the file
  useEffect(() => {
    let isMounted = true;
    
    if (!auth || !db) {
      if (isMounted) {
        setInitError("Firebase configuration is missing or invalid. Check your environment variables.");
        setAuthReady(true);
      }
      return;
    }

    // Listener for Auth and Role changes
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!isMounted) return;
      
      if (user) {
        setUserId(user.uid);
        
        // Setting up a real-time listener on the user's profile to catch immediate Admin approvals
        const profileRef = doc(db, 'artifacts', globalAppId, 'users', user.uid, 'profile', 'data');
        const unsubProfile = onSnapshot(profileRef, (profileSnap) => {
            if (profileSnap.exists()) {
                const data = profileSnap.data();
                setUserRole(data.role || 'patient');

                if (data.status === 'pending') {
                    setCurrentPage('pending');
                } else {
                    // Safe routing once approved
                    if(data.role === 'doctor') setCurrentPage('doctor-home');
                    else if(data.role === 'attender') setCurrentPage('attender-home');
                    else if(data.role === 'admin') setCurrentPage('admin-home');
                    else setCurrentPage('home');
                }
            } else {
                setUserRole('patient');
                setCurrentPage('home');
            }
            setAuthReady(true);
        }, (error) => {
            console.error("Profile Listener Error:", error);
            setUserRole('patient');
            setCurrentPage('home');
            setAuthReady(true);
        });
        
        // We do not cleanup unsubProfile here as it needs to stay active for the session. 
        // A full production app would manage this cleanup on unmount.
      } else {
        setUserId(null);
        setUserRole(null);
        setCurrentPage('');
        setAuthReady(true);
      }
    });
    
    return () => { isMounted = false; unsubscribe(); };
  }, []);

  const renderContent = () => {
    if (initError) {
      return (
        <div className="h-full flex items-center justify-center p-8">
          <div className="bg-red-50 border border-red-200 p-6 rounded-2xl max-w-lg w-full text-center">
             <Icon name="alertTriangle" size={48} className="text-red-500 mx-auto mb-4" />
             <h3 className="text-lg font-bold text-red-900 mb-2">Initialization Error</h3>
             <p className="text-sm text-red-700">{initError}</p>
          </div>
        </div>
      );
    }

    if (!authReady) {
      return (
        <div className="h-full flex flex-col items-center justify-center">
          <span className="dot-flashing mb-4"></span>
          <p className="text-gray-500 text-sm font-medium">Initializing Platform...</p>
        </div>
      );
    }

    if (!userId) {
      return <AuthScreen auth={auth} db={db} appId={globalAppId} />;
    }

    if (currentPage === 'pending') {
        return <PendingApprovalScreen auth={auth} />;
    }

    const pageContainerClasses = "flex-grow w-full overflow-y-auto pt-16 relative z-10";

    switch (currentPage) {
      // Patient Pages
      case 'home': return <div className={pageContainerClasses}><HomePage onNavigate={setCurrentPage} /></div>;
      case 'prediction': return <div className={pageContainerClasses}><PredictionPage db={db} userId={userId} authReady={authReady} appId={globalAppId} /></div>;
      case 'docbot': return <div className={pageContainerClasses}><DocBotPage db={db} userId={userId} authReady={authReady} appId={globalAppId} /></div>;
      case 'appointments': return <div className={pageContainerClasses}><PatientAppointments db={db} userId={userId} appId={globalAppId} userName={auth?.currentUser?.displayName} /></div>;
      case 'hospitals': return <div className={pageContainerClasses}><HospitalPage /></div>;
      case 'contact': return <div className={pageContainerClasses}><ContactPage /></div>;
      
      // Doctor Page
      case 'doctor-home': return <div className={pageContainerClasses}><DoctorDashboard db={db} appId={globalAppId} userId={userId} /></div>;
      case 'doctor-history': return <div className={pageContainerClasses}><DoctorHistory db={db} appId={globalAppId} userId={userId} /></div>;
      
      // Attender Page
      case 'attender-home': return <div className={pageContainerClasses}><AttenderDashboard db={db} appId={globalAppId} userId={userId} /></div>;
      case 'attender-history': return <div className={pageContainerClasses}><div className="p-8 text-center text-gray-500">Feature in development.</div></div>;
      
      // Admin Page
      case 'admin-home': return <div className={pageContainerClasses}><AdminDashboard db={db} appId={globalAppId} /></div>;
      case 'admin-history': return <div className={pageContainerClasses}><AdminHistory db={db} appId={globalAppId} /></div>;
      
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
        .dot-flashing { position: relative; width: 5px; height: 5px; border-radius: 5px; background-color: #3b82f6; color: #3b82f6; animation: dotFlashing 1s infinite linear alternate; animation-delay: 0s; display: inline-block; }
        .dot-flashing::before, .dot-flashing::after { content: ""; display: inline-block; position: absolute; top: 0; }
        .dot-flashing::before { left: -8px; width: 5px; height: 5px; border-radius: 5px; background-color: #3b82f6; color: #3b82f6; animation: dotFlashing 1s infinite alternate; animation-delay: 0.4s; }
        .dot-flashing::after { left: 8px; width: 5px; height: 5px; border-radius: 5px; background-color: #3b82f6; color: #3b82f6; animation: dotFlashing 1s infinite alternate; animation-delay: 0.8s; }
        @keyframes dotFlashing { 0% { opacity: 0.2; } 50% { opacity: 1; } 100% { opacity: 0.2; } }
      `}</style>
      
      {userId && currentPage !== 'pending' && (
        <NavBar 
          currentPage={currentPage} 
          onNavigate={setCurrentPage} 
          userRole={userRole}
          auth={auth} 
          db={db}
          userId={userId}
          appId={globalAppId}
        />
      )}
      
      {renderContent()}
      
      <Footer className="flex-shrink-0 z-20 bg-white" />
    </div>
  );
};

export default App;
