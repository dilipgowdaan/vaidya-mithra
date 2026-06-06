import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
// --- Firebase SDK Imports ---
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
  signOut, onAuthStateChanged, updatePassword, reauthenticateWithCredential, EmailAuthProvider 
} from 'firebase/auth';
import { 
  getFirestore, collection, doc, setDoc, updateDoc, query, orderBy, limit, 
  onSnapshot, serverTimestamp, setLogLevel, getDocs 
} from 'firebase/firestore';

// --- API Configuration ---
const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
const apiKey = env.VITE_VAIDYA_MITHRA_GEMINI_KEY || "";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

// --- Structured JSON Schema for Disease Prediction ---
const JSON_SCHEMA = {
  type: "OBJECT",
  properties: {
    emergency_flag: { type: "BOOLEAN" },
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

// --- Symptom Data & Categories ---
const ALL_SYMPTOMS_CATEGORIZED = {
  General: ['Fatigue', 'Fever', 'Headache', 'Dizziness', 'Nausea', 'Vomiting', 'Body Ache', 'Chills', 'Sore Throat', 'Diarrhea', 'Constipation', 'Runny Nose'],
  Respiratory: ['Cough', 'Shortness of Breath', 'Wheezing', 'Chest Tightness', 'Difficulty Breathing', 'Sputum Production', 'Sneezing', 'Hoarseness'],
  Cardiac: ['Chest Pain', 'Palpitations', 'Fainting', 'Swelling of Legs/Ankles', 'Rapid Heartbeat', 'Lightheadedness', 'Pain Radiating to Jaw/Arm'],
  Skin: ['Rash', 'Itching', 'Hives', 'Dry Skin', 'Jaundice', 'Bruising', 'Change in Mole appearance', 'Redness/Inflammation'],
  Musculoskeletal: ['Joint Pain', 'Muscle Pain', 'Back Pain', 'Stiffness', 'Swollen Joints', 'Limited Range of Motion', 'Numbness/Tingling'],
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
    users: <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
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
          
          <div className="hidden md:flex items-center space-x-2">
            {navItems.map((item) => {
              const isActive = currentPage === item.id;
              return (
                <a
                  key={item.id} href="#"
                  onClick={(e) => { e.preventDefault(); handleNavigation(item.id); }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center transition duration-150 relative ${
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
          
          <div className="md:hidden flex items-center">
             {userProfile?.role === 'patient' && unreadCount > 0 && (
                <div className="mr-4 relative">
                  <Icon name="bell" size={24} color="#3b82f6" />
                  <span className="absolute 0 right-0 flex h-3 w-3">
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                  </span>
                </div>
              )}
            <button className="p-2 rounded-lg text-gray-700 hover:bg-gray-100 transition" onClick={() => setIsMenuOpen(!isMenuOpen)}>
              {isMenuOpen ? <Icon name="x" size={24} /> : <Icon name="home" size={24} />}
            </button>
          </div>
        </div>
      </div>

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
            <button onClick={onLogout} className="px-4 py-3 rounded-lg text-lg font-medium text-red-600 hover:bg-red-50 flex items-center transition text-left">
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
  <div className={`bg-white/90 backdrop-blur-sm border-t border-gray-200 py-3 px-4 sm:px-8 flex-shrink-0 ${className}`}>
    <p className="text-xs text-gray-600 text-center max-w-5xl mx-auto mb-1">
      <strong>Disclaimer:</strong> This application is for informational purposes. NOT a substitute for professional medical advice. Supported by Center of Excellence in Supply Chain Management (CoE-SCM).
    </p>
    <p className="text-xs text-gray-500 text-center">
      © 2026 Vaidya Mithra HMIS. All rights reserved.
    </p>
  </div>
);

// =================================================================================
// --- AUTH & RBAC COMPONENTS ---
// =================================================================================

const AuthPage = ({ onAuthSuccess, db, auth, appId }) => {
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
            // If super admin doesn't exist, create it
            const cred = await createUserWithEmailAndPassword(auth, email, password);
            const adminData = { email, role: 'admin', status: 'approved', name: 'Super Admin', createdAt: serverTimestamp() };
            await setDoc(doc(db, `artifacts/${appId}/all_users`, cred.user.uid), adminData);
            await setDoc(doc(db, `artifacts/${appId}/users/${cred.user.uid}/profile`, 'data'), adminData);
          }
        } else {
          await signInWithEmailAndPassword(auth, email, password);
        }
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const status = role === 'patient' ? 'approved' : 'pending';
        const userData = { email, role, status, name, age: '', gender: '', createdAt: serverTimestamp() };
        
        // Save to TWO places as required
        await setDoc(doc(db, `artifacts/${appId}/all_users`, cred.user.uid), userData);
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
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-blue-100">
        <div className="flex justify-center mb-6"><Logo /></div>
        <h2 className="text-2xl font-bold text-center text-blue-900 mb-6">{isLogin ? 'Sign In to HMIS' : 'Create Account'}</h2>
        
        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">{error}</div>}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700">Full Name</label>
                <input required type="text" value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full p-3 border border-gray-300 rounded-xl focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Select Role</label>
                <select value={role} onChange={e => setRole(e.target.value)} className="mt-1 w-full p-3 border border-gray-300 rounded-xl focus:ring-blue-500 bg-white">
                  <option value="patient">Patient (Auto-Approve)</option>
                  <option value="doctor">Doctor (Requires Admin Approval)</option>
                  <option value="attender">Attender (Requires Admin Approval)</option>
                </select>
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1 w-full p-3 border border-gray-300 rounded-xl focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <input required type="password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1 w-full p-3 border border-gray-300 rounded-xl focus:ring-blue-500" />
          </div>
          <button disabled={loading} type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition disabled:opacity-50">
            {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Sign Up')}
          </button>
        </form>
        <div className="mt-6 text-center text-sm">
          <button onClick={() => setIsLogin(!isLogin)} className="text-blue-600 hover:underline">
            {isLogin ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
};

const PendingStatePage = ({ onLogout }) => (
  <div className="h-full flex items-center justify-center p-4">
    <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md text-center border border-yellow-200">
      <Icon name="alertTriangle" size={48} className="mx-auto text-yellow-500 mb-4" />
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Wait for confirmation</h2>
      <p className="text-gray-600 mb-6">Your staff account is currently pending approval by an administrator. This page will automatically refresh once you are approved.</p>
      <button onClick={onLogout} className="text-blue-600 font-medium hover:underline">Sign out and return later</button>
    </div>
  </div>
);

// =================================================================================
// --- DASHBOARDS & WORKFLOW PAGES ---
// =================================================================================

const ProfilePage = ({ db, auth, userId, appId, userProfile }) => {
  const [name, setName] = useState(userProfile?.name || '');
  const [phone, setPhone] = useState(userProfile?.phone || '');
  const [age, setAge] = useState(userProfile?.age || '');
  const [gender, setGender] = useState(userProfile?.gender || '');
  const [statusMsg, setStatusMsg] = useState('');

  const handleUpdate = async (e) => {
    e.preventDefault();
    setStatusMsg('Updating...');
    try {
      const updates = { name, phone, age, gender };
      await updateDoc(doc(db, `artifacts/${appId}/all_users`, userId), updates);
      await updateDoc(doc(db, `artifacts/${appId}/users/${userId}/profile`, 'data'), updates);
      setStatusMsg('Profile updated successfully!');
      setTimeout(() => setStatusMsg(''), 3000);
    } catch (err) {
      setStatusMsg(`Error: ${err.message}`);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-8">
      <div className="bg-white shadow-lg rounded-2xl p-6 border border-gray-100">
        <h2 className="text-2xl font-bold text-blue-900 mb-6 flex items-center"><Icon name="user" className="mr-2" /> My Profile</h2>
        {statusMsg && <div className="mb-4 p-3 bg-blue-50 text-blue-700 rounded-lg text-sm">{statusMsg}</div>}
        <form onSubmit={handleUpdate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Role</label>
              <input disabled type="text" value={userProfile?.role.toUpperCase()} className="mt-1 w-full p-3 bg-gray-100 border border-gray-300 rounded-xl" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input disabled type="text" value={userProfile?.email} className="mt-1 w-full p-3 bg-gray-100 border border-gray-300 rounded-xl" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Full Name</label>
              <input type="text" value={name} onChange={e=>setName(e.target.value)} className="mt-1 w-full p-3 border border-gray-300 rounded-xl focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Phone</label>
              <input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} className="mt-1 w-full p-3 border border-gray-300 rounded-xl focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Age</label>
              <input type="number" value={age} onChange={e=>setAge(e.target.value)} className="mt-1 w-full p-3 border border-gray-300 rounded-xl focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Gender</label>
              <select value={gender} onChange={e=>setGender(e.target.value)} className="mt-1 w-full p-3 border border-gray-300 rounded-xl focus:ring-blue-500 bg-white">
                <option value="">Select...</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
          <button type="submit" className="mt-4 bg-blue-600 text-white font-bold py-2 px-6 rounded-xl hover:bg-blue-700 transition">Save Profile</button>
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
    const q = query(collection(db, `artifacts/${appId}/appointments`));
    const unsub = onSnapshot(q, (snap) => {
      // Client side filter
      const apps = snap.docs.map(d => ({id: d.id, ...d.data()})).filter(a => a.patientId === userId).sort((a,b) => b.timestamp - a.timestamp);
      setAppointments(apps);
    });
    return () => unsub();
  }, [db, appId, userId]);

  const handleRequest = async (e) => {
    e.preventDefault();
    if (!reason.trim()) return;
    const ref = doc(collection(db, `artifacts/${appId}/appointments`));
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

  const statusColors = { requested: 'bg-yellow-100 text-yellow-800', scheduled: 'bg-blue-100 text-blue-800', ready: 'bg-purple-100 text-purple-800', completed: 'bg-green-100 text-green-800' };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8 space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
        <h2 className="text-xl font-bold text-blue-900 mb-4">Request Consultation</h2>
        <form onSubmit={handleRequest} className="space-y-3">
          <textarea required value={reason} onChange={e=>setReason(e.target.value)} placeholder="Explain your reason for visit / symptoms..." className="w-full p-3 border border-gray-300 rounded-xl focus:ring-blue-500 h-24" />
          <button type="submit" className="bg-blue-600 text-white font-bold py-2 px-6 rounded-xl hover:bg-blue-700 transition">Request Consult</button>
        </form>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
        <h2 className="text-xl font-bold text-blue-900 mb-4">My Appointments History</h2>
        <div className="space-y-4">
          {appointments.length === 0 ? <p className="text-gray-500 text-sm">No appointments found.</p> : appointments.map(app => (
            <div key={app.id} className="p-4 border border-gray-100 rounded-xl bg-gray-50 flex flex-col sm:flex-row justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-bold px-2 py-1 rounded-md uppercase ${statusColors[app.status]}`}>{app.status}</span>
                  <span className="text-xs text-gray-500">{new Date(app.timestamp).toLocaleString()}</span>
                </div>
                <p className="text-sm font-medium text-gray-800">Reason: {app.reason}</p>
                {app.status === 'scheduled' && <p className="text-sm text-blue-600 mt-1">Scheduled for: {app.scheduledDate} at {app.scheduledTime} with Dr. {app.doctorName}</p>}
                {app.status === 'completed' && (
                  <div className="mt-3 p-3 bg-white border border-green-100 rounded-lg">
                    <p className="text-xs font-bold text-green-800 mb-1">Doctor's Notes & Prescription:</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{app.clinicalNotes}</p>
                  </div>
                )}
              </div>
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
    const unsubApps = onSnapshot(collection(db, `artifacts/${appId}/appointments`), snap => {
      setAppointments(snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => a.timestamp - b.timestamp));
    });
    const unsubDocs = onSnapshot(collection(db, `artifacts/${appId}/all_users`), snap => {
      setDoctors(snap.docs.map(d => ({id: d.id, ...d.data()})).filter(u => u.role === 'doctor' && u.status === 'approved'));
    });
    return () => { unsubApps(); unsubDocs(); };
  }, [db, appId]);

  const handleSchedule = async (e) => {
    e.preventDefault();
    const docInfo = doctors.find(d => d.id === e.target.doctorId.value);
    await updateDoc(doc(db, `artifacts/${appId}/appointments`, scheduleModal.id), {
      status: 'scheduled', doctorId: docInfo.id, doctorName: docInfo.name,
      scheduledDate: e.target.date.value, scheduledTime: e.target.time.value
    });
    setScheduleModal(null);
  };

  const handleVitals = async (e) => {
    e.preventDefault();
    await updateDoc(doc(db, `artifacts/${appId}/appointments`, vitalsModal.id), {
      status: 'ready',
      vitals: { bp: e.target.bp.value, hr: e.target.hr.value, glucose: e.target.glucose.value }
    });
    setVitalsModal(null);
  };

  const requestedQueue = appointments.filter(a => a.status === 'requested');
  const scheduledQueue = appointments.filter(a => a.status === 'scheduled');

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-8 space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-blue-900 mb-4">Triage Queue (Requested)</h2>
        <div className="bg-white shadow-sm border border-gray-200 rounded-2xl overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50"><tr><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Patient</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th><th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th></tr></thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {requestedQueue.map(app => (
                <tr key={app.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{app.patientName} <span className="text-gray-500 text-xs">({app.patientAge}y)</span></td>
                  <td className="px-6 py-4 text-sm text-gray-500">{app.reason}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button onClick={() => setScheduleModal(app)} className="text-blue-600 hover:text-blue-900 bg-blue-50 px-3 py-1 rounded-lg">Schedule</button>
                  </td>
                </tr>
              ))}
              {requestedQueue.length === 0 && <tr><td colSpan="3" className="px-6 py-4 text-center text-sm text-gray-500">Queue is empty</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-blue-900 mb-4">Arrival Queue (Scheduled)</h2>
        <div className="bg-white shadow-sm border border-gray-200 rounded-2xl overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50"><tr><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Patient</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time/Doc</th><th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th></tr></thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {scheduledQueue.map(app => (
                <tr key={app.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{app.patientName}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{app.scheduledDate} {app.scheduledTime} | Dr. {app.doctorName}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button onClick={() => setVitalsModal(app)} className="text-purple-600 hover:text-purple-900 bg-purple-50 px-3 py-1 rounded-lg">Record Vitals</button>
                  </td>
                </tr>
              ))}
              {scheduledQueue.length === 0 && <tr><td colSpan="3" className="px-6 py-4 text-center text-sm text-gray-500">Queue is empty</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {scheduleModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold mb-4">Schedule: {scheduleModal.patientName}</h3>
            <form onSubmit={handleSchedule} className="space-y-4">
              <div><label className="block text-sm">Date</label><input required name="date" type="date" className="mt-1 w-full p-2 border rounded" /></div>
              <div><label className="block text-sm">Time</label><input required name="time" type="time" className="mt-1 w-full p-2 border rounded" /></div>
              <div><label className="block text-sm">Assign Doctor</label>
                <select required name="doctorId" className="mt-1 w-full p-2 border rounded bg-white">
                  {doctors.map(d => <option key={d.id} value={d.id}>Dr. {d.name}</option>)}
                </select>
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={()=>setScheduleModal(null)} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Confirm</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {vitalsModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold mb-4">Record Vitals: {vitalsModal.patientName}</h3>
            <form onSubmit={handleVitals} className="space-y-4">
              <div><label className="block text-sm">Blood Pressure (mmHg)</label><input required name="bp" placeholder="120/80" className="mt-1 w-full p-2 border rounded" /></div>
              <div><label className="block text-sm">Heart Rate (bpm)</label><input required name="hr" type="number" placeholder="72" className="mt-1 w-full p-2 border rounded" /></div>
              <div><label className="block text-sm">Glucose (mg/dL)</label><input required name="glucose" type="number" placeholder="90" className="mt-1 w-full p-2 border rounded" /></div>
              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={()=>setVitalsModal(null)} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-purple-600 text-white rounded">Mark Ready</button>
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
    const unsubApps = onSnapshot(collection(db, `artifacts/${appId}/appointments`), snap => {
      const all = snap.docs.map(d => ({id: d.id, ...d.data()})).filter(a => a.doctorId === userId);
      setAppointments(all.sort((a,b) => b.timestamp - a.timestamp));
    });
    return () => unsubApps();
  }, [db, appId, userId]);

  const handleComplete = async (e) => {
    e.preventDefault();
    await updateDoc(doc(db, `artifacts/${appId}/appointments`, consultModal.id), {
      status: 'completed',
      clinicalNotes: e.target.notes.value
    });
    setConsultModal(null);
  };

  const displayApps = appointments.filter(a => mode === 'active' ? a.status === 'ready' : a.status === 'completed');

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-8 space-y-6">
      <h2 className="text-2xl font-bold text-blue-900">{mode === 'active' ? 'Patients Ready for Consult' : 'Consultation History'}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {displayApps.map(app => (
          <div key={app.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-lg font-bold text-gray-900">{app.patientName} <span className="text-sm font-normal text-gray-500">({app.patientAge}y)</span></h3>
              <span className={`text-xs px-2 py-1 rounded ${mode==='active'?'bg-purple-100 text-purple-800':'bg-green-100 text-green-800'}`}>{app.status.toUpperCase()}</span>
            </div>
            <p className="text-sm text-gray-600 mb-3"><strong>Reason:</strong> {app.reason}</p>
            {app.vitals && (
              <div className="bg-gray-50 p-3 rounded-lg flex space-x-4 text-sm mb-4">
                <span><strong>BP:</strong> {app.vitals.bp}</span>
                <span><strong>HR:</strong> {app.vitals.hr}</span>
                <span><strong>Gluc:</strong> {app.vitals.glucose}</span>
              </div>
            )}
            {mode === 'active' ? (
               <button onClick={()=>setConsultModal(app)} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-xl transition">Start Consult</button>
            ) : (
               <div className="text-sm bg-blue-50 text-blue-900 p-3 rounded-lg"><p className="font-bold">Notes:</p>{app.clinicalNotes}</div>
            )}
          </div>
        ))}
        {displayApps.length === 0 && <p className="text-gray-500">No patients found.</p>}
      </div>

      {consultModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl flex flex-col h-[80vh]">
            <h3 className="text-xl font-bold mb-4">Consultation: {consultModal.patientName}</h3>
            <div className="bg-gray-50 p-4 rounded-lg mb-4 text-sm flex-shrink-0">
              <p><strong>Reason:</strong> {consultModal.reason}</p>
              <div className="flex space-x-4 mt-2">
                <span><strong>BP:</strong> {consultModal.vitals?.bp}</span>
                <span><strong>HR:</strong> {consultModal.vitals?.hr}</span>
                <span><strong>Gluc:</strong> {consultModal.vitals?.glucose}</span>
              </div>
            </div>
            <form onSubmit={handleComplete} className="flex-grow flex flex-col">
              <label className="block text-sm font-bold mb-1">Clinical Notes & Prescriptions</label>
              <textarea required name="notes" className="flex-grow w-full p-3 border rounded-xl resize-none focus:ring-blue-500 mb-4" placeholder="Enter findings and prescribed medications..." />
              <div className="flex justify-end space-x-2 flex-shrink-0">
                <button type="button" onClick={()=>setConsultModal(null)} className="px-6 py-2 bg-gray-200 rounded-xl font-bold">Cancel</button>
                <button type="submit" className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition">Complete Consult</button>
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
  const [activeTab, setActiveTab] = useState('stats'); // stats, approvals, directory, logs

  useEffect(() => {
    if (!db || !appId) return;
    const unsubUsers = onSnapshot(collection(db, `artifacts/${appId}/all_users`), snap => setUsers(snap.docs.map(d=>({id:d.id, ...d.data()}))));
    const unsubApps = onSnapshot(collection(db, `artifacts/${appId}/appointments`), snap => setAppointments(snap.docs.map(d=>({id:d.id, ...d.data()}))));
    return () => { unsubUsers(); unsubApps(); };
  }, [db, appId]);

  const handleApprove = async (uid) => {
    await updateDoc(doc(db, `artifacts/${appId}/all_users`, uid), { status: 'approved' });
    await updateDoc(doc(db, `artifacts/${appId}/users/${uid}/profile`, 'data'), { status: 'approved' });
  };

  const pendingUsers = users.filter(u => u.status === 'pending');
  const sortedApps = [...appointments].sort((a,b) => b.timestamp - a.timestamp);

  const tabs = [
    { id: 'stats', label: 'Dashboard Stats' },
    { id: 'approvals', label: `Approvals (${pendingUsers.length})` },
    { id: 'directory', label: 'User Directory' },
    { id: 'logs', label: 'System Logs' },
  ];

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-8 flex flex-col h-full">
      <h2 className="text-3xl font-extrabold text-blue-900 mb-6 flex-shrink-0">Admin Control Center</h2>
      
      <div className="flex space-x-2 border-b border-gray-200 mb-6 flex-shrink-0 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={()=>setActiveTab(t.id)} className={`px-4 py-2 font-medium whitespace-nowrap border-b-2 transition ${activeTab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-grow overflow-y-auto pr-2 pb-8">
        {activeTab === 'stats' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-blue-100 text-center"><p className="text-gray-500 text-sm">Total Users</p><p className="text-3xl font-bold text-blue-600">{users.length}</p></div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-green-100 text-center"><p className="text-gray-500 text-sm">Active Doctors</p><p className="text-3xl font-bold text-green-600">{users.filter(u=>u.role==='doctor' && u.status==='approved').length}</p></div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-purple-100 text-center"><p className="text-gray-500 text-sm">Total Consults</p><p className="text-3xl font-bold text-purple-600">{appointments.length}</p></div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-yellow-100 text-center"><p className="text-gray-500 text-sm">Pending Staff</p><p className="text-3xl font-bold text-yellow-600">{pendingUsers.length}</p></div>
          </div>
        )}

        {activeTab === 'approvals' && (
          <div className="bg-white shadow-sm border border-gray-200 rounded-2xl overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50"><tr><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th><th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th></tr></thead>
              <tbody className="divide-y divide-gray-200">
                {pendingUsers.map(u => (
                  <tr key={u.id}><td className="px-6 py-4 text-sm font-medium">{u.name}</td><td className="px-6 py-4 text-sm uppercase">{u.role}</td><td className="px-6 py-4 text-sm text-gray-500">{u.email}</td><td className="px-6 py-4 text-right"><button onClick={()=>handleApprove(u.id)} className="bg-green-500 text-white px-4 py-1 rounded-lg hover:bg-green-600 text-sm font-bold">Approve</button></td></tr>
                ))}
                {pendingUsers.length === 0 && <tr><td colSpan="4" className="px-6 py-4 text-center text-sm text-gray-500">No pending approvals.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'directory' && (
          <div className="bg-white shadow-sm border border-gray-200 rounded-2xl overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50"><tr><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name/Email</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Demographics</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th></tr></thead>
              <tbody className="divide-y divide-gray-200">
                {users.map(u => (
                  <tr key={u.id}><td className="px-6 py-4"><div className="text-sm font-medium">{u.name}</div><div className="text-xs text-gray-500">{u.email}</div></td><td className="px-6 py-4 text-sm uppercase">{u.role}</td><td className="px-6 py-4 text-sm">{u.age ? `${u.age}y` : 'N/A'}, {u.gender || 'N/A'}</td><td className="px-6 py-4 text-sm"><span className={`px-2 py-1 rounded text-xs ${u.status==='approved'?'bg-green-100 text-green-800':'bg-yellow-100 text-yellow-800'}`}>{u.status}</span></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="space-y-3">
            {sortedApps.map(app => (
              <div key={app.id} className="bg-white p-3 border border-gray-200 rounded-lg shadow-sm text-sm flex flex-col sm:flex-row justify-between">
                <div><span className="font-bold text-gray-700">{new Date(app.timestamp).toLocaleString()}:</span> Patient <span className="font-semibold">{app.patientName}</span> requested consult.</div>
                <div className="font-medium text-blue-600 uppercase">[{app.status}]</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};


// =================================================================================
// --- EXISTING PAGES (Adapted to RBAC & Flex Flow) ---
// =================================================================================

const HomePage = ({ onNavigate }) => (
  <div className="h-full flex flex-col items-center justify-center relative bg-gradient-to-r from-blue-500 to-cyan-500 p-4 sm:p-8">
    <div className="z-10 text-center text-white p-4 max-w-4xl">
      <h1 className="text-4xl md:text-6xl font-extrabold mb-4 drop-shadow-lg tracking-tight animate-[fadeInUp_0.6s_ease-out_forwards]">Welcome to Vaidya Mithra HMIS</h1>
      <p className="text-lg md:text-xl mb-8 font-light drop-shadow-md animate-[fadeInUp_0.8s_ease-out_forwards]">Comprehensive enterprise health management & AI insights.</p>
      <a href="#" onClick={(e) => { e.preventDefault(); onNavigate('appointments'); }} className="inline-flex items-center px-8 py-3 bg-green-500 text-white text-lg font-semibold rounded-full shadow-xl hover:bg-green-600 transition transform hover:scale-105 animate-[fadeInUp_1s_ease-out_forwards]">
        My Appointments <Icon name="chevronRight" size={24} className="ml-2" color="white" />
      </a>
    </div>
  </div>
);

const HospitalPage = () => {
  const [status, setStatus] = useState('ready');

  const findHospitals = () => {
    if (!navigator.geolocation) return setStatus('error');
    setStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => { setStatus('found'); window.open(`https://www.google.com/maps/search/?api=1&query=hospitals+near+$${pos.coords.latitude},${pos.coords.longitude}`, '_blank'); },
      () => setStatus('error'),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  return (
    <div className="h-full flex items-center justify-center p-4">
      <div className="bg-white/80 backdrop-blur-lg shadow-2xl rounded-2xl p-6 sm:p-8 border border-gray-200 max-w-2xl w-full">
        <h2 className="text-3xl font-extrabold text-blue-800 mb-6 flex items-center"><Icon name="hospital" size={30} className="mr-3 text-blue-500" /> Nearby Facilities</h2>
        <button onClick={findHospitals} disabled={status === 'loading'} className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded-xl transition disabled:opacity-50 flex items-center justify-center">
          {status === 'loading' ? 'Locating...' : 'Find Hospitals Now'}
        </button>
      </div>
    </div>
  );
};

const DocBotPage = ({ db, userId, authReady, appId }) => {
  const [chatHistory, setChatHistory] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!authReady || !userId || !db || !appId) return;
    const q = query(collection(db, `artifacts/${appId}/users/${userId}/docbot_chat`), orderBy('timestamp', 'asc'), limit(50));
    return onSnapshot(q, snap => setChatHistory(snap.docs.map(d => ({...d.data(), id: d.id }))));
  }, [db, userId, authReady, appId]);

  useEffect(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), [chatHistory]);

  const handleSend = async (messageText) => {
    const message = (typeof messageText === 'string') ? messageText : currentMessage;
    if (!message.trim() || isTyping || !db || !userId || !appId) return;
    setCurrentMessage('');
    setIsTyping(true);

    const chatRef = collection(db, `artifacts/${appId}/users/${userId}/docbot_chat`);
    await setDoc(doc(chatRef), { text: message.trim(), role: 'user', timestamp: serverTimestamp() });

    try {
      const apiHistory = chatHistory.map(msg => ({ role: msg.role === 'ai' ? 'model' : 'user', parts: [{ text: msg.text }] }));
      apiHistory.push({ role: 'user', parts: [{ text: message.trim() }] });
      const payload = { contents: apiHistory, systemInstruction: { parts: [{ text: "You are DocBot..." }] } };
      const res = await fetch(GEMINI_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await res.json();
      const aiText = result.candidates?.[0]?.content?.parts?.[0]?.text || "Error processing request.";
      await setDoc(doc(chatRef), { text: aiText, role: 'ai', timestamp: serverTimestamp() });
    } catch (e) {
      await setDoc(doc(chatRef), { text: "Error connecting to AI.", role: 'ai_error', timestamp: serverTimestamp() });
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="h-full p-4 sm:p-8 flex flex-col">
      <div className="bg-white/80 backdrop-blur-lg shadow-xl rounded-2xl p-4 sm:p-8 border border-gray-200 flex flex-col flex-grow h-full overflow-hidden">
        <h2 className="text-3xl font-extrabold text-blue-800 mb-6 flex-shrink-0 flex items-center"><Icon name="messageSquare" size={30} className="mr-3 text-green-500" /> DocBot</h2>
        <div className="flex-grow overflow-y-auto p-4 mb-4 bg-gray-50 rounded-lg border border-gray-200 flex flex-col space-y-3">
          {chatHistory.length === 0 ? <p className="text-center text-gray-500 m-auto">Hello! Ask me any general health questions.</p> : chatHistory.map(msg => (
            <div key={msg.id} className={`max-w-xs sm:max-w-md p-3 rounded-xl shadow-md ${msg.role === 'user' ? 'bg-blue-500 text-white self-end rounded-br-none' : 'bg-white text-gray-800 self-start rounded-tl-none border'}`}>{msg.text}</div>
          ))}
          {isTyping && <div className="self-start p-3 bg-gray-200 rounded-xl rounded-tl-none animate-pulse w-16 h-8" />}
          <div ref={messagesEndRef} />
        </div>
        <div className="flex space-x-2 flex-shrink-0">
          <input type="text" value={currentMessage} onChange={e=>setCurrentMessage(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSend()} className="flex-grow p-3 border border-gray-300 rounded-xl" placeholder="Ask DocBot..." />
          <button onClick={()=>handleSend()} className="bg-blue-600 text-white px-4 rounded-xl"><Icon name="send" size={20} /></button>
        </div>
      </div>
    </div>
  );
};

const ContactPage = () => (
  <div className="h-full flex p-4 sm:p-6 items-center justify-center">
    <div className="bg-white/90 backdrop-blur-lg shadow-xl rounded-2xl p-8 border border-gray-200 max-w-4xl w-full text-center">
      <h2 className="text-3xl font-extrabold text-blue-800 mb-4 flex items-center justify-center"><Icon name="mail" size={30} className="mr-3 text-blue-500" /> HMIS Support</h2>
      <p className="text-gray-600 mb-8">System developed & maintained by:</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
        <div className="bg-gray-50 border p-5 rounded-xl"><p className="font-bold text-lg text-blue-800 mb-2">Dilip Kumar A N</p><p className="text-sm">7259447817<br/>dilipkumaran.ec23@rvce.edu.in</p></div>
        <div className="bg-gray-50 border p-5 rounded-xl"><p className="font-bold text-lg text-blue-800 mb-2">Arya B V</p><p className="text-sm">8050141198<br/>aryabv.ec23@rvce.edu.in</p></div>
      </div>
    </div>
  </div>
);

const PredictionPage = ({ db, userId, authReady, appId }) => {
  const [selectedSymptoms, setSelectedSymptoms] = useState([]);
  const [predictionResult, setPredictionResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState(SYMPTOM_CATEGORIES[0]);
  const [searchQuery, setSearchQuery] = useState('');

  const handlePrediction = async () => {
    if (!selectedSymptoms.length) return;
    setIsLoading(true); setPredictionResult(null);
    try {
      const prompt = `Symptoms: ${selectedSymptoms.join(', ')}. Return JSON format strictly.`;
      const res = await fetch(GEMINI_API_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", responseSchema: JSON_SCHEMA } })
      });
      const result = await res.json();
      setPredictionResult(JSON.parse(result.candidates[0].content.parts[0].text));
    } catch (e) {
      setPredictionResult({ error: "Failed to fetch." });
    } finally {
      setIsLoading(false);
    }
  };

  const filtered = (searchQuery ? SYMPTOM_CATEGORIES.flatMap(c=>ALL_SYMPTOMS_CATEGORIZED[c]) : ALL_SYMPTOMS_CATEGORIZED[activeCategory]).filter(s=>s.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-8 flex flex-col space-y-6">
      <h2 className="text-3xl font-extrabold text-blue-800">AI Triage Assessment</h2>
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-1/2 bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex flex-col max-h-[60vh]">
           <div className="flex space-x-2 overflow-x-auto pb-2 border-b flex-shrink-0">
             {SYMPTOM_CATEGORIES.map(c => <button key={c} onClick={()=>{setActiveCategory(c); setSearchQuery('');}} className={`px-4 py-1 rounded-full text-sm ${activeCategory===c ? 'bg-blue-600 text-white':'bg-gray-100'}`}>{c}</button>)}
           </div>
           <input placeholder="Search symptoms..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} className="mt-3 p-2 border rounded-xl w-full flex-shrink-0" />
           <div className="flex-grow overflow-y-auto mt-3 grid grid-cols-2 gap-2">
             {filtered.map(s => <button key={s} onClick={()=>setSelectedSymptoms(p=>p.includes(s)?p.filter(x=>x!==s):[...p, s])} className={`p-2 text-sm rounded border text-left ${selectedSymptoms.includes(s)?'bg-green-500 text-white':'bg-gray-50'}`}>{s}</button>)}
           </div>
        </div>
        <div className="lg:w-1/2 bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
          <h3 className="text-lg font-bold mb-3">Selected ({selectedSymptoms.length})</h3>
          <div className="flex flex-wrap gap-2 mb-6">{selectedSymptoms.map(s => <span key={s} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">{s}</span>)}</div>
          <button onClick={handlePrediction} disabled={!selectedSymptoms.length || isLoading} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl disabled:opacity-50">{isLoading ? 'Analyzing...' : 'Get Prediction'}</button>
          
          {predictionResult && !predictionResult.error && (
            <div className="mt-6 space-y-4">
               {predictionResult.predictions.map((p,i) => (
                 <div key={i} className="p-4 bg-green-50 border border-green-200 rounded-xl">
                   <div className="flex justify-between font-bold text-green-900 mb-1"><span>{p.disease}</span><span>{Math.round(p.confidence*100)}%</span></div>
                   <p className="text-sm text-gray-700">{p.description}</p>
                 </div>
               ))}
            </div>
          )}
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
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [appId, setAppId] = useState(null);
  const [currentPage, setCurrentPage] = useState('home');
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let isMounted = true;
    try {
      const configStr = env.VITE_FIREBASE_CONFIG || '{}';
      if (configStr === '{}') return;
      const firebaseConfig = JSON.parse(configStr);
      if (!firebaseConfig.apiKey || !firebaseConfig.appId) return;

      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const firebaseAuth = getAuth(app);
      
      if (isMounted) {
        setDb(firestore); setAuth(firebaseAuth); setAppId(firebaseConfig.appId);
      }

      onAuthStateChanged(firebaseAuth, (authUser) => {
        if (!isMounted) return;
        if (authUser) {
          setUser(authUser);
        } else {
          setUser(null); setUserProfile(null); setAuthReady(true);
        }
      });
    } catch (e) {
      console.error("Firebase Init Failed:", e);
      if (isMounted) setAuthReady(true);
    }
    return () => { isMounted = false; };
  }, []);

  // Listen to User Profile dynamically
  useEffect(() => {
    if (!user || !db || !appId) return;
    const unsub = onSnapshot(doc(db, `artifacts/${appId}/all_users`, user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const profileData = docSnap.data();
        setUserProfile(profileData);
        // Set default routing based on role
        if (!userProfile) {
           if (profileData.role === 'admin') setCurrentPage('admin-dashboard');
           else if (profileData.role === 'doctor') setCurrentPage('doctor-dashboard');
           else if (profileData.role === 'attender') setCurrentPage('attender-dashboard');
           else setCurrentPage('home');
        }
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, [user, db, appId]);

  // Listen to Patient Notifications
  useEffect(() => {
    if (!user || !db || !appId || userProfile?.role !== 'patient') return;
    const q = query(collection(db, `artifacts/${appId}/appointments`));
    const unsub = onSnapshot(q, (snap) => {
      const count = snap.docs.map(d=>d.data()).filter(a => a.patientId === user.uid && (a.status === 'scheduled' || a.status === 'ready' || a.status === 'completed')).length;
      // Basic implementation for notification ping
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

  if (!authReady) {
    return <div className="h-screen w-screen flex items-center justify-center bg-gray-50"><div className="animate-pulse flex flex-col items-center"><Icon name="stethoscope" size={48} className="text-blue-500 mb-4" /><p className="text-blue-900 font-bold">Initializing HMIS...</p></div></div>;
  }

  // Route Logic Check
  if (!user) {
    return <AuthPage onAuthSuccess={setUser} db={db} auth={auth} appId={appId} />;
  }

  if (userProfile && userProfile.status === 'pending') {
    return <PendingStatePage onLogout={handleLogout} />;
  }

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

  return (
    <div className="flex flex-col h-screen w-screen bg-gray-50 font-sans overflow-hidden">
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { transform: translateY(0); opacity: 1; } }
      `}</style>
      <NavBar currentPage={currentPage} onNavigate={setCurrentPage} userProfile={userProfile} onLogout={handleLogout} unreadCount={unreadCount} />
      <main className="flex-grow overflow-y-auto relative">
        {renderPage()}
      </main>
      <Footer />
    </div>
  );
};

export default App;
