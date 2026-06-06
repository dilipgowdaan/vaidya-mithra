import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

// --- Firebase SDK Imports ---
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
  signOut, onAuthStateChanged, updateProfile 
} from 'firebase/auth';
import { 
  getFirestore, collection, doc, setDoc, updateDoc, query, orderBy, limit, 
  onSnapshot, serverTimestamp, setLogLevel 
} from 'firebase/firestore';

// --- API Configuration ---
// Read securely from Vercel Environment Variables or Canvas environment
const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
const apiKey = env.VITE_VAIDYA_MITHRA_GEMINI_KEY || "";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

// --- Structured JSON Schema for Disease Prediction ---
const JSON_SCHEMA = {
  type: "OBJECT",
  properties: {
    emergency_flag: {
      type: "BOOLEAN",
      description: "True if symptoms indicate a severe, life-threatening emergency (e.g., severe chest pain, inability to breathe, stroke signs). False otherwise."
    },
    predictions: {
      type: "ARRAY",
      description: "List of the top 3 most probable diseases based on symptoms, age, and gender.",
      items: {
        type: "OBJECT",
        properties: {
          disease: { type: "STRING", description: "The name of the potential condition." },
          confidence: { type: "NUMBER", description: "A confidence score between 0.0 and 1.0 (e.g., 0.85 for 85%)." },
          description: { type: "STRING", description: "A brief, non-alarming, and clear overview of the disease and suggested next steps." }
        },
        required: ["disease", "confidence", "description"]
      }
    }
  },
  required: ["emergency_flag", "predictions"]
};

// --- Symptom Data & Categories ---
const ALL_SYMPTOMS_CATEGORIZED = {
  General: [
    'Fatigue', 'Fever', 'Headache', 'Dizziness', 'Nausea', 'Vomiting', 'Body Ache',
    'Chills', 'Sore Throat', 'Diarrhea', 'Constipation', 'Runny Nose'
  ],
  Respiratory: [
    'Cough', 'Shortness of Breath', 'Wheezing', 'Chest Tightness', 'Difficulty Breathing',
    'Sputum Production', 'Sneezing', 'Hoarseness'
  ],
  Cardiac: [
    'Chest Pain', 'Palpitations', 'Fainting', 'Swelling of Legs/Ankles',
    'Rapid Heartbeat', 'Lightheadedness', 'Pain Radiating to Jaw/Arm'
  ],
  Skin: [
    'Rash', 'Itching', 'Hives', 'Dry Skin', 'Jaundice', 'Bruising',
    'Change in Mole appearance', 'Redness/Inflammation'
  ],
  Musculoskeletal: [
    'Joint Pain', 'Muscle Pain', 'Back Pain', 'Stiffness', 'Swollen Joints',
    'Limited Range of Motion', 'Numbness/Tingling'
  ],
};

const SYMPTOM_CATEGORIES = Object.keys(ALL_SYMPTOMS_CATEGORIZED);

// =================================================================================
// --- HELPER & LAYOUT COMPONENTS ---
// =================================================================================

const Icon = ({ name, size = 20, color = 'currentColor', className = '' }) => {
  const icons = {
    home: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    stethoscope: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 2a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V5a3 3 0 0 0-3-3h-6zM9 12h-4a2 2 0 0 0-2 2v2M21 12h-4a2 2 0 0 1-2 2v2M12 9v6M15 15v-6M18 15v-6M9 15v-6"/></svg>,
    messageSquare: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
    hospital: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 11v6m-3-3h6m7 0h-3v4a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-4H3m7-10l-1 4H5l-1 4m16-8l-1 4h-4l-1 4m4 4H4a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2z"/></svg>,
    history: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 2v10l4-4m-6-6a9 9 0 1 1 0 18a9 9 0 0 1 0-18z"/></svg>,
    mail: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
    phone: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-4.75-4.75A19.79 19.79 0 0 1 2.08 3.18 2 2 0 0 1 4.08 1h3a2 2 0 0 1 2 1.72 17.51 17.51 0 0 0 .15 3.37 2 2 0 0 1-1.28 2.13l-1.3 1.3A15 15 0 0 0 15 16.5l1.3-1.3a2 2 0 0 1 2.13-1.28A17.51 17.51 0 0 0 20.28 16.92z"/></svg>,
    alertTriangle: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    chevronRight: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="9 18 15 12 9 6"/></svg>,
    send: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
    x: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    lightbulb: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M15.09 16.05A6.47 6.47 0 0 1 12 21.03a6.47 6.47 0 0 1-3.09-4.98c0-.62.07-1.23.21-1.81l.15-.62.62-.15c.58-.14 1.19-.21 1.81-.21h0c.62 0 1.23.07 1.81.21l.62.15.15.62c.14.58.21 1.19.21 1.81zM12 21.03V22m0-11.03V4a2 2 0 1 1 4 0v2.03M8 6.03V4a2 2 0 1 0-4 0v2.03m5.5 10.44C13.5 16 13 14.83 13 14c0-1.04.2-1.9.5-2.65M10.5 16c.5.5 1 1.17 1 2 0 1.04-.2 1.9-.5 2.65m-2-12.09c.39-.28.8-.53 1.24-.75M14.76 3.18c.44.22.85.47 1.24.75m-6 12.09c-.39.28-.8.53-1.24.75M9.24 3.18c-.44.22-.85.47-1.24.75M12 6.03V4m0 17.03V21m-3.5-13.44c-.5.5-1 1.17-1 2 0 1.04.2 1.9.5 2.65m6.5-2.65c.5.5 1 1.17 1 2 0 1.04-.2 1.9-.5 2.65"/></svg>,
    user: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    logOut: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
    bell: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
    calendar: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    users: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    checkCircle: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
  };
  return icons[name] || <div style={{ width: size, height: size }}>?</div>;
};

const Logo = () => (
  <div className="flex items-center flex-shrink-0">
    <div className="p-1 bg-blue-600 rounded-lg">
      <Icon name="stethoscope" size={24} color="white" />
    </div>
    <span className="text-2xl font-bold text-blue-800 ml-3">
      Vaidya <span className="text-blue-600">Mithra</span>
    </span>
  </div>
);

const NavBar = ({ currentPage, onNavigate, userProfile, onLogout, unreadCount }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  const getNavItems = () => {
    if (!userProfile) return [];
    const base = [{ id: "profile", name: "Profile", icon: "user" }];
    const support = { id: "contact", name: "Support", icon: "mail" };

    switch (userProfile.role) {
      case 'patient':
        return [
          { id: "home", name: "Home", icon: "home" },
          { id: "appointments", name: "Appointments", icon: "calendar" },
          { id: "prediction", name: "AI Triage", icon: "stethoscope" },
          { id: "docbot", name: "DocBot", icon: "messageSquare" },
          { id: "hospitals", name: "Hospitals", icon: "hospital" },
          ...base, support
        ];
      case 'doctor':
        return [
          { id: "doctor-dashboard", name: "Consultations", icon: "calendar" },
          { id: "doctor-history", name: "History", icon: "history" },
          ...base, support
        ];
      case 'attender':
        return [
          { id: "attender-dashboard", name: "Queue & Triage", icon: "users" },
          ...base, support
        ];
      case 'admin':
        return [
          { id: "admin-dashboard", name: "System Stats", icon: "home" },
          { id: "admin-approvals", name: "Approvals", icon: "alertTriangle" },
          { id: "admin-users", name: "Directory", icon: "users" },
          { id: "admin-logs", name: "System Logs", icon: "history" },
          ...base, support
        ];
      default:
        return base;
    }
  };

  const navItems = getNavItems();

  const handleNavigation = (id) => {
    onNavigate(id);
    setIsMenuOpen(false);
  };

  return (
    <nav className="flex-shrink-0 bg-white/90 backdrop-blur-md shadow-sm border-b border-gray-200/80 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <a href="#" onClick={(e) => { e.preventDefault(); if (userProfile?.role === 'patient') handleNavigation('home'); }} className="no-underline">
            <Logo />
          </a>
          
          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-2 overflow-x-auto">
            {navItems.map((item) => {
              const isActive = currentPage === item.id;
              return (
                <a
                  key={item.id} href="#"
                  onClick={(e) => { e.preventDefault(); handleNavigation(item.id); }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center transition duration-150 relative whitespace-nowrap ${
                    isActive ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600'
                  }`}
                >
                  <Icon name={item.icon} size={18} className="mr-2" color="currentColor" />
                  {item.name}
                  {item.id === 'appointments' && unreadCount > 0 && (
                    <span className="absolute top-1 right-1 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                    </span>
                  )}
                </a>
              );
            })}
            <button onClick={onLogout} className="ml-4 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 flex items-center transition">
              <Icon name="logOut" size={18} className="mr-2" /> Logout
            </button>
          </div>
          
          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center">
             {userProfile?.role === 'patient' && unreadCount > 0 && (
                <div className="mr-4 relative">
                  <Icon name="bell" size={24} color="#3b82f6" />
                  <span className="absolute top-0 right-0 flex h-3 w-3">
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                  </span>
                </div>
              )}
            <button className="p-2 rounded-lg text-gray-700 hover:bg-gray-100 transition" onClick={() => setIsMenuOpen(!isMenuOpen)}>
              {isMenuOpen ? <Icon name="x" size={24} /> : (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {isMenuOpen && (
        <div className="md:hidden absolute w-full bg-white/95 backdrop-blur-lg shadow-lg border-t border-gray-200/80 z-50">
          <div className="flex flex-col p-4 space-y-2">
            {navItems.map((item) => (
              <a
                key={item.id} href="#"
                onClick={(e) => { e.preventDefault(); handleNavigation(item.id); }}
                className={`px-4 py-3 rounded-lg text-lg font-medium flex items-center transition duration-150 ${
                  currentPage === item.id ? 'bg-blue-100 text-blue-700' : 'text-gray-800 hover:bg-blue-50'
                }`}
              >
                <Icon name={item.icon} size={20} className="mr-3" color="currentColor" />
                {item.name}
              </a>
            ))}
            <button onClick={onLogout} className="px-4 py-3 rounded-lg text-lg font-medium text-red-600 hover:bg-red-50 flex items-center transition text-left w-full">
              <Icon name="logOut" size={20} className="mr-3" /> Logout
            </button>
          </div>
        </div>
      )}
    </nav>
  );
};

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
  <div id="footer" className={`bg-white/70 backdrop-blur-sm border-t border-gray-200 py-4 px-4 sm:px-8 flex-shrink-0 z-10 ${className}`}>
    <p className="text-xs text-gray-600 text-center max-w-4xl mx-auto mb-2">
      <strong>Disclaimer:</strong> This application is for informational and educational purposes only and is <strong>NOT</strong> a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of your physician.
    </p>
    <p className="text-xs text-gray-500 text-center">
      &copy; 2026 Vaidya Mithra HMIS. All rights reserved.
    </p>
  </div>
);

// =================================================================================
// --- AUTH & RBAC COMPONENTS ---
// =================================================================================

const AuthPage = ({ db, auth, appId }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('patient');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        if (email === 'admin@gmail.com' && password === 'Admin@123') {
          try {
            await signInWithEmailAndPassword(auth, email, password);
          } catch (err) {
            // Auto-create super admin if bypass is used and it doesn't exist
            const cred = await createUserWithEmailAndPassword(auth, email, password);
            const adminData = { email, role: 'admin', status: 'approved', name: 'Super Admin', createdAt: serverTimestamp() };
            // Save in BOTH places as requested
            await setDoc(doc(db, `artifacts/${appId}/public/data/all_users`, cred.user.uid), adminData);
            await setDoc(doc(db, `artifacts/${appId}/users/${cred.user.uid}/profile`, 'data'), adminData);
          }
        } else {
          await signInWithEmailAndPassword(auth, email, password);
        }
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const status = role === 'patient' ? 'approved' : 'pending';
        const userData = { email, role, status, name, age: '', gender: '', createdAt: serverTimestamp() };
        
        // Update Firebase Auth Profile for Display Name
        await updateProfile(cred.user, { displayName: name });

        // Save in BOTH places as requested
        await setDoc(doc(db, `artifacts/${appId}/public/data/all_users`, cred.user.uid), userData);
        await setDoc(doc(db, `artifacts/${appId}/users/${cred.user.uid}/profile`, 'data'), userData);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-cyan-50 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md border border-blue-100 transform transition-all duration-500 hover:scale-[1.01]">
        <div className="flex justify-center mb-6"><Logo /></div>
        <h2 className="text-2xl font-extrabold text-center text-blue-900 mb-6">{isLogin ? 'Sign In to HMIS' : 'Create Account'}</h2>
        
        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm border border-red-200">{error}</div>}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700">Full Name</label>
                <input required type="text" value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Select Role</label>
                <select value={role} onChange={e => setRole(e.target.value)} className="mt-1 w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white">
                  <option value="patient">Patient (Auto-Approve)</option>
                  <option value="doctor">Doctor (Requires Admin Approval)</option>
                  <option value="attender">Attender (Requires Admin Approval)</option>
                </select>
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700">Email Address</label>
            <input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1 w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <input required type="password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1 w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
          </div>
          <button disabled={loading} type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 disabled:opacity-50 disabled:hover:translate-y-0">
            {loading ? <span className="flex items-center justify-center"><svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Processing...</span> : (isLogin ? 'Secure Sign In' : 'Register Account')}
          </button>
        </form>
        <div className="mt-6 text-center text-sm">
          <button onClick={() => setIsLogin(!isLogin)} className="text-blue-600 font-semibold hover:text-blue-800 transition">
            {isLogin ? "Need an account? Sign up here" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
};

const PendingStatePage = ({ onLogout }) => (
  <div className="h-full flex items-center justify-center p-4 bg-gray-50">
    <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md text-center border border-yellow-200">
      <div className="mx-auto bg-yellow-100 w-24 h-24 rounded-full flex items-center justify-center mb-6">
        <Icon name="alertTriangle" size={48} className="text-yellow-500" />
      </div>
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Wait for Confirmation</h2>
      <p className="text-gray-600 mb-6 text-sm">Your staff account is currently pending approval by a system administrator. This page will automatically redirect to your dashboard once your status is updated.</p>
      <button onClick={onLogout} className="text-blue-600 font-bold hover:text-blue-800 flex items-center justify-center w-full transition">
        <Icon name="logOut" size={20} className="mr-2" /> Sign out and return later
      </button>
    </div>
  </div>
);

// =================================================================================
// --- HMIS DASHBOARDS & WORKFLOW PAGES ---
// =================================================================================

const ProfilePage = ({ db, userId, appId, userProfile }) => {
  const [name, setName] = useState(userProfile?.name || '');
  const [phone, setPhone] = useState(userProfile?.phone || '');
  const [age, setAge] = useState(userProfile?.age || '');
  const [gender, setGender] = useState(userProfile?.gender || '');
  const [statusMsg, setStatusMsg] = useState('');

  const handleUpdate = async (e) => {
    e.preventDefault();
    setStatusMsg('Updating profile...');
    try {
      const updates = { name, phone, age, gender };
      // Update in TWO places
      await updateDoc(doc(db, `artifacts/${appId}/public/data/all_users`, userId), updates);
      await updateDoc(doc(db, `artifacts/${appId}/users/${userId}/profile`, 'data'), updates);
      setStatusMsg('Profile updated successfully!');
      setTimeout(() => setStatusMsg(''), 3000);
    } catch (err) {
      setStatusMsg(`Error: ${err.message}`);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-8 animate-[fadeInUp_0.5s_ease-out_forwards]">
      <div className="bg-white shadow-xl rounded-2xl p-6 sm:p-8 border border-gray-100">
        <h2 className="text-3xl font-extrabold text-blue-900 mb-8 flex items-center">
          <div className="p-2 bg-blue-100 rounded-xl mr-3"><Icon name="user" size={28} className="text-blue-600" /></div>
          My Profile
        </h2>
        
        {statusMsg && (
          <div className={`mb-6 p-4 rounded-xl text-sm font-semibold flex items-center ${statusMsg.includes('Error') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
            <Icon name={statusMsg.includes('Error') ? "alertTriangle" : "checkCircle"} className="mr-2" />
            {statusMsg}
          </div>
        )}

        <form onSubmit={handleUpdate} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Account Role</label>
              <div className="text-lg font-semibold text-gray-800">{userProfile?.role.toUpperCase()}</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Email Address</label>
              <div className="text-lg font-semibold text-gray-800">{userProfile?.email}</div>
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Full Name</label>
              <input type="text" value={name} onChange={e=>setName(e.target.value)} className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Phone Number</label>
              <input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm" placeholder="e.g., +1 234 567 8900" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Age</label>
              <input type="number" value={age} onChange={e=>setAge(e.target.value)} className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Gender</label>
              <select value={gender} onChange={e=>setGender(e.target.value)} className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm bg-white">
                <option value="">Select...</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
          <div className="pt-4 border-t border-gray-100 flex justify-end">
            <button type="submit" className="bg-blue-600 text-white font-bold py-3 px-8 rounded-xl hover:bg-blue-700 shadow-md hover:shadow-lg transition-all duration-200 transform hover:-translate-y-1">
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const PatientAppointments = ({ db, userId, appId, userProfile }) => {
  const [reason, setReason] = useState('');
  const [appointments, setAppointments] = useState([]);
  
  useEffect(() => {
    if (!db || !appId || !userId) return;
    const q = query(collection(db, `artifacts/${appId}/public/data/appointments`));
    const unsub = onSnapshot(q, (snap) => {
      // Rule 2: Client side filtering
      const apps = snap.docs.map(d => ({id: d.id, ...d.data()}))
        .filter(a => a.patientId === userId)
        .sort((a,b) => b.timestamp - a.timestamp);
      setAppointments(apps);
    });
    return () => unsub();
  }, [db, appId, userId]);

  const handleRequest = async (e) => {
    e.preventDefault();
    if (!reason.trim()) return;
    const ref = doc(collection(db, `artifacts/${appId}/public/data/appointments`));
    await setDoc(ref, {
      patientId: userId,
      patientName: userProfile.name,
      patientAge: userProfile.age || 'N/A',
      reason,
      status: 'requested',
      timestamp: Date.now()
    });
    setReason('');
  };

  const statusColors = { 
    requested: 'bg-yellow-100 text-yellow-800 border-yellow-200', 
    scheduled: 'bg-blue-100 text-blue-800 border-blue-200', 
    ready: 'bg-purple-100 text-purple-800 border-purple-200', 
    completed: 'bg-green-100 text-green-800 border-green-200' 
  };

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-8 space-y-8 animate-[fadeInUp_0.5s_ease-out_forwards]">
      
      {/* Request Form */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-xl border border-gray-100 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50 rounded-full blur-3xl -mr-20 -mt-20 opacity-50"></div>
        <h2 className="text-2xl font-extrabold text-blue-900 mb-2 relative z-10 flex items-center">
          <Icon name="calendar" className="mr-3 text-blue-500" size={28} /> Request New Consultation
        </h2>
        <p className="text-gray-500 mb-6 relative z-10">Describe your symptoms to join the attender queue.</p>
        
        <form onSubmit={handleRequest} className="space-y-4 relative z-10">
          <textarea 
            required value={reason} onChange={e=>setReason(e.target.value)} 
            placeholder="E.g., I have been experiencing severe headaches and slight fever for the last 2 days..." 
            className="w-full p-4 border border-gray-300 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 h-32 transition-all shadow-sm resize-none" 
          />
          <div className="flex justify-end">
            <button type="submit" className="bg-blue-600 text-white font-bold py-3 px-8 rounded-xl hover:bg-blue-700 shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1 flex items-center">
              Submit Request <Icon name="send" size={18} className="ml-2" />
            </button>
          </div>
        </form>
      </div>

      {/* History Timeline */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-xl border border-gray-100">
        <h2 className="text-2xl font-extrabold text-blue-900 mb-6 flex items-center">
          <Icon name="history" className="mr-3 text-blue-500" size={28} /> My Appointments History
        </h2>
        
        <div className="space-y-6">
          {appointments.length === 0 ? (
             <div className="text-center p-8 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
               <Icon name="calendar" size={48} className="mx-auto text-gray-400 mb-3" />
               <p className="text-gray-500 font-medium">No previous appointments found.</p>
             </div>
          ) : appointments.map(app => (
            <div key={app.id} className="p-5 border border-gray-200 rounded-2xl bg-white shadow-sm hover:shadow-md transition-shadow">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                <div>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase border ${statusColors[app.status]}`}>
                    {app.status}
                  </span>
                  <span className="text-sm font-medium text-gray-500 ml-3">
                    {new Date(app.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 mb-4">
                <p className="text-sm font-bold text-gray-700 mb-1">Reason for Visit:</p>
                <p className="text-base text-gray-800">{app.reason}</p>
              </div>

              {app.status === 'scheduled' && (
                <div className="flex items-center text-sm font-semibold text-blue-700 bg-blue-50 p-3 rounded-xl border border-blue-100">
                  <Icon name="calendar" size={18} className="mr-2" />
                  Scheduled for: {app.scheduledDate} at {app.scheduledTime} with Dr. {app.doctorName}
                </div>
              )}
              
              {app.status === 'completed' && (
                <div className="mt-4 p-5 bg-green-50 border border-green-200 rounded-xl">
                  <p className="text-sm font-extrabold text-green-900 mb-2 flex items-center">
                    <Icon name="stethoscope" size={18} className="mr-2" /> Doctor's Notes & Prescription:
                  </p>
                  <p className="text-base text-gray-800 whitespace-pre-wrap leading-relaxed bg-white p-4 rounded-lg border border-green-100 shadow-sm">
                    {app.clinicalNotes}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const AttenderDashboard = ({ db, appId }) => {
  const [appointments, setAppointments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [scheduleModal, setScheduleModal] = useState(null);
  const [vitalsModal, setVitalsModal] = useState(null);

  useEffect(() => {
    if (!db || !appId) return;
    const unsubApps = onSnapshot(collection(db, `artifacts/${appId}/public/data/appointments`), snap => {
      setAppointments(snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => a.timestamp - b.timestamp));
    });
    const unsubDocs = onSnapshot(collection(db, `artifacts/${appId}/public/data/all_users`), snap => {
      // Client side filtering for doctors
      setDoctors(snap.docs.map(d => ({id: d.id, ...d.data()})).filter(u => u.role === 'doctor' && u.status === 'approved'));
    });
    return () => { unsubApps(); unsubDocs(); };
  }, [db, appId]);

  const handleSchedule = async (e) => {
    e.preventDefault();
    const docInfo = doctors.find(d => d.id === e.target.doctorId.value);
    await updateDoc(doc(db, `artifacts/${appId}/public/data/appointments`, scheduleModal.id), {
      status: 'scheduled', doctorId: docInfo.id, doctorName: docInfo.name,
      scheduledDate: e.target.date.value, scheduledTime: e.target.time.value
    });
    setScheduleModal(null);
  };

  const handleVitals = async (e) => {
    e.preventDefault();
    await updateDoc(doc(db, `artifacts/${appId}/public/data/appointments`, vitalsModal.id), {
      status: 'ready',
      vitals: { bp: e.target.bp.value, hr: e.target.hr.value, glucose: e.target.glucose.value }
    });
    setVitalsModal(null);
  };

  const requestedQueue = appointments.filter(a => a.status === 'requested');
  const scheduledQueue = appointments.filter(a => a.status === 'scheduled');

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-8 space-y-8 animate-[fadeInUp_0.5s_ease-out_forwards]">
      
      {/* 1. Triage Queue */}
      <div>
        <h2 className="text-2xl font-extrabold text-blue-900 mb-4 flex items-center">
          <Icon name="users" className="mr-3 text-blue-500" size={28} /> Triage Queue (Requested)
          <span className="ml-3 bg-yellow-100 text-yellow-800 text-sm font-bold px-3 py-1 rounded-full">{requestedQueue.length}</span>
        </h2>
        <div className="bg-white shadow-xl border border-gray-200 rounded-3xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Patient Details</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Time Requested</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Reason for Visit</th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {requestedQueue.map(app => (
                  <tr key={app.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-gray-900">{app.patientName}</div>
                      <div className="text-xs text-gray-500">Age: {app.patientAge}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(app.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 max-w-xs truncate" title={app.reason}>{app.reason}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button onClick={() => setScheduleModal(app)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl transition shadow-md hover:shadow-lg transform hover:-translate-y-0.5">
                        Assign Doctor
                      </button>
                    </td>
                  </tr>
                ))}
                {requestedQueue.length === 0 && <tr><td colSpan="4" className="px-6 py-12 text-center text-gray-500 font-medium">Triage queue is empty. Great job!</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 2. Arrival Queue */}
      <div>
        <h2 className="text-2xl font-extrabold text-purple-900 mb-4 flex items-center mt-12">
          <Icon name="calendar" className="mr-3 text-purple-500" size={28} /> Arrival Queue (Scheduled)
          <span className="ml-3 bg-blue-100 text-blue-800 text-sm font-bold px-3 py-1 rounded-full">{scheduledQueue.length}</span>
        </h2>
        <div className="bg-white shadow-xl border border-gray-200 rounded-3xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Patient Details</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Schedule Info</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Reason</th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {scheduledQueue.map(app => (
                  <tr key={app.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-gray-900">{app.patientName}</div>
                      <div className="text-xs text-gray-500">Age: {app.patientAge}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-blue-700">{app.scheduledDate} @ {app.scheduledTime}</div>
                      <div className="text-xs font-medium text-gray-600">Dr. {app.doctorName}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 max-w-xs truncate">{app.reason}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button onClick={() => setVitalsModal(app)} className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-4 py-2 rounded-xl transition shadow-md hover:shadow-lg transform hover:-translate-y-0.5">
                        Patient Arrived (Vitals)
                      </button>
                    </td>
                  </tr>
                ))}
                {scheduledQueue.length === 0 && <tr><td colSpan="4" className="px-6 py-12 text-center text-gray-500 font-medium">No scheduled arrivals pending.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modals */}
      {scheduleModal && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-[fadeIn_0.2s_ease-out_forwards]">
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl transform transition-all">
            <h3 className="text-2xl font-extrabold text-blue-900 mb-6 border-b pb-4">Schedule Consultation</h3>
            <div className="bg-gray-50 p-4 rounded-xl mb-6">
              <p className="text-sm text-gray-500 font-bold mb-1">Patient</p>
              <p className="font-semibold text-lg text-gray-900">{scheduleModal.patientName}</p>
            </div>
            
            <form onSubmit={handleSchedule} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Date</label>
                  <input required name="date" type="date" className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Time</label>
                  <input required name="time" type="time" className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Assign Doctor</label>
                <select required name="doctorId" className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white shadow-sm">
                  <option value="">Select an available doctor...</option>
                  {doctors.map(d => <option key={d.id} value={d.id}>Dr. {d.name}</option>)}
                </select>
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={()=>setScheduleModal(null)} className="px-6 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition">Cancel</button>
                <button type="submit" className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg transition">Confirm Schedule</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {vitalsModal && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-[fadeIn_0.2s_ease-out_forwards]">
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl">
            <h3 className="text-2xl font-extrabold text-purple-900 mb-6 border-b pb-4">Record Patient Vitals</h3>
            <div className="bg-purple-50 p-4 rounded-xl mb-6 text-purple-900">
              <p className="text-sm font-bold mb-1">Patient Arrival</p>
              <p className="font-semibold text-lg">{vitalsModal.patientName}</p>
            </div>
            
            <form onSubmit={handleVitals} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Blood Pressure (mmHg)</label>
                <input required name="bp" placeholder="e.g., 120/80" className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 font-mono" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Heart Rate (bpm)</label>
                  <input required name="hr" type="number" placeholder="e.g., 72" className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 font-mono" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Glucose (mg/dL)</label>
                  <input required name="glucose" type="number" placeholder="e.g., 90" className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 font-mono" />
                </div>
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={()=>setVitalsModal(null)} className="px-6 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition">Cancel</button>
                <button type="submit" className="px-6 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 shadow-lg transition">Mark as Ready</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const DoctorDashboard = ({ db, userId, appId, mode = 'active' }) => {
  const [appointments, setAppointments] = useState([]);
  const [consultModal, setConsultModal] = useState(null);

  useEffect(() => {
    if (!db || !appId || !userId) return;
    const unsubApps = onSnapshot(collection(db, `artifacts/${appId}/public/data/appointments`), snap => {
      // Client side filtering for doctor specific apps
      const all = snap.docs.map(d => ({id: d.id, ...d.data()})).filter(a => a.doctorId === userId);
      setAppointments(all.sort((a,b) => b.timestamp - a.timestamp));
    });
    return () => unsubApps();
  }, [db, appId, userId]);

  const handleComplete = async (e) => {
    e.preventDefault();
    await updateDoc(doc(db, `artifacts/${appId}/public/data/appointments`, consultModal.id), {
      status: 'completed',
      clinicalNotes: e.target.notes.value
    });
    setConsultModal(null);
  };

  const displayApps = appointments.filter(a => mode === 'active' ? a.status === 'ready' : a.status === 'completed');

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-8 space-y-8 animate-[fadeInUp_0.5s_ease-out_forwards]">
      <div className="flex justify-between items-center border-b pb-4">
        <h2 className="text-3xl font-extrabold text-blue-900 flex items-center">
          <Icon name={mode==='active'?"stethoscope":"history"} className="mr-3 text-blue-500" size={32} />
          {mode === 'active' ? 'Patients Ready for Consult' : 'My Consultation History'}
        </h2>
        <div className="bg-white px-4 py-2 rounded-full shadow-sm font-bold text-gray-600 border border-gray-200">
          Total: {displayApps.length}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {displayApps.map(app => (
          <div key={app.id} className="bg-white p-6 rounded-3xl shadow-xl border border-gray-100 relative overflow-hidden flex flex-col justify-between hover:shadow-2xl transition-shadow duration-300">
            {mode === 'active' && <div className="absolute top-0 left-0 w-2 h-full bg-purple-500"></div>}
            {mode === 'history' && <div className="absolute top-0 left-0 w-2 h-full bg-green-500"></div>}
            
            <div className="pl-4">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-extrabold text-gray-900">{app.patientName}</h3>
                  <p className="text-sm font-medium text-gray-500">Age: {app.patientAge}y</p>
                </div>
                <span className={`text-xs font-bold px-3 py-1 rounded-full border tracking-wide uppercase ${mode==='active'?'bg-purple-100 text-purple-800 border-purple-200':'bg-green-100 text-green-800 border-green-200'}`}>
                  {app.status}
                </span>
              </div>
              
              <div className="mb-5 bg-gray-50 p-4 rounded-xl border border-gray-200">
                <p className="text-xs font-bold text-gray-500 uppercase mb-1">Reason for Visit</p>
                <p className="text-sm font-medium text-gray-800">{app.reason}</p>
              </div>

              {app.vitals && (
                <div className="mb-6 grid grid-cols-3 gap-2">
                  <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 text-center">
                    <p className="text-xs font-bold text-blue-500 uppercase">BP</p>
                    <p className="font-mono font-bold text-blue-900">{app.vitals.bp}</p>
                  </div>
                  <div className="bg-red-50 p-3 rounded-xl border border-red-100 text-center">
                    <p className="text-xs font-bold text-red-500 uppercase">HR</p>
                    <p className="font-mono font-bold text-red-900">{app.vitals.hr}</p>
                  </div>
                  <div className="bg-yellow-50 p-3 rounded-xl border border-yellow-100 text-center">
                    <p className="text-xs font-bold text-yellow-600 uppercase">Gluc</p>
                    <p className="font-mono font-bold text-yellow-900">{app.vitals.glucose}</p>
                  </div>
                </div>
              )}

              {mode === 'active' ? (
                 <button onClick={()=>setConsultModal(app)} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-3 rounded-xl shadow-md transition-all transform hover:-translate-y-1">
                   Start Consultation
                 </button>
              ) : (
                 <div className="mt-auto">
                   <p className="text-xs font-bold text-green-700 uppercase mb-2 flex items-center"><Icon name="checkCircle" size={14} className="mr-1" /> Clinical Notes</p>
                   <div className="text-sm bg-green-50 border border-green-100 text-gray-800 p-4 rounded-xl whitespace-pre-wrap leading-relaxed shadow-inner">
                     {app.clinicalNotes}
                   </div>
                 </div>
              )}
            </div>
          </div>
        ))}
        {displayApps.length === 0 && (
          <div className="col-span-full text-center p-12 bg-white rounded-3xl border border-dashed border-gray-300">
            <Icon name="checkCircle" size={64} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-xl font-bold text-gray-500">All caught up!</h3>
            <p className="text-gray-400">No {mode === 'active' ? 'pending patients' : 'history found'}.</p>
          </div>
        )}
      </div>

      {consultModal && (
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-[fadeIn_0.2s_ease-out_forwards]">
          <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-3xl shadow-2xl flex flex-col h-[85vh] sm:h-[80vh]">
            <h3 className="text-2xl font-extrabold text-blue-900 mb-4 border-b pb-4 flex items-center">
              <Icon name="stethoscope" className="mr-3 text-blue-600" size={28} />
              Consultation: {consultModal.patientName}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 flex-shrink-0">
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200">
                <p className="text-xs font-bold text-gray-500 uppercase mb-1">Reason</p>
                <p className="font-medium text-gray-800">{consultModal.reason}</p>
              </div>
              <div className="bg-purple-50 p-4 rounded-2xl border border-purple-200 flex items-center justify-around">
                <div className="text-center"><p className="text-xs font-bold text-purple-600 uppercase">BP</p><p className="font-mono font-bold text-purple-900">{consultModal.vitals?.bp}</p></div>
                <div className="w-px h-8 bg-purple-200"></div>
                <div className="text-center"><p className="text-xs font-bold text-purple-600 uppercase">HR</p><p className="font-mono font-bold text-purple-900">{consultModal.vitals?.hr}</p></div>
                <div className="w-px h-8 bg-purple-200"></div>
                <div className="text-center"><p className="text-xs font-bold text-purple-600 uppercase">Gluc</p><p className="font-mono font-bold text-purple-900">{consultModal.vitals?.glucose}</p></div>
              </div>
            </div>

            <form onSubmit={handleComplete} className="flex-grow flex flex-col">
              <label className="block text-sm font-extrabold text-gray-700 mb-2 uppercase tracking-wide">Clinical Notes & Prescriptions</label>
              <textarea 
                required name="notes" 
                className="flex-grow w-full p-4 border border-gray-300 rounded-2xl resize-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 mb-6 shadow-inner text-base leading-relaxed" 
                placeholder="Type your diagnosis, findings, and prescribed medications here. This will be visible to the patient." 
              />
              <div className="flex justify-end space-x-3 flex-shrink-0">
                <button type="button" onClick={()=>setConsultModal(null)} className="px-6 py-4 bg-gray-100 text-gray-700 font-extrabold rounded-xl hover:bg-gray-200 transition">Cancel</button>
                <button type="submit" className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-extrabold rounded-xl shadow-lg transition transform hover:-translate-y-1">Complete Consultation</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const AdminDashboard = ({ db, appId }) => {
  const [users, setUsers] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [activeTab, setActiveTab] = useState('stats');

  useEffect(() => {
    if (!db || !appId) return;
    const unsubUsers = onSnapshot(collection(db, `artifacts/${appId}/public/data/all_users`), snap => setUsers(snap.docs.map(d=>({id:d.id, ...d.data()}))));
    const unsubApps = onSnapshot(collection(db, `artifacts/${appId}/public/data/appointments`), snap => setAppointments(snap.docs.map(d=>({id:d.id, ...d.data()}))));
    return () => { unsubUsers(); unsubApps(); };
  }, [db, appId]);

  const handleApprove = async (uid) => {
    await updateDoc(doc(db, `artifacts/${appId}/public/data/all_users`, uid), { status: 'approved' });
    await updateDoc(doc(db, `artifacts/${appId}/users/${uid}/profile`, 'data'), { status: 'approved' });
  };

  const pendingUsers = users.filter(u => u.status === 'pending');
  const sortedApps = [...appointments].sort((a,b) => b.timestamp - a.timestamp);

  const tabs = [
    { id: 'stats', label: 'Overview', icon: 'home' },
    { id: 'approvals', label: `Pending Approvals (${pendingUsers.length})`, icon: 'alertTriangle' },
    { id: 'directory', label: 'Global Directory', icon: 'users' },
    { id: 'logs', label: 'System Logs', icon: 'history' },
  ];

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-8 flex flex-col h-full animate-[fadeInUp_0.5s_ease-out_forwards]">
      <h2 className="text-3xl font-extrabold text-blue-900 mb-6 flex-shrink-0 flex items-center">
        <Icon name="users" size={32} className="mr-3 text-blue-500" />
        Admin Control Center
      </h2>
      
      <div className="bg-white p-2 rounded-2xl shadow-sm border border-gray-200 mb-6 flex-shrink-0 flex overflow-x-auto">
        {tabs.map(t => (
          <button 
            key={t.id} onClick={()=>setActiveTab(t.id)} 
            className={`flex items-center px-6 py-3 font-bold text-sm whitespace-nowrap rounded-xl transition-all duration-200 ${activeTab === t.id ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
          >
            <Icon name={t.icon} size={18} className="mr-2" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-grow overflow-y-auto pr-2 pb-8">
        {activeTab === 'stats' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-8 rounded-3xl shadow-xl border border-blue-100 text-center relative overflow-hidden">
              <div className="absolute -right-4 -top-4 opacity-10 text-blue-500"><Icon name="users" size={100} /></div>
              <p className="text-gray-500 font-extrabold text-sm uppercase tracking-wider mb-2 relative z-10">Total Users</p>
              <p className="text-5xl font-extrabold text-blue-600 relative z-10">{users.length}</p>
            </div>
            <div className="bg-white p-8 rounded-3xl shadow-xl border border-green-100 text-center relative overflow-hidden">
               <div className="absolute -right-4 -top-4 opacity-10 text-green-500"><Icon name="stethoscope" size={100} /></div>
              <p className="text-gray-500 font-extrabold text-sm uppercase tracking-wider mb-2 relative z-10">Active Doctors</p>
              <p className="text-5xl font-extrabold text-green-600 relative z-10">{users.filter(u=>u.role==='doctor' && u.status==='approved').length}</p>
            </div>
            <div className="bg-white p-8 rounded-3xl shadow-xl border border-purple-100 text-center relative overflow-hidden">
               <div className="absolute -right-4 -top-4 opacity-10 text-purple-500"><Icon name="calendar" size={100} /></div>
              <p className="text-gray-500 font-extrabold text-sm uppercase tracking-wider mb-2 relative z-10">Total Consults</p>
              <p className="text-5xl font-extrabold text-purple-600 relative z-10">{appointments.length}</p>
            </div>
            <div className="bg-white p-8 rounded-3xl shadow-xl border border-yellow-100 text-center relative overflow-hidden">
               <div className="absolute -right-4 -top-4 opacity-10 text-yellow-500"><Icon name="alertTriangle" size={100} /></div>
              <p className="text-gray-500 font-extrabold text-sm uppercase tracking-wider mb-2 relative z-10">Pending Staff</p>
              <p className="text-5xl font-extrabold text-yellow-600 relative z-10">{pendingUsers.length}</p>
            </div>
          </div>
        )}

        {activeTab === 'approvals' && (
          <div className="bg-white shadow-xl border border-gray-200 rounded-3xl overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50"><tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">User Info</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Requested Role</th>
                <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Action</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-200">
                {pendingUsers.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4">
                      <div className="text-sm font-extrabold text-gray-900">{u.name}</div>
                      <div className="text-sm text-gray-500">{u.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="bg-yellow-100 text-yellow-800 border border-yellow-200 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide">
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={()=>handleApprove(u.id)} className="bg-green-500 text-white px-6 py-2 rounded-xl hover:bg-green-600 text-sm font-bold shadow-md transform hover:-translate-y-0.5 transition">
                        Approve Access
                      </button>
                    </td>
                  </tr>
                ))}
                {pendingUsers.length === 0 && <tr><td colSpan="3" className="px-6 py-16 text-center text-gray-500 font-bold text-lg"><Icon name="checkCircle" size={48} className="mx-auto mb-4 text-green-400" />No pending approvals required.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'directory' && (
          <div className="bg-white shadow-xl border border-gray-200 rounded-3xl overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50"><tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Name/Email</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Demographics</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-200">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4"><div className="text-sm font-extrabold text-gray-900">{u.name}</div><div className="text-xs text-gray-500">{u.email}</div></td>
                    <td className="px-6 py-4"><span className="text-xs font-bold uppercase text-gray-600 bg-gray-100 px-2 py-1 rounded-md border">{u.role}</span></td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-600">{u.age ? `${u.age}y` : 'N/A'}, {u.gender || 'N/A'}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border tracking-wide uppercase ${u.status==='approved'?'bg-green-100 text-green-800 border-green-200':'bg-yellow-100 text-yellow-800 border-yellow-200'}`}>
                        {u.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 text-sm font-bold text-gray-600 flex items-center">
              <Icon name="history" className="mr-2" /> Global Chronological Event Stream
            </div>
            {sortedApps.map(app => (
              <div key={app.id} className="bg-white p-5 border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition text-sm flex flex-col sm:flex-row justify-between items-start sm:items-center">
                <div className="mb-2 sm:mb-0 flex items-center">
                  <div className="w-2 h-2 rounded-full bg-blue-500 mr-3"></div>
                  <span className="font-bold text-gray-800 mr-2 w-48 text-xs">{new Date(app.timestamp).toLocaleString()}</span>
                  <span className="text-gray-600 text-base">Patient <span className="font-extrabold text-blue-900">{app.patientName}</span> consultation log.</span>
                </div>
                <div className="font-extrabold text-xs px-3 py-1 bg-gray-100 border rounded-lg text-gray-700 uppercase tracking-wider">STATE: {app.status}</div>
              </div>
            ))}
             {sortedApps.length === 0 && <div className="text-center p-8 text-gray-500 font-bold bg-white rounded-2xl">No system logs generated yet.</div>}
          </div>
        )}
      </div>
    </div>
  );
};

// =================================================================================
// --- ORIGINAL CORE PAGES (PRESERVED AESTHETICS & LOGIC) ---
// =================================================================================

const HomePage = ({ onNavigate }) => (
  <div className="h-full flex flex-col items-center justify-center relative bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-500 p-4 sm:p-8 overflow-hidden">
    <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
    <div className="absolute w-96 h-96 bg-cyan-400 rounded-full blur-3xl opacity-30 top-10 left-10 animate-pulse"></div>
    <div className="absolute w-96 h-96 bg-blue-800 rounded-full blur-3xl opacity-30 bottom-10 right-10 animate-pulse delay-1000"></div>

    <div className="z-10 text-center text-white p-4 max-w-4xl bg-white/10 backdrop-blur-md rounded-3xl border border-white/20 shadow-2xl p-10 animate-[fadeInUp_0.6s_ease-out_forwards]">
      <div className="mx-auto bg-white w-20 h-20 rounded-2xl flex items-center justify-center mb-8 shadow-xl">
        <Icon name="stethoscope" size={48} className="text-blue-600" />
      </div>
      <h1 className="text-5xl md:text-7xl font-extrabold mb-6 drop-shadow-2xl tracking-tight leading-tight">
        Vaidya <span className="text-cyan-300">Mithra</span> HMIS
      </h1>
      <p className="text-xl md:text-2xl mb-10 font-medium drop-shadow-md text-blue-50">
        Enterprise Hospital Management & AI Triage Ecosystem
      </p>
      <button 
        onClick={() => onNavigate('appointments')} 
        className="inline-flex items-center px-10 py-4 bg-green-500 text-white text-xl font-extrabold rounded-full shadow-[0_10px_20px_rgba(34,197,94,0.4)] hover:bg-green-400 hover:shadow-[0_15px_30px_rgba(34,197,94,0.6)] transition-all duration-300 transform hover:-translate-y-1"
      >
        Access Dashboard
        <Icon name="chevronRight" size={28} className="ml-3" color="white" />
      </button>
    </div>
  </div>
);

const HospitalPage = () => {
  const [status, setStatus] = useState('ready');

  const findHospitals = () => {
    if (!navigator.geolocation) {
      setStatus('error');
      console.warn("Geolocation is not supported by your browser.");
      return;
    }
    setStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStatus('found');
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        window.open(`https://www.google.com/maps/search/?api=1&query=hospitals+near+${lat},${lon}`, '_blank');
      },
      (error) => {
        console.error("Geolocation error:", error);
        setStatus('error');
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  return (
    <div id="hospitals-page" className="h-full flex items-center justify-center p-4 sm:p-8 bg-gray-50 relative overflow-hidden">
       {/* Background Decoration */}
       <div className="absolute top-0 right-0 w-1/2 h-full bg-blue-50 rounded-l-[100px] opacity-50 transform translate-x-20"></div>

      <div className="bg-white shadow-2xl rounded-3xl p-8 sm:p-12 border border-gray-100 transition-all duration-300 max-w-2xl w-full z-10 animate-[fadeInUp_0.5s_ease-out_forwards]">
        <div className="flex items-center justify-center w-20 h-20 bg-blue-100 rounded-full mb-8">
           <Icon name="hospital" size={40} className="text-blue-600" />
        </div>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-blue-900 mb-6">
          Emergency Facility Locator
        </h2>
        <p className="text-gray-600 mb-8 text-lg leading-relaxed">
          Quickly find the nearest medical facilities, clinics, and trauma centers. We use your secure GPS location to instantly launch a localized Google Maps search query.
        </p>

        <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-4">
          <button
            onClick={findHospitals}
            disabled={status === 'loading'}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-4 px-8 rounded-2xl shadow-lg transition-all duration-300 disabled:opacity-50 flex items-center justify-center transform hover:-translate-y-1"
          >
            {status === 'loading' ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Acquiring Satellite Lock...
              </span>
            ) : (
              <span className="flex items-center text-lg">
                Locate Hospitals <Icon name="chevronRight" size={24} className="ml-2" color="white" />
              </span>
            )}
          </button>
          {status === 'found' && <p className="text-sm font-bold text-green-600 bg-green-50 px-4 py-2 rounded-xl border border-green-200">Maps Launched Successfully!</p>}
          {status === 'error' && <p className="text-sm font-bold text-red-600 bg-red-50 px-4 py-2 rounded-xl border border-red-200">Location Access Denied / Failed</p>}
        </div>
      </div>
    </div>
  );
};

const DocBotPage = ({ db, userId, authReady, appId }) => {
  const CHAT_BOT_SYSTEM_INSTRUCTION = "You are a friendly, non-diagnostic AI assistant named DocBot inside the Vaidya Mithra HMIS. Your role is to answer general health questions, provide basic medical information, explain symptoms, and offer clear advice on when to see a doctor. Never provide a formal diagnosis, treatment, or specific medication advice. Keep responses encouraging and concise. Use Google Search grounding when necessary.";

  const [chatHistory, setChatHistory] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  const suggestedQuestions = [
    "What are the symptoms of the flu?",
    "How can I relieve a headache safely?",
    "Explain hypertension simply.",
  ];

  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); };
  useEffect(scrollToBottom, [chatHistory]);

  useEffect(() => {
    if (!authReady || !userId || !db || !appId) return;
    try {
      const q = query(collection(db, `artifacts/${appId}/users/${userId}/docbot_chat`), orderBy('timestamp', 'asc'), limit(50));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setChatHistory(snapshot.docs.map(doc => ({...doc.data(), id: doc.id })));
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Firestore Chat Setup Failed:", e);
    }
  }, [db, userId, authReady, appId]);

  const fetchWithBackoff = useCallback(async (url, options, retries = 3, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, options);
        if (response.ok) return response;
        if (response.status === 429 && i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; continue;
        }
        throw new Error(`API status ${response.status}`);
      } catch (error) {
        if (i === retries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  }, []);

  const handleSend = async (messageText) => {
    const message = (typeof messageText === 'string') ? messageText : currentMessage;
    if (!message.trim() || isTyping || !db || !userId || !appId) return;

    const userMessage = message.trim();
    setCurrentMessage('');
    const chatCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/docbot_chat`);
    
    // Save user message
    await setDoc(doc(chatCollectionRef), { text: userMessage, role: 'user', timestamp: serverTimestamp() });
    setIsTyping(true);

    try {
      const apiHistory = chatHistory.map(msg => ({
        role: msg.role === 'ai' ? 'model' : 'user',
        parts: [{ text: msg.text }]
      }));
      apiHistory.push({ role: 'user', parts: [{ text: userMessage }] });

      const payload = {
        contents: apiHistory,
        tools: [{ "google_search": {} }],
        systemInstruction: { parts: [{ text: CHAT_BOT_SYSTEM_INSTRUCTION }] },
      };

      const response = await fetchWithBackoff(GEMINI_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json();
      const aiText = result.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't process that right now.";
      
      // Save AI response
      await setDoc(doc(chatCollectionRef), { text: aiText, role: 'ai', timestamp: serverTimestamp() });
    } catch (error) {
      await setDoc(doc(chatCollectionRef), { text: "Network error connecting to AI core.", role: 'ai_error', timestamp: serverTimestamp() });
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="h-full p-4 sm:p-8 flex flex-col bg-gray-50">
      <div className="bg-white shadow-2xl rounded-3xl p-4 sm:p-8 border border-gray-100 flex flex-col flex-grow h-full overflow-hidden animate-[fadeInUp_0.5s_ease-out_forwards]">
        
        <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4 flex-shrink-0">
          <h2 className="text-2xl font-extrabold text-blue-900 flex items-center">
            <div className="bg-green-100 p-2 rounded-xl mr-3"><Icon name="messageSquare" size={28} className="text-green-600" /></div>
            DocBot Assistant
          </h2>
          <div className="flex items-center text-xs font-bold text-green-600 bg-green-50 px-3 py-1 rounded-full border border-green-200">
            <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></span> Online
          </div>
        </div>

        <div className="flex-grow overflow-y-auto p-4 mb-4 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col space-y-4 shadow-inner">
          {chatHistory.length === 0 && !isTyping ? (
            <div className="text-center text-gray-500 m-auto animate-[fadeIn_0.5s_0.3s_ease-out_forwards]">
              <div className="bg-white w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border border-gray-100">
                <Icon name="stethoscope" size={48} className="text-blue-400" />
              </div>
              <p className="text-lg font-medium text-gray-700">Hello! I am DocBot.</p>
              <p className="text-sm mb-8">Ask me general health questions while you wait.</p>
              
              <div>
                <h4 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider mb-4 flex items-center justify-center">
                  <Icon name="lightbulb" size={16} className="mr-2 text-yellow-500" /> Try asking
                </h4>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  {suggestedQuestions.map((q) => (
                    <button key={q} onClick={() => handleSend(q)} className="px-5 py-3 bg-white text-blue-700 border border-blue-100 rounded-2xl text-sm font-bold transition-all duration-200 hover:bg-blue-50 hover:shadow-md transform hover:-translate-y-1">
                      "{q}"
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            chatHistory.map(msg => (
               <div key={msg.id} className={`max-w-[85%] sm:max-w-md p-4 rounded-2xl shadow-sm text-sm leading-relaxed ${
                 msg.role === 'user' 
                   ? 'bg-blue-600 text-white self-end rounded-br-none shadow-blue-200' 
                   : msg.role === 'ai_error' 
                   ? 'bg-red-50 text-red-800 self-start border border-red-200 rounded-tl-none' 
                   : 'bg-white text-gray-800 self-start border border-gray-200 rounded-tl-none'
               }`}>
                 <p className="whitespace-pre-wrap">{msg.text}</p>
               </div>
            ))
          )}
          {isTyping && (
             <div className="self-start bg-white border border-gray-200 p-4 rounded-2xl rounded-tl-none shadow-sm flex items-center space-x-2 w-20">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: "0.2s"}}></div>
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: "0.4s"}}></div>
             </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="flex space-x-3 flex-shrink-0 bg-white p-2 rounded-2xl border border-gray-200 shadow-sm">
          <input
            type="text" value={currentMessage} onChange={(e) => setCurrentMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            className="flex-grow p-4 bg-transparent focus:outline-none text-gray-800"
            placeholder={!authReady ? "Connecting..." : "Type your health question here..."}
            disabled={isTyping || !authReady}
          />
          <button
            onClick={() => handleSend()} disabled={isTyping || !currentMessage.trim() || !authReady}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold w-14 h-14 rounded-xl transition-all shadow-md disabled:opacity-50 flex items-center justify-center transform hover:scale-105"
          >
            <Icon name="send" size={24} color="white" />
          </button>
        </div>
      </div>
    </div>
  );
};

const ContactPage = () => {
  const team = [
    { name: "Dilip Kumar A N", phone: "7259447817", email: "dilipkumaran.ec23@rvce.edu.in" },
    { name: "Arya B V", phone: "8050141198", email: "aryabv.ec23@rvce.edu.in" },
  ];

  return (
    <div className="h-full flex items-center justify-center p-4 sm:p-6 bg-gray-50">
      <div className="bg-white shadow-2xl rounded-3xl p-8 sm:p-12 border border-gray-100 max-w-4xl w-full text-center animate-[fadeInUp_0.5s_ease-out_forwards]">
        <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Icon name="mail" size={40} className="text-blue-600" />
        </div>
        <h2 className="text-4xl font-extrabold text-blue-900 mb-4">Support & Contact</h2>
        <p className="text-gray-500 mb-10 text-lg">For technical support, legal inquiries, or system access questions.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
          {team.map((person) => (
            <div key={person.name} className="bg-gray-50 border border-gray-200 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow hover:border-blue-300">
              <p className="font-extrabold text-xl text-blue-900 mb-4">{person.name}</p>
              <div className="space-y-3">
                <div className="flex items-center text-gray-700 bg-white p-3 rounded-xl border border-gray-100">
                  <Icon name="phone" size={18} className="mr-3 text-blue-500" />
                  <a href={`tel:${person.phone}`} className="hover:text-blue-600 font-medium transition">{person.phone}</a>
                </div>
                <div className="flex items-center text-gray-700 bg-white p-3 rounded-xl border border-gray-100">
                  <Icon name="mail" size={18} className="mr-3 text-blue-500" />
                  <a href={`mailto:${person.email}`} className="hover:text-blue-600 font-medium transition text-sm">{person.email}</a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// -----------------------------
// HEAVILY STYLED PREDICTION PAGE
// -----------------------------
const PredictionPage = ({ db, userId, authReady, appId, userProfile }) => {
  const [selectedSymptoms, setSelectedSymptoms] = useState([]);
  const [predictionResult, setPredictionResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState(SYMPTOM_CATEGORIES[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [history, setHistory] = useState([]);

  // Fetch History
  useEffect(() => {
    if (!authReady || !userId || !db || !appId) return;
    try {
      const historyCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/symptom_history`);
      const q = query(historyCollectionRef, orderBy('timestamp', 'desc'), limit(5));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setHistory(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Firestore History Listener Failed:", e);
    }
  }, [db, userId, authReady, appId]);

  const handlePrediction = async () => {
    if (selectedSymptoms.length === 0) return;
    setIsLoading(true); setPredictionResult(null);

    // Scroll to results
    setTimeout(() => { document.getElementById('prediction-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);

    const userAge = userProfile?.age || 30;
    const userGender = userProfile?.gender || 'Unknown';
    const userQuery = `The patient is a ${userAge} year old ${userGender}. They are currently experiencing the following symptoms: ${selectedSymptoms.join(', ')}. Please act as a professional medical analyst and provide the top 3 most likely differential diagnoses, a confidence score (0.0 to 1.0) for each, and non-alarming, concise next steps/advice. Focus strictly on the JSON output format.`;

    try {
      const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: JSON_SCHEMA },
      };
      const response = await fetch(GEMINI_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json();
      const parsedResult = JSON.parse(result.candidates[0].content.parts[0].text);
      setPredictionResult(parsedResult);
      
      if (db && userId && appId) {
        const historyCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/symptom_history`);
        await setDoc(doc(historyCollectionRef), {
          symptoms: selectedSymptoms, age: userAge, gender: userGender, result: parsedResult, timestamp: serverTimestamp(),
        });
      }
    } catch (error) {
      setPredictionResult({ error: `Could not retrieve AI prediction. ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredSymptoms = useMemo(() => {
    let symptoms = searchQuery ? SYMPTOM_CATEGORIES.flatMap(cat => ALL_SYMPTOMS_CATEGORIZED[cat]) : ALL_SYMPTOMS_CATEGORIZED[activeCategory] || [];
    return symptoms.filter(s => s.toLowerCase().includes(searchQuery.toLowerCase())).sort((a, b) => a.localeCompare(b));
  }, [activeCategory, searchQuery]);

  const isEmergency = predictionResult?.emergency_flag || selectedSymptoms.some(s => s.toLowerCase().includes('chest pain') || s.toLowerCase().includes('difficulty breathing'));

  return (
    <div className="max-w-7xl mx-auto flex flex-col p-4 sm:p-8 space-y-6">
      
      {/* HEADER */}
      <div className="flex-shrink-0 animate-[fadeInUp_0.5s_ease-out_forwards]">
        <h2 className="text-4xl font-extrabold text-blue-900 mb-2">AI Symptom Triage</h2>
        <p className="text-gray-500 text-lg">Select symptoms to get an initial, non-diagnostic AI assessment before booking.</p>
      </div>

      {/* MAIN SELECTION AREA */}
      <div className="flex-grow flex flex-col lg:flex-row gap-6 animate-[fadeInUp_0.6s_ease-out_forwards]">
        
        {/* Left: Search & Pick */}
        <div className="lg:w-1/2 flex flex-col bg-white shadow-xl rounded-3xl border border-gray-100 p-6">
          <div className="flex justify-between items-center mb-4 flex-shrink-0">
             <h3 className="text-xl font-extrabold text-blue-900">Symptom Dictionary</h3>
             <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search symptoms..." className="p-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 w-1/2 text-sm" />
          </div>
          
          <div className="flex space-x-2 overflow-x-auto pb-3 border-b border-gray-200 flex-shrink-0 hide-scrollbar">
            {SYMPTOM_CATEGORIES.map(cat => (
              <button key={cat} onClick={() => { setActiveCategory(cat); setSearchQuery(''); }} className={`px-4 py-2 rounded-xl text-sm font-bold transition whitespace-nowrap ${ activeCategory === cat && !searchQuery ? 'bg-blue-600 text-white shadow-md transform -translate-y-0.5' : 'bg-gray-100 text-gray-600 hover:bg-gray-200' }`}>
                {cat}
              </button>
            ))}
          </div>

          <div className="flex-grow overflow-y-auto pr-2 pt-4 grid grid-cols-2 gap-3 max-h-[40vh]">
            {filteredSymptoms.map(symptom => {
              const isSelected = selectedSymptoms.includes(symptom);
              return (
                <button key={symptom} onClick={() => setSelectedSymptoms(p=>p.includes(symptom)?p.filter(s=>s!==symptom):[...p, symptom])} className={`p-3 text-sm h-fit rounded-xl text-left shadow-sm transition-all duration-200 border ${isSelected ? 'bg-green-500 text-white font-bold border-green-600' : 'bg-gray-50 text-gray-700 hover:bg-blue-50 border-gray-200'}`}>
                  {symptom}
                </button>
              );
            })}
            {filteredSymptoms.length === 0 && <p className="text-gray-500 italic col-span-2 text-center p-4">No symptoms found.</p>}
          </div>
        </div>

        {/* Right: Selected & Action */}
        <div className="lg:w-1/2 flex flex-col bg-white shadow-xl rounded-3xl border border-gray-100 p-6">
          <h3 className="text-xl font-extrabold text-blue-900 mb-4 flex-shrink-0">Selected Symptoms ({selectedSymptoms.length})</h3>
          <div className="flex-grow flex flex-wrap gap-2 min-h-[150px] bg-gray-50 border border-dashed border-gray-300 rounded-2xl p-4 mb-6">
            {selectedSymptoms.length === 0 ? (
              <p className="text-gray-400 font-medium m-auto text-center"><Icon name="stethoscope" size={40} className="mx-auto mb-2 opacity-50"/>Start selecting from the left...</p>
            ) : (
              selectedSymptoms.map(symptom => (
                <div key={symptom} className="flex h-fit items-center bg-blue-100 text-blue-900 font-bold px-4 py-2 rounded-full border border-blue-200 shadow-sm transition transform hover:scale-105">
                  {symptom}
                  <button onClick={() => setSelectedSymptoms(p=>p.filter(s=>s!==symptom))} className="ml-2 text-blue-500 hover:text-red-500 transition"><Icon name="x" size={16} /></button>
                </div>
              ))
            )}
          </div>
          
          <div className="flex justify-end space-x-3 flex-shrink-0">
            <button onClick={()=>setSelectedSymptoms([])} disabled={selectedSymptoms.length === 0 || isLoading} className="px-6 py-4 text-gray-700 font-bold bg-gray-100 hover:bg-gray-200 rounded-xl transition disabled:opacity-50">Clear</button>
            <button onClick={handlePrediction} disabled={selectedSymptoms.length === 0 || isLoading || !authReady} className="flex-grow px-6 py-4 text-white font-extrabold bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg hover:shadow-xl transition transform hover:-translate-y-1 disabled:opacity-50 disabled:hover:translate-y-0 flex justify-center items-center">
              {isLoading ? 'Analyzing Symptoms via Gemini...' : 'Analyze Symptoms'}
            </button>
          </div>
        </div>
      </div>

      {/* RESULTS AREA */}
      <div id="prediction-results" className="pt-4">
        {isLoading && <div className="space-y-4"><SkeletonCard /><SkeletonCard /></div>}
        
        {isEmergency && !isLoading && (
          <div className="bg-red-50 border-l-4 border-red-600 p-6 rounded-r-2xl mb-6 flex items-start text-red-900 shadow-sm animate-[fadeIn_0.3s_ease-out]">
            <Icon name="alertTriangle" size={32} className="flex-shrink-0 mt-1" color="#dc2626" />
            <div className="ml-4">
              <h4 className="font-extrabold text-xl mb-1">EMERGENCY WARNING</h4>
              <p className="font-medium text-red-800">Based on your symptoms, please seek professional emergency medical help immediately. Call your local emergency number.</p>
            </div>
          </div>
        )}
        
        {predictionResult && !isLoading && !predictionResult.error && (
          <div className="bg-white shadow-xl rounded-3xl border border-gray-100 p-6 sm:p-8 animate-[fadeInUp_0.5s_ease-out]">
            <h3 className="text-2xl font-extrabold text-blue-900 mb-6 flex items-center border-b pb-4"><Icon name="checkCircle" size={28} className="mr-3 text-green-500" /> AI Diagnostic Assessment</h3>
            <div className="space-y-6">
              {predictionResult.predictions.map((p, index) => {
                const conf = Math.round(p.confidence * 100);
                const color = conf > 70 ? 'bg-green-500' : conf > 40 ? 'bg-yellow-500' : 'bg-red-400';
                return (
                  <div key={index} className="p-6 rounded-2xl bg-gray-50 border border-gray-200">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="font-extrabold text-xl text-gray-900">{p.disease}</h4>
                      <span className="text-sm font-extrabold bg-white border px-3 py-1 rounded-lg text-gray-700 shadow-sm">{conf}% Match</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3 mb-4 overflow-hidden"><div className={`h-3 rounded-full ${color}`} style={{ width: `${conf}%` }}></div></div>
                    <p className="text-gray-700 leading-relaxed font-medium">{p.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {predictionResult?.error && !isLoading && (
          <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-800"><p className="font-bold mb-1">System Error</p><p>{predictionResult.error}</p></div>
        )}
      </div>
      
      {/* HISTORY */}
      <div className="bg-white shadow-xl rounded-3xl border border-gray-100 p-6 sm:p-8 mt-6">
        <h3 className="text-xl font-extrabold text-blue-900 mb-6 flex items-center border-b pb-4"><Icon name="history" size={24} className="mr-3 text-blue-500" /> Recent AI Triage History</h3>
        {history.length === 0 ? <p className="text-gray-500 italic">No previous checks found.</p> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {history.map(item => (
              <div key={item.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-200 shadow-sm">
                <p className="text-xs font-bold text-gray-500 mb-2">{new Date(item.timestamp?.seconds * 1000).toLocaleString()}</p>
                <p className="text-sm font-medium text-gray-800 mb-3 truncate" title={item.symptoms.join(', ')}>Symp: {item.symptoms.join(', ')}</p>
                <div className="text-sm font-bold text-green-700 bg-green-50 p-2 rounded-lg border border-green-100">Top Match: {item.result.predictions[0]?.disease || 'N/A'}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// =================================================================================
// --- MAIN APP COMPONENT (STATE / ROUTER) ---
// =================================================================================

const App = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [appId, setAppId] = useState(null);
  const [currentPage, setCurrentPage] = useState('home');
  const [unreadCount, setUnreadCount] = useState(0);

  // 1. Initialize Firebase
  useEffect(() => {
    let isMounted = true;
    try {
      // Prioritize Canvas variables, fallback to Vercel env
      const configStr = (typeof __firebase_config !== 'undefined') 
        ? __firebase_config 
        : (env.VITE_FIREBASE_CONFIG || null);
      
      if (!configStr || configStr === '{}') {
        console.warn("No Firebase configuration found. Waiting or defaulting.");
        if (isMounted) setAuthReady(true); // Prevent freeze
        return;
      }
      
      const firebaseConfig = typeof configStr === 'string' ? JSON.parse(configStr) : configStr;
      
      if (!firebaseConfig.apiKey) {
        console.warn("Invalid Firebase config. Missing apiKey.");
        if (isMounted) setAuthReady(true); // Prevent freeze
        return;
      }

      // AppId handling
      const currentAppId = (typeof __app_id !== 'undefined') ? __app_id : firebaseConfig.appId;

      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const firebaseAuth = getAuth(app);
      
      if (isMounted) {
        setDb(firestore); 
        setAuth(firebaseAuth); 
        setAppId(currentAppId);
      }

      onAuthStateChanged(firebaseAuth, (authUser) => {
        if (!isMounted) return;
        if (authUser) {
          setUser(authUser);
        } else {
          setUser(null); 
          setUserProfile(null); 
          setAuthReady(true);
        }
      });
    } catch (e) {
      console.error("Firebase Init Failed:", e);
      if (isMounted) setAuthReady(true); // Prevent freeze on error
    }
    return () => { isMounted = false; };
  }, []);

  // 2. Fetch User Profile & Apply RBAC Routing
  useEffect(() => {
    if (!user || !db || !appId) return;
    // Reading from public directory as master source of truth for Role/Status to prevent desync
    const unsub = onSnapshot(doc(db, `artifacts/${appId}/public/data/all_users`, user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const profileData = docSnap.data();
        setUserProfile(profileData);
        
        // Auto-redirect on initial load
        if (!userProfile) {
           if (profileData.role === 'admin') setCurrentPage('admin-dashboard');
           else if (profileData.role === 'doctor') setCurrentPage('doctor-dashboard');
           else if (profileData.role === 'attender') setCurrentPage('attender-dashboard');
           else setCurrentPage('home');
        }
      }
      setAuthReady(true); // Unlocks UI once profile is loaded
    }, (error) => {
      console.error("Failed to load user profile", error);
      setAuthReady(true); // Unlock UI on error
    });
    return () => unsub();
  }, [user, db, appId, userProfile]);

  // 3. Notification Count (Patients)
  useEffect(() => {
    if (!user || !db || !appId || userProfile?.role !== 'patient') return;
    const q = query(collection(db, `artifacts/${appId}/public/data/appointments`));
    const unsub = onSnapshot(q, (snap) => {
      // Memory filter
      const count = snap.docs.map(d=>d.data()).filter(a => a.patientId === user.uid && (a.status === 'scheduled' || a.status === 'ready' || a.status === 'completed')).length;
      setUnreadCount(count); 
    });
    return () => unsub();
  }, [user, db, appId, userProfile]);

  const handleLogout = async () => {
    if (auth) {
      await signOut(auth);
      setUserProfile(null);
      setCurrentPage('home');
    }
  };

  // UI STATE: Loading
  if (!authReady) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-50 font-sans">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mb-6">
            <Icon name="stethoscope" size={48} className="text-blue-600" />
          </div>
          <p className="text-blue-900 font-extrabold text-xl tracking-wide">Initializing HMIS Engine...</p>
        </div>
      </div>
    );
  }

  // UI STATE: Auth Guard
  if (!user) {
    return <AuthPage db={db} auth={auth} appId={appId} />;
  }

  // UI STATE: Pending Staff Guard
  if (userProfile && userProfile.status === 'pending') {
    return <PendingStatePage onLogout={handleLogout} />;
  }

  // ROUTING RENDERER
  const renderPage = () => {
    const pageProps = { db, auth, userId: user.uid, appId, authReady, userProfile };
    
    switch (currentPage) {
      case 'home': return <HomePage onNavigate={setCurrentPage} />;
      case 'appointments': return <PatientAppointments {...pageProps} />;
      case 'prediction': return <PredictionPage {...pageProps} />;
      case 'docbot': return <DocBotPage {...pageProps} />;
      case 'hospitals': return <HospitalPage />;
      case 'profile': return <ProfilePage {...pageProps} />;
      case 'contact': return <ContactPage />;
      case 'attender-dashboard': return <AttenderDashboard {...pageProps} />;
      case 'doctor-dashboard': return <DoctorDashboard {...pageProps} mode="active" />;
      case 'doctor-history': return <DoctorDashboard {...pageProps} mode="history" />;
      case 'admin-dashboard':
      case 'admin-approvals':
      case 'admin-users':
      case 'admin-logs':
         return <AdminDashboard {...pageProps} />;
      default: return <HomePage onNavigate={setCurrentPage} />;
    }
  };

  // MAIN LAYOUT
  return (
    <div className="flex flex-col h-screen w-screen bg-gray-50 font-sans overflow-hidden">
      <style>{`
        /* Global Custom Tailwind Extensions */
        @keyframes fadeInUp { 
          from { opacity: 0; transform: translateY(20px); } 
          to { transform: translateY(0); opacity: 1; } 
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
      
      <NavBar 
        currentPage={currentPage} 
        onNavigate={setCurrentPage} 
        userProfile={userProfile} 
        onLogout={handleLogout} 
        unreadCount={unreadCount} 
      />
      
      {/* Strict Flex structure: only main scrolls */}
      <main className="flex-grow overflow-y-auto relative">
        {renderPage()}
      </main>
      
      <Footer />
    </div>
  );
};

export default App;
