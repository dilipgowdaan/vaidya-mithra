import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile,
} from "firebase/auth";
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  setLogLevel,
  updateDoc,
} from "firebase/firestore";

// Safe dynamic lookup to support both modern Vite configurations and older ES2015 target environments
const env = typeof dynamicImportMeta !== "undefined" 
  ? dynamicImportMeta 
  : (typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : (typeof process !== "undefined" && process.env ? process.env : {}));

const SUPER_ADMIN_EMAIL = "admin@gmail.com";
const SUPER_ADMIN_PASSWORD = "Admin@123";

const ROLE_LABELS = {
  patient: "Patient",
  doctor: "Doctor",
  attender: "Attender",
  admin: "Admin",
};

const STATUS_LABELS = {
  approved: "Approved",
  pending: "Pending",
  rejected: "Rejected",
};

const APPOINTMENT_STATUS = {
  requested: "Requested",
  scheduled: "Scheduled",
  ready: "Ready for Doctor",
  completed: "Completed",
};

const ALL_SYMPTOMS_CATEGORIZED = {
  General: [
    "Fatigue",
    "Fever",
    "Headache",
    "Dizziness",
    "Nausea",
    "Vomiting",
    "Body Ache",
    "Chills",
    "Sore Throat",
    "Diarrhea",
    "Constipation",
    "Runny Nose",
  ],
  Respiratory: [
    "Cough",
    "Shortness of Breath",
    "Wheezing",
    "Chest Tightness",
    "Difficulty Breathing",
    "Sputum Production",
    "Sneezing",
    "Hoarseness",
  ],
  Cardiac: [
    "Chest Pain",
    "Palpitations",
    "Fainting",
    "Swelling of Legs/Ankles",
    "Rapid Heartbeat",
    "Lightheadedness",
    "Pain Radiating to Jaw/Arm",
  ],
  Skin: [
    "Rash",
    "Itching",
    "Hives",
    "Dry Skin",
    "Jaundice",
    "Bruising",
    "Change in Mole appearance",
    "Redness/Inflammation",
  ],
  Musculoskeletal: [
    "Joint Pain",
    "Muscle Pain",
    "Back Pain",
    "Stiffness",
    "Swollen Joints",
    "Limited Range of Motion",
    "Numbness/Tingling",
  ],
};

const JSON_SCHEMA = {
  type: "OBJECT",
  properties: {
    emergency_flag: {
      type: "BOOLEAN",
      description:
        "True if symptoms indicate a severe, life-threatening emergency. False otherwise.",
    },
    predictions: {
      type: "ARRAY",
      description:
        "Top 3 most probable non-diagnostic condition suggestions based on symptoms, age, and gender.",
      items: {
        type: "OBJECT",
        properties: {
          disease: {
            type: "STRING",
            description: "Name of the potential condition.",
          },
          confidence: {
            type: "NUMBER",
            description: "A confidence score between 0.0 and 1.0.",
          },
          description: {
            type: "STRING",
            description:
              "Brief, clear, non-alarming explanation and suggested next steps.",
          },
        },
        required: ["disease", "confidence", "description"],
      },
    },
  },
  required: ["emergency_flag", "predictions"],
};

const GEMINI_MODEL =
  env.VITE_VAIDYA_MITHRA_GEMINI_MODEL ||
  "gemini-2.5-flash-preview-09-2025";

const getFirebaseConfig = () => {
  if (env.VITE_FIREBASE_CONFIG) {
    try {
      return JSON.parse(env.VITE_FIREBASE_CONFIG);
    } catch (error) {
      throw new Error("VITE_FIREBASE_CONFIG is not valid JSON.");
    }
  }

  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID || env.VITE_APP_ID,
  };
};

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const isSuperAdminCredentials = (email, password) =>
  normalizeEmail(email) === SUPER_ADMIN_EMAIL.toLowerCase() &&
  password === SUPER_ADMIN_PASSWORD;

const userProfileRef = (db, appId, userId) =>
  doc(db, "artifacts", appId, "users", userId, "profile", "data");

const allUserRef = (db, appId, userId) =>
  doc(db, "artifacts", appId, "all_users", userId);

const appointmentsCol = (db, appId) =>
  collection(db, "artifacts", appId, "appointments");

const notificationsCol = (db, appId, userId) =>
  collection(db, "artifacts", appId, "users", userId, "notifications");

const triageHistoryCol = (db, appId, userId) =>
  collection(db, "artifacts", appId, "users", userId, "triage_history");

const asMillis = (value) => {
  if (!value) return 0;
  if (typeof value === "string") return Number.isNaN(Date.parse(value)) ? 0 : Date.parse(value);
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return 0;
};

const formatDateTime = (value) => {
  const millis = asMillis(value);
  if (!millis) return "Not available";
  return new Date(millis).toLocaleString();
};

const getCreatedMillis = (item) =>
  asMillis(item.createdAt) || asMillis(item.createdAtClient) || asMillis(item.updatedAtClient);

const sortNewest = (items) =>
  [...items].sort((a, b) => getCreatedMillis(b) - getCreatedMillis(a));

const getStatusClass = (status) => {
  const classes = {
    requested: "bg-amber-100 text-amber-800 border-amber-200",
    scheduled: "bg-blue-100 text-blue-800 border-blue-200",
    ready: "bg-purple-100 text-purple-800 border-purple-200",
    completed: "bg-green-100 text-green-800 border-green-200",
    approved: "bg-green-100 text-green-800 border-green-200",
    pending: "bg-amber-100 text-amber-800 border-amber-200",
    rejected: "bg-red-100 text-red-800 border-red-200",
  };
  return classes[status] || "bg-gray-100 text-gray-700 border-gray-200";
};

const defaultPageForRole = (role) => {
  if (role === "admin") return "adminDashboard";
  if (role === "doctor") return "doctorDashboard";
  if (role === "attender") return "attenderDashboard";
  return "patientHome";
};

const getNavLinks = (role) => {
  if (role === "admin") {
    return [
      { id: "adminDashboard", label: "Dashboard", icon: "home" },
      { id: "approvals", label: "Approvals", icon: "checkCircle" },
      { id: "users", label: "Users", icon: "users" },
      { id: "systemLog", label: "System Log", icon: "history" },
      { id: "profile", label: "Profile", icon: "user" },
      { id: "support", label: "Support", icon: "mail" },
    ];
  }

  if (role === "doctor") {
    return [
      { id: "doctorDashboard", label: "Consults", icon: "stethoscope" },
      { id: "doctorHistory", label: "History", icon: "history" },
      { id: "profile", label: "Profile", icon: "user" },
      { id: "support", label: "Support", icon: "mail" },
    ];
  }

  if (role === "attender") {
    return [
      { id: "attenderDashboard", label: "Queue", icon: "clipboard" },
      { id: "profile", label: "Profile", icon: "user" },
      { id: "support", label: "Support", icon: "mail" },
    ];
  }

  return [
    { id: "patientHome", label: "Home", icon: "home" },
    { id: "triage", label: "AI Triage", icon: "activity" },
    { id: "docbot", label: "DocBot", icon: "messageSquare" },
    { id: "appointments", label: "Appointments", icon: "calendar" },
    { id: "hospitals", label: "Hospitals", icon: "hospital" },
    { id: "profile", label: "Profile", icon: "user" },
    { id: "support", label: "Support", icon: "mail" },
  ];
};

const isAllowedPage = (page, role) =>
  getNavLinks(role)
    .map((item) => item.id)
    .includes(page);

const isPermissionDenied = (error) =>
  error?.code === "permission-denied" ||
  String(error?.message || "").toLowerCase().includes("missing or insufficient permissions");

const warnOptionalFirestoreFailure = (label, error) => {
  if (isPermissionDenied(error)) {
    console.warn(`${label} skipped because Firestore rules denied access.`, error);
    return;
  }
  console.warn(`${label} failed.`, error);
};

const ensureGlobalProfile = async (db, appId, user, values) => {
  const uid = user.uid;
  const email = normalizeEmail(user.email);
  const now = new Date().toISOString();
  const payload = {
    uid,
    email,
    name: values.name || user.displayName || email.split("@")[0],
    phone: values.phone || "",
    age: values.age || "",
    gender: values.gender || "",
    role: values.role || "patient",
    status: values.status || "pending",
    updatedAt: serverTimestamp(),
    updatedAtClient: now,
    createdAt: serverTimestamp(),
    createdAtClient: now,
  };

  await setDoc(userProfileRef(db, appId, uid), payload, { merge: true });

  try {
    await setDoc(allUserRef(db, appId, uid), payload, { merge: true });
  } catch (error) {
    warnOptionalFirestoreFailure("Global user directory mirror", error);
  }

  return payload;
};

const updateProfileDocuments = async (db, appId, uid, values) => {
  const payload = {
    ...values,
    updatedAt: serverTimestamp(),
    updatedAtClient: new Date().toISOString(),
  };
  await setDoc(userProfileRef(db, appId, uid), payload, { merge: true });

  try {
    await setDoc(allUserRef(db, appId, uid), payload, { merge: true });
  } catch (error) {
    warnOptionalFirestoreFailure("Global user directory mirror update", error);
  }
};

const writeNotification = async (db, appId, userId, payload) => {
  if (!db || !appId || !userId) return;
  try {
    await addDoc(notificationsCol(db, appId, userId), {
      title: payload.title,
      message: payload.message,
      appointmentId: payload.appointmentId || "",
      read: false,
      createdAt: serverTimestamp(),
      createdAtClient: new Date().toISOString(),
    });
  } catch (error) {
    warnOptionalFirestoreFailure("Patient notification", error);
  }
};

const appointmentEvent = (status, actor, label) => ({
  status,
  label,
  actorId: actor?.uid || actor?.id || "",
  actorName: actor?.name || actor?.email || "System",
  at: new Date().toISOString(),
});

const callGemini = async ({ prompt, schema }) => {
  const apiKey = env.VITE_VAIDYA_MITHRA_GEMINI_KEY || env.VITE_GEMINI_API_KEY || "";

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: schema
          ? {
              responseMimeType: "application/json",
              responseSchema: schema,
              temperature: 0.2,
            }
          : {
              temperature: 0.4,
              maxOutputTokens: 700,
            },
      }),
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "Gemini request failed.");
  }

  return (
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("\n")
      .trim() || ""
  );
};

const parseJsonResponse = (text) => {
  const cleaned = text
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(cleaned);
};

const useLiveCollection = (db, pathSegments, enabled = true) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState("");
  const key = pathSegments.filter(Boolean).join("/");

  useEffect(() => {
    if (!db || !enabled || pathSegments.some((segment) => !segment)) {
      setItems([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setError("");
    const unsubscribe = onSnapshot(
      collection(db, ...pathSegments),
      (snapshot) => {
        setItems(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        setLoading(false);
      },
      (snapshotError) => {
        setError(snapshotError.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [db, enabled, key]);

  return { items, loading, error };
};

const Icon = ({ name, size = 20, className = "" }) => {
  const props = {
    xmlns: "[http://www.w3.org/2000/svg](http://www.w3.org/2000/svg)",
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className,
  };

  const icons = {
    home: (
      <svg {...props}>
        <path d="m3 10 9-7 9 7" />
        <path d="M5 10v10h14V10" />
        <path d="M9 20v-6h6v6" />
      </svg>
    ),
    stethoscope: (
      <svg {...props}>
        <path d="M4 3v6a4 4 0 0 0 8 0V3" />
        <path d="M8 15a6 6 0 0 0 12 0v-3" />
        <circle cx="20" cy="10" r="2" />
        <path d="M4 3H2" />
        <path d="M12 3h2" />
      </svg>
    ),
    activity: (
      <svg {...props}>
        <path d="M22 12h-4l-3 8-6-16-3 8H2" />
      </svg>
    ),
    messageSquare: (
      <svg {...props}>
        <path d="M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
      </svg>
    ),
    hospital: (
      <svg {...props}>
        <path d="M12 6v8" />
        <path d="M8 10h8" />
        <path d="M4 22V4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v18" />
        <path d="M9 22v-5h6v5" />
      </svg>
    ),
    calendar: (
      <svg {...props}>
        <path d="M8 2v4" />
        <path d="M16 2v4" />
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M3 10h18" />
      </svg>
    ),
    users: (
      <svg {...props}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    user: (
      <svg {...props}>
        <circle cx="12" cy="8" r="4" />
        <path d="M20 21a8 8 0 0 0-16 0" />
      </svg>
    ),
    clipboard: (
      <svg {...props}>
        <path d="M16 4h2a2 2 0 0 1 2 2v16H4V6a2 2 0 0 1 2-2h2" />
        <rect x="8" y="2" width="8" height="4" rx="1" />
        <path d="M8 12h8" />
        <path d="M8 16h6" />
      </svg>
    ),
    checkCircle: (
      <svg {...props}>
        <circle cx="12" cy="12" r="10" />
        <path d="m9 12 2 2 4-5" />
      </svg>
    ),
    history: (
      <svg {...props}>
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v5h5" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
    bell: (
      <svg {...props}>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
    mail: (
      <svg {...props}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
    ),
    phone: (
      <svg {...props}>
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 3.08 5.18 2 2 0 0 1 5.06 3h3a2 2 0 0 1 2 1.72c.12.9.32 1.77.6 2.6a2 2 0 0 1-.45 2.11L9 10.7a16 16 0 0 0 5.3 5.3l1.27-1.21a2 2 0 0 1 2.11-.45c.83.28 1.7.48 2.6.6A2 2 0 0 1 22 16.92z" />
      </svg>
    ),
    logOut: (
      <svg {...props}>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="M16 17l5-5-5-5" />
        <path d="M21 12H9" />
      </svg>
    ),
    send: (
      <svg {...props}>
        <path d="m22 2-7 20-4-9-9-4z" />
        <path d="M22 2 11 13" />
      </svg>
    ),
    menu: (
      <svg {...props}>
        <path d="M3 6h18" />
        <path d="M3 12h18" />
        <path d="M3 18h18" />
      </svg>
    ),
    x: (
      <svg {...props}>
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </svg>
    ),
    alertTriangle: (
      <svg {...props}>
        <path d="m12 3 10 18H2z" />
        <path d="M12 9v5" />
        <path d="M12 18h.01" />
      </svg>
    ),
  };

  return icons[name] || icons.activity;
};

const Logo = () => (
  <div className="flex items-center gap-3">
    <div className="grid h-10 w-10 place-items-center rounded-lg bg-blue-700 text-white shadow-sm">
      <Icon name="stethoscope" size={22} />
    </div>
    <div className="leading-tight">
      <p className="text-lg font-bold text-blue-950">Vaidya Mithra</p>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">
        HMIS
      </p>
    </div>
  </div>
);

const Button = ({
  children,
  className = "",
  variant = "primary",
  size = "md",
  loading = false,
  ...props
}) => {
  const variants = {
    primary:
      "bg-blue-700 text-white hover:bg-blue-800 disabled:bg-blue-300 focus:ring-blue-300",
    secondary:
      "bg-white text-gray-800 border border-gray-300 hover:bg-gray-50 disabled:text-gray-400 focus:ring-gray-200",
    success:
      "bg-green-600 text-white hover:bg-green-700 disabled:bg-green-300 focus:ring-green-300",
    danger:
      "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300 focus:ring-red-300",
    ghost:
      "bg-transparent text-gray-700 hover:bg-gray-100 disabled:text-gray-400 focus:ring-gray-200",
  };
  const sizes = {
    sm: "px-3 py-2 text-xs",
    md: "px-4 py-2.5 text-sm",
    lg: "px-5 py-3 text-base",
    icon: "h-10 w-10 p-0",
  };

  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold shadow-sm outline-none transition focus:ring-4 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : null}
      {children}
    </button>
  );
};

const Field = ({ label, children }) => (
  <label className="block">
    <span className="mb-1 block text-sm font-semibold text-gray-700">{label}</span>
    {children}
  </label>
);

const Input = (props) => (
  <input
    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
    {...props}
  />
);

const Select = (props) => (
  <select
    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
    {...props}
  />
);

const TextArea = (props) => (
  <textarea
    className="min-h-[120px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
    {...props}
  />
);

const Badge = ({ children, status, className = "" }) => (
  <span
    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusClass(
      status
    )} ${className}`}
  >
    {children}
  </span>
);

const Card = ({ children, className = "" }) => (
  <section
    className={`rounded-lg border border-gray-200 bg-white p-5 shadow-sm ${className}`}
  >
    {children}
  </section>
);

const Page = ({ title, subtitle, actions, children }) => (
  <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-gray-950">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-gray-600">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
    {children}
  </div>
);

const EmptyState = ({ title, body }) => (
  <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
    <p className="font-semibold text-gray-800">{title}</p>
    {body ? <p className="mt-1 text-sm text-gray-500">{body}</p> : null}
  </div>
);

const StatCard = ({ label, value, icon, tone = "blue" }) => {
  const tones = {
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    green: "bg-green-50 text-green-700 border-green-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    purple: "bg-purple-50 text-purple-700 border-purple-100",
    gray: "bg-gray-50 text-gray-700 border-gray-100",
  };
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={`grid h-11 w-11 place-items-center rounded-lg border ${tones[tone]}`}>
          <Icon name={icon} size={21} />
        </div>
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-950">{value}</p>
        </div>
      </div>
    </Card>
  );
};

const NavBar = ({
  profile,
  currentPage,
  onNavigate,
  onLogout,
  notifications,
  onMarkNotificationsRead,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const links = getNavLinks(profile.role);
  const unread = notifications.filter((item) => !item.read).length;
  const latestNotifications = sortNewest(notifications).slice(0, 6);

  const navigate = (page) => {
    onNavigate(page);
    setMenuOpen(false);
  };

  return (
    <nav className="z-20 flex-shrink-0 border-b border-gray-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <button type="button" onClick={() => navigate(defaultPageForRole(profile.role))}>
          <Logo />
        </button>

        <div className="hidden items-center gap-1 md:flex">
          {links.map((link) => {
            const active = currentPage === link.id;
            return (
              <button
                key={link.id}
                type="button"
                onClick={() => navigate(link.id)}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  active
                    ? "bg-blue-100 text-blue-800"
                    : "text-gray-700 hover:bg-gray-100 hover:text-blue-700"
                }`}
              >
                <Icon name={link.icon} size={17} />
                {link.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {profile.role === "patient" ? (
            <div className="relative">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="relative"
                onClick={() => setNotificationOpen((value) => !value)}
                title="Notifications"
              >
                <Icon name="bell" size={20} />
                {unread > 0 ? (
                  <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
                    {unread}
                  </span>
                ) : null}
              </Button>

              {notificationOpen ? (
                <div className="absolute right-0 mt-2 w-80 rounded-lg border border-gray-200 bg-white p-3 shadow-xl">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-bold text-gray-900">Notifications</p>
                    <button
                      type="button"
                      onClick={onMarkNotificationsRead}
                      className="text-xs font-semibold text-blue-700 hover:text-blue-900"
                    >
                      Mark read
                    </button>
                  </div>
                  <div className="max-h-80 space-y-2 overflow-y-auto">
                    {latestNotifications.length === 0 ? (
                      <p className="py-5 text-center text-sm text-gray-500">
                        No updates yet.
                      </p>
                    ) : (
                      latestNotifications.map((item) => (
                        <div
                          key={item.id}
                          className={`rounded-lg border p-3 ${
                            item.read
                              ? "border-gray-200 bg-white"
                              : "border-blue-200 bg-blue-50"
                          }`}
                        >
                          <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                          <p className="mt-1 text-xs text-gray-600">{item.message}</p>
                          <p className="mt-2 text-[11px] text-gray-400">
                            {formatDateTime(item.createdAt || item.createdAtClient)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="hidden text-right lg:block">
            <p className="text-sm font-bold text-gray-900">{profile.name}</p>
            <p className="text-xs text-gray-500">{ROLE_LABELS[profile.role]}</p>
          </div>

          <Button type="button" size="icon" variant="ghost" onClick={onLogout} title="Sign out">
            <Icon name="logOut" size={20} />
          </Button>

          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="md:hidden"
            onClick={() => setMenuOpen((value) => !value)}
            title="Menu"
          >
            <Icon name={menuOpen ? "x" : "menu"} size={22} />
          </Button>
        </div>
      </div>

      {menuOpen ? (
        <div className="border-t border-gray-200 bg-white px-4 py-3 md:hidden">
          <div className="flex flex-col gap-2">
            {links.map((link) => (
              <button
                key={link.id}
                type="button"
                onClick={() => navigate(link.id)}
                className={`flex items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-semibold ${
                  currentPage === link.id
                    ? "bg-blue-100 text-blue-800"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <Icon name={link.icon} size={18} />
                {link.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </nav>
  );
};

const Footer = () => (
  <footer className="flex-shrink-0 border-t border-gray-200 bg-white px-4 py-3">
    <p className="mx-auto max-w-5xl text-center text-xs leading-relaxed text-gray-500">
      <strong>Disclaimer:</strong> Vaidya Mithra provides informational and
      educational support only. It is not a substitute for professional medical
      advice, diagnosis, or treatment. In an emergency, contact local emergency
      services immediately.
    </p>
  </footer>
);

const AuthPage = ({ firebaseError, onLogin, onSignup }) => {
  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    age: "",
    gender: "",
    role: "patient",
  });

  const update = (key, value) => setForm((state) => ({ ...state, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await onLogin(form.email, form.password);
      } else {
        await onSignup(form);
      }
    } catch (submitError) {
      setError(submitError.message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 px-4 py-8 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="mx-auto flex w-full max-w-4xl flex-col justify-center py-8">
        <Logo />
        <div className="mt-10 max-w-2xl">
          <Badge status="approved">Enterprise HMIS</Badge>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-gray-950 sm:text-5xl">
            Role-based care coordination for Vaidya Mithra.
          </h1>
          <p className="mt-5 text-base leading-7 text-gray-600">
            Patients can request consults, attenders can schedule and record
            vitals, doctors can complete consultations, and admins can approve
            staff and monitor the full system history.
          </p>
          <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
            <StatCard label="RBAC" value="4 roles" icon="users" tone="blue" />
            <StatCard label="Flow" value="Live" icon="activity" tone="green" />
            <StatCard label="Triage" value="AI" icon="stethoscope" tone="purple" />
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-md items-center">
        <Card className="w-full p-6">
          <div className="mb-6 flex rounded-lg bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-bold ${
                mode === "login" ? "bg-white text-blue-800 shadow-sm" : "text-gray-600"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-bold ${
                mode === "signup" ? "bg-white text-blue-800 shadow-sm" : "text-gray-600"
              }`}
            >
              Sign up
            </button>
          </div>

          <form className="space-y-4" onSubmit={submit}>
            {mode === "signup" ? (
              <Field label="Full name">
                <Input
                  required
                  value={form.name}
                  onChange={(event) => update("name", event.target.value)}
                  placeholder="Enter full name"
                />
              </Field>
            ) : null}

            <Field label="Email">
              <Input
                required
                type="email"
                value={form.email}
                onChange={(event) => update("email", event.target.value)}
                placeholder="you@example.com"
              />
            </Field>

            <Field label="Password">
              <Input
                required
                type="password"
                minLength={6}
                value={form.password}
                onChange={(event) => update("password", event.target.value)}
                placeholder="Minimum 6 characters"
              />
            </Field>

            {mode === "signup" ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Phone number">
                    <Input
                      value={form.phone}
                      onChange={(event) => update("phone", event.target.value)}
                      placeholder="+91..."
                    />
                  </Field>
                  <Field label="Age">
                    <Input
                      type="number"
                      min="0"
                      value={form.age}
                      onChange={(event) => update("age", event.target.value)}
                    />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Gender">
                    <Select
                      value={form.gender}
                      onChange={(event) => update("gender", event.target.value)}
                    >
                      <option value="">Select</option>
                      <option value="Female">Female</option>
                      <option value="Male">Male</option>
                      <option value="Non-binary">Non-binary</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                    </Select>
                  </Field>
                  <Field label="Role">
                    <Select
                      value={form.role}
                      onChange={(event) => update("role", event.target.value)}
                    >
                      <option value="patient">Patient</option>
                      <option value="doctor">Doctor</option>
                      <option value="attender">Attender</option>
                      <option value="admin">Admin</option>
                    </Select>
                  </Field>
                </div>
                <p className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                  Patients are auto-approved. Doctors, attenders, and additional
                  admins remain pending until an approved admin confirms them.
                </p>
              </>
            ) : (
              <p className="rounded-lg bg-blue-50 p-3 text-xs leading-5 text-blue-800">
                Super admin: use admin@gmail.com with Admin@123 to bootstrap the
                admin dashboard and create the admin profile automatically.
              </p>
            )}

            {firebaseError || error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {firebaseError || error}
              </div>
            ) : null}

            <Button type="submit" loading={loading} className="w-full">
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
};

const PendingApprovalPage = ({ profile }) => (
  <Page
    title="Wait for confirmation"
    subtitle="Your approval status is watched in real time. Once an admin approves you, the dashboard opens automatically."
  >
    <Card className="mx-auto max-w-2xl text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-amber-100 text-amber-700">
        <Icon name="history" size={28} />
      </div>
      <h2 className="mt-5 text-2xl font-bold text-gray-950">Your account is pending</h2>
      <p className="mt-3 text-sm leading-6 text-gray-600">
        Your {ROLE_LABELS[profile.role]} account is saved with status{" "}
        <strong>{STATUS_LABELS[profile.status] || profile.status}</strong>. An
        admin must approve it before you can access the dashboard. This screen
        listens to your profile in real time and will switch automatically after
        approval.
      </p>
      <div className="mt-6 rounded-lg bg-gray-50 p-4 text-left text-sm">
        <p>
          <strong>Name:</strong> {profile.name}
        </p>
        <p>
          <strong>Email:</strong> {profile.email}
        </p>
        <p>
          <strong>Role:</strong> {ROLE_LABELS[profile.role]}
        </p>
      </div>
    </Card>
  </Page>
);

const PatientHomePage = ({ profile, onNavigate }) => (
  <Page
    title={`Welcome, ${profile.name}`}
    subtitle="Your patient workspace for AI guidance, consult requests, appointment updates, and hospital contacts."
  >
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="bg-blue-700 text-white lg:col-span-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-100">
          Patient care hub
        </p>
        <h2 className="mt-3 text-3xl font-bold">Start with symptoms or request a consult.</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-50">
          AI triage gives non-diagnostic next steps. Appointments connect your
          reason for visit with attender scheduling and doctor consultation notes.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button type="button" variant="secondary" onClick={() => onNavigate("triage")}>
            <Icon name="activity" size={17} />
            Run AI triage
          </Button>
          <Button type="button" variant="success" onClick={() => onNavigate("appointments")}>
            <Icon name="calendar" size={17} />
            Request consult
          </Button>
        </div>
      </Card>

      <Card>
        <h3 className="text-lg font-bold text-gray-950">Emergency guidance</h3>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          Severe chest pain, breathing difficulty, stroke signs, fainting, or
          dangerous bleeding need immediate emergency care.
        </p>
        <Button type="button" variant="danger" className="mt-5" onClick={() => onNavigate("hospitals")}>
          <Icon name="hospital" size={17} />
          Find hospitals
        </Button>
      </Card>
    </div>
  </Page>
);

const TriagePage = ({ db, appId, profile }) => {
  const [selectedSymptoms, setSelectedSymptoms] = useState([]);
  const [customSymptom, setCustomSymptom] = useState("");
  const [age, setAge] = useState(profile.age || "");
  const [gender, setGender] = useState(profile.gender || "");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const historyPath = useMemo(
    () => ["artifacts", appId, "users", profile.uid, "triage_history"],
    [appId, profile.uid]
  );
  const { items: history } = useLiveCollection(db, historyPath, Boolean(db && appId && profile.uid));
  const recentHistory = sortNewest(history).slice(0, 5);

  const toggleSymptom = (symptom) => {
    setSelectedSymptoms((items) =>
      items.includes(symptom)
        ? items.filter((item) => item !== symptom)
        : [...items, symptom]
    );
  };

  const addCustomSymptom = () => {
    const next = customSymptom.trim();
    if (!next) return;
    if (!selectedSymptoms.includes(next)) {
      setSelectedSymptoms((items) => [...items, next]);
    }
    setCustomSymptom("");
  };

  const runPrediction = async () => {
    setError("");
    setResult(null);
    if (selectedSymptoms.length === 0) {
      setError("Please select or add at least one symptom.");
      return;
    }

    setLoading(true);
    try {
      const prompt = `
You are Vaidya Mithra, a careful non-diagnostic medical triage assistant.
Return ONLY JSON matching the provided schema.
Patient age: ${age || "not provided"}
Patient gender: ${gender || "not provided"}
Symptoms: ${selectedSymptoms.join(", ")}

Rules:
- Do not provide a diagnosis. Provide likely condition categories and next steps.
- emergency_flag must be true for severe chest pain, inability to breathe, stroke signs, fainting with danger signs, uncontrolled bleeding, or similar emergencies.
- Keep descriptions calm, short, and practical.
`;
      const text = await callGemini({ prompt, schema: JSON_SCHEMA });
      const parsed = parseJsonResponse(text);
      const normalized = {
        emergency_flag: Boolean(parsed.emergency_flag),
        predictions: Array.isArray(parsed.predictions)
          ? parsed.predictions.slice(0, 3).map((item) => ({
              disease: String(item.disease || "Possible condition"),
              confidence: Number(item.confidence || 0),
              description: String(item.description || "Consult a clinician."),
            }))
          : [],
      };
      setResult(normalized);

      await addDoc(triageHistoryCol(db, appId, profile.uid), {
        symptoms: selectedSymptoms,
        age: age || "",
        gender: gender || "",
        result: normalized,
        createdAt: serverTimestamp(),
        createdAtClient: new Date().toISOString(),
      });
    } catch (predictionError) {
      setError(predictionError.message || "Unable to generate AI assessment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page
      title="AI Triage"
      subtitle="Non-diagnostic symptom guidance with emergency flagging and patient-side history."
    >
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Age">
              <Input value={age} type="number" min="0" onChange={(event) => setAge(event.target.value)} />
            </Field>
            <Field label="Gender">
              <Select value={gender} onChange={(event) => setGender(event.target.value)}>
                <option value="">Select</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Non-binary">Non-binary</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </Select>
            </Field>
          </div>

          <div className="mt-6 space-y-5">
            {Object.entries(ALL_SYMPTOMS_CATEGORIZED).map(([category, symptoms]) => (
              <div key={category}>
                <h3 className="mb-2 text-sm font-bold text-gray-800">{category}</h3>
                <div className="flex flex-wrap gap-2">
                  {symptoms.map((symptom) => {
                    const active = selectedSymptoms.includes(symptom);
                    return (
                      <button
                        type="button"
                        key={symptom}
                        onClick={() => toggleSymptom(symptom)}
                        className={`rounded-full border px-3 py-2 text-sm font-semibold transition ${
                          active
                            ? "border-blue-700 bg-blue-700 text-white"
                            : "border-gray-300 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50"
                        }`}
                      >
                        {symptom}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex gap-2">
            <Input
              value={customSymptom}
              onChange={(event) => setCustomSymptom(event.target.value)}
              placeholder="Add another symptom"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addCustomSymptom();
                }
              }}
            />
            <Button type="button" variant="secondary" onClick={addCustomSymptom}>
              Add
            </Button>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {selectedSymptoms.map((symptom) => (
              <Badge key={symptom} status="scheduled">
                {symptom}
              </Badge>
            ))}
          </div>

          {error ? (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <Button type="button" className="mt-6" loading={loading} onClick={runPrediction}>
            <Icon name="activity" size={17} />
            Generate assessment
          </Button>
        </Card>

        <div className="space-y-6">
          <Card>
            <h3 className="text-lg font-bold text-gray-950">AI Assessment</h3>
            {loading ? (
              <div className="mt-4 space-y-3">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="h-24 animate-pulse rounded-lg bg-gray-100" />
                ))}
              </div>
            ) : result ? (
              <div className="mt-4 space-y-3">
                {result.emergency_flag ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
                    <div className="flex items-center gap-2 font-bold">
                      <Icon name="alertTriangle" size={18} />
                      Emergency symptoms detected
                    </div>
                    <p className="mt-2 text-sm">
                      Seek professional emergency care immediately. This tool cannot
                      provide life-saving assistance.
                    </p>
                  </div>
                ) : null}
                {result.predictions.map((item, index) => {
                  const confidence = Math.max(0, Math.min(100, Math.round(item.confidence * 100)));
                  return (
                    <div key={`${item.disease}-${index}`} className="rounded-lg border border-gray-200 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-bold text-gray-950">{item.disease}</p>
                        <span className="text-sm font-bold text-gray-600">{confidence}%</span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-gray-100">
                        <div
                          className="h-2 rounded-full bg-green-500"
                          style={{ width: `${confidence}%` }}
                        />
                      </div>
                      <p className="mt-3 text-sm leading-6 text-gray-600">{item.description}</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="No assessment yet"
                body="Select symptoms and generate an AI assessment."
              />
            )}
          </Card>

          <Card>
            <h3 className="mb-3 text-lg font-bold text-gray-950">Recent History</h3>
            <div className="space-y-3">
              {recentHistory.length === 0 ? (
                <p className="text-sm text-gray-500">No recent triage checks.</p>
              ) : (
                recentHistory.map((item) => (
                  <div key={item.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs font-semibold text-gray-500">
                      {formatDateTime(item.createdAt || item.createdAtClient)}
                    </p>
                    <p className="mt-1 truncate text-sm text-gray-700">
                      {item.symptoms?.join(", ")}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-green-700">
                      Top: {item.result?.predictions?.[0]?.disease || "N/A"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
};

const DocBotPage = ({ profile }) => {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Hello. I can explain health terms, help prepare questions for your doctor, and suggest safe next steps. I cannot diagnose or replace medical care.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const send = async (event) => {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;

    const nextMessages = [...messages, { role: "user", text }];
    setMessages(nextMessages);
    setInput("");
    setError("");
    setLoading(true);

    try {
      const prompt = `
You are DocBot in Vaidya Mithra HMIS. Be clear, warm, concise, and safety-focused.
Never diagnose. Tell the user to seek emergency care for severe symptoms.
Patient profile: age ${profile.age || "unknown"}, gender ${profile.gender || "unknown"}.

Conversation:
${nextMessages.map((item) => `${item.role}: ${item.text}`).join("\n")}

Reply as the assistant in 120 words or fewer.
`;
      const reply = await callGemini({ prompt });
      setMessages((items) => [...items, { role: "assistant", text: reply || "Please consult a clinician for personalized guidance." }]);
    } catch (botError) {
      setError(botError.message || "DocBot could not respond.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page title="DocBot" subtitle="A safety-focused health information chat for patients.">
      <Card className="mx-auto flex h-[calc(100vh-15rem)] max-w-4xl flex-col p-0">
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-3 text-sm leading-6 ${
                  message.role === "user"
                    ? "bg-blue-700 text-white"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                {message.text}
              </div>
            </div>
          ))}
          {loading ? (
            <div className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-600">
              <span className="h-2 w-2 animate-pulse rounded-full bg-blue-600" />
              DocBot is typing
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="border-t border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <form className="flex gap-2 border-t border-gray-200 p-4" onSubmit={send}>
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask DocBot..."
          />
          <Button type="submit" loading={loading}>
            <Icon name="send" size={17} />
            Send
          </Button>
        </form>
      </Card>
    </Page>
  );
};

const PatientAppointmentsPage = ({ db, appId, profile }) => {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { items: appointments } = useLiveCollection(
    db,
    ["artifacts", appId, "appointments"],
    Boolean(db && appId)
  );
  const patientAppointments = useMemo(
    () => sortNewest(appointments.filter((item) => item.patientId === profile.uid)),
    [appointments, profile.uid]
  );

  const requestConsult = async (event) => {
    event.preventDefault();
    const cleanReason = reason.trim();
    if (!cleanReason) {
      setError("Please describe the reason for visit.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await addDoc(appointmentsCol(db, appId), {
        patientId: profile.uid,
        patientName: profile.name,
        patientEmail: profile.email,
        reason: cleanReason,
        status: "requested",
        createdAt: serverTimestamp(),
        createdAtClient: new Date().toISOString(),
        updatedAt: serverTimestamp(),
        updatedAtClient: new Date().toISOString(),
        statusEvents: [appointmentEvent("requested", profile, "Patient requested consult")],
      });
      setReason("");
    } catch (requestError) {
      setError(requestError.message || "Could not request consult.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page
      title="Appointments"
      subtitle="Request a consult and track scheduled, ready, and completed visits with doctor notes."
    >
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <h2 className="text-lg font-bold text-gray-950">Request Consult</h2>
          <form className="mt-4 space-y-4" onSubmit={requestConsult}>
            <Field label="Reason for Visit / Symptoms">
              <TextArea
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Describe symptoms, duration, severity, or reason for visit."
              />
            </Field>
            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}
            <Button type="submit" loading={loading}>
              <Icon name="calendar" size={17} />
              Request Consult
            </Button>
          </form>
        </Card>

        <Card>
          <h2 className="text-lg font-bold text-gray-950">Patient History</h2>
          <div className="mt-4 space-y-4">
            {patientAppointments.length === 0 ? (
              <EmptyState
                title="No appointments yet"
                body="Submit a consult request to begin the HMIS workflow."
              />
            ) : (
              patientAppointments.map((item) => (
                <div key={item.id} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-500">
                        Created {formatDateTime(item.createdAt || item.createdAtClient)}
                      </p>
                      <h3 className="mt-1 font-bold text-gray-950">{item.reason}</h3>
                    </div>
                    <Badge status={item.status}>
                      {APPOINTMENT_STATUS[item.status] || item.status}
                    </Badge>
                  </div>
                  <div className="mt-4 grid gap-3 text-sm text-gray-700 sm:grid-cols-2">
                    <p>
                      <strong>Doctor:</strong> {item.doctorName || "Not assigned"}
                    </p>
                    <p>
                      <strong>Schedule:</strong>{" "}
                      {item.scheduledDate && item.scheduledTime
                        ? `${item.scheduledDate} at ${item.scheduledTime}`
                        : "Not scheduled"}
                    </p>
                    <p>
                      <strong>Blood Pressure:</strong> {item.vitals?.bloodPressure || "N/A"}
                    </p>
                    <p>
                      <strong>Heart Rate:</strong> {item.vitals?.heartRate || "N/A"}
                    </p>
                    <p>
                      <strong>Glucose:</strong> {item.vitals?.glucose || "N/A"}
                    </p>
                  </div>
                  {item.clinicalNotes ? (
                    <div className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-900">
                      <p className="font-bold">Doctor Notes / Prescription</p>
                      <p className="mt-1 whitespace-pre-wrap">{item.clinicalNotes}</p>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </Page>
  );
};

const HospitalsPage = () => {
  const hospitals = [
    {
      name: "City General Hospital",
      type: "Emergency and Critical Care",
      phone: "+91 080 1000 2000",
      address: "Main Road, Central District",
    },
    {
      name: "Vaidya Mithra Clinic",
      type: "Primary Care and Diagnostics",
      phone: "+91 080 2222 3030",
      address: "Health Avenue, South Block",
    },
    {
      name: "Metro Cardiac Center",
      type: "Cardiology and ICU",
      phone: "+91 080 3333 4545",
      address: "Ring Road, East Zone",
    },
  ];

  return (
    <Page title="Hospitals" subtitle="Quick hospital contacts for patient-side support.">
      <div className="grid gap-4 md:grid-cols-3">
        {hospitals.map((hospital) => (
          <Card key={hospital.name}>
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-blue-50 text-blue-700">
              <Icon name="hospital" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-gray-950">{hospital.name}</h2>
            <p className="mt-1 text-sm font-semibold text-blue-700">{hospital.type}</p>
            <p className="mt-3 text-sm text-gray-600">{hospital.address}</p>
            <p className="mt-3 flex items-center gap-2 text-sm font-bold text-gray-800">
              <Icon name="phone" size={16} />
              {hospital.phone}
            </p>
          </Card>
        ))}
      </div>
    </Page>
  );
};

const AttenderDashboard = ({ db, appId, profile }) => {
  const { items: appointments } = useLiveCollection(
    db,
    ["artifacts", appId, "appointments"],
    Boolean(db && appId)
  );
  const { items: users } = useLiveCollection(
    db,
    ["artifacts", appId, "all_users"],
    Boolean(db && appId)
  );
  const [scheduleForms, setScheduleForms] = useState({});
  const [vitalForms, setVitalForms] = useState({});
  const [busyId, setBusyId] = useState("");
  
  // MODIFIED: We grab ALL doctors instead of just approved ones so we can explicitly show the unapproved ones in the dropdown UI!
  const allDoctors = users
    .filter((user) => user.role === "doctor")
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    
  const requested = sortNewest(appointments.filter((item) => item.status === "requested"));
  const scheduled = sortNewest(appointments.filter((item) => item.status === "scheduled"));

  const updateScheduleForm = (id, key, value) =>
    setScheduleForms((state) => ({
      ...state,
      [id]: { ...(state[id] || {}), [key]: value },
    }));

  const updateVitalForm = (id, key, value) =>
    setVitalForms((state) => ({
      ...state,
      [id]: { ...(state[id] || {}), [key]: value },
    }));

  const scheduleAppointment = async (appointment) => {
    const form = scheduleForms[appointment.id] || {};
    // Verify they selected a doctor, and strictly prevent scheduling with unapproved doctors.
    const doctor = allDoctors.find((item) => item.uid === form.doctorId);
    if (!form.date || !form.time || !doctor || doctor.status !== "approved") return;

    setBusyId(appointment.id);
    try {
      await updateDoc(doc(db, "artifacts", appId, "appointments", appointment.id), {
        status: "scheduled",
        scheduledDate: form.date,
        scheduledTime: form.time,
        doctorId: doctor.uid,
        doctorName: doctor.name,
        doctorEmail: doctor.email,
        scheduledBy: profile.uid,
        scheduledByName: profile.name,
        updatedAt: serverTimestamp(),
        updatedAtClient: new Date().toISOString(),
        statusEvents: arrayUnion(
          appointmentEvent("scheduled", profile, `Scheduled with ${doctor.name}`)
        ),
      });
      await writeNotification(db, appId, appointment.patientId, {
        title: "Appointment scheduled",
        message: `Your consult is scheduled on ${form.date} at ${form.time} with ${doctor.name}.`,
        appointmentId: appointment.id,
      });
    } finally {
      setBusyId("");
    }
  };

  const recordVitals = async (appointment) => {
    const form = vitalForms[appointment.id] || {};
    if (!form.bloodPressure || !form.heartRate || !form.glucose) return;

    setBusyId(appointment.id);
    try {
      await updateDoc(doc(db, "artifacts", appId, "appointments", appointment.id), {
        status: "ready",
        vitals: {
          bloodPressure: form.bloodPressure,
          heartRate: form.heartRate,
          glucose: form.glucose,
          recordedBy: profile.uid,
          recordedByName: profile.name,
          recordedAt: new Date().toISOString(),
        },
        updatedAt: serverTimestamp(),
        updatedAtClient: new Date().toISOString(),
        statusEvents: arrayUnion(
          appointmentEvent("ready", profile, "Patient arrived and vitals recorded")
        ),
      });
      await writeNotification(db, appId, appointment.patientId, {
        title: "Vitals recorded",
        message: "Your vitals have been recorded and the doctor queue is ready.",
        appointmentId: appointment.id,
      });
    } finally {
      setBusyId("");
    }
  };

  return (
    <Page
      title="Attender Queue"
      subtitle="Schedule requested consults, assign approved doctors, and record vitals on arrival."
    >
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold text-gray-950">Requested Appointments</h2>
          <div className="mt-4 space-y-4">
            {requested.length === 0 ? (
              <EmptyState title="No requested appointments" />
            ) : (
              requested.map((item) => {
                const form = scheduleForms[item.id] || {};
                return (
                  <div key={item.id} className="rounded-lg border border-gray-200 p-4">
                    <div className="flex flex-wrap justify-between gap-3">
                      <div>
                        <p className="font-bold text-gray-950">{item.patientName}</p>
                        <p className="mt-1 text-sm text-gray-600">{item.reason}</p>
                      </div>
                      <Badge status={item.status}>{APPOINTMENT_STATUS[item.status]}</Badge>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <Input
                        type="date"
                        value={form.date || ""}
                        onChange={(event) => updateScheduleForm(item.id, "date", event.target.value)}
                      />
                      <Input
                        type="time"
                        value={form.time || ""}
                        onChange={(event) => updateScheduleForm(item.id, "time", event.target.value)}
                      />
                      <Select
                        value={form.doctorId || ""}
                        onChange={(event) =>
                          updateScheduleForm(item.id, "doctorId", event.target.value)
                        }
                      >
                        <option value="">Select doctor</option>
                        {allDoctors.map((doctor) => {
                          const isApproved = doctor.status === "approved";
                          return (
                            <option 
                              key={doctor.uid} 
                              value={doctor.uid} 
                              disabled={!isApproved}
                            >
                              {doctor.name} {!isApproved ? "(Pending Approval)" : ""}
                            </option>
                          );
                        })}
                      </Select>
                    </div>
                    <Button
                      type="button"
                      className="mt-4"
                      loading={busyId === item.id}
                      disabled={!form.date || !form.time || !form.doctorId}
                      onClick={() => scheduleAppointment(item)}
                    >
                      Schedule
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-bold text-gray-950">Patient Arrival and Vitals</h2>
          <div className="mt-4 space-y-4">
            {scheduled.length === 0 ? (
              <EmptyState title="No scheduled arrivals waiting" />
            ) : (
              scheduled.map((item) => {
                const form = vitalForms[item.id] || {};
                return (
                  <div key={item.id} className="rounded-lg border border-gray-200 p-4">
                    <div className="flex flex-wrap justify-between gap-3">
                      <div>
                        <p className="font-bold text-gray-950">{item.patientName}</p>
                        <p className="mt-1 text-sm text-gray-600">
                          {item.scheduledDate} at {item.scheduledTime} with {item.doctorName}
                        </p>
                      </div>
                      <Badge status={item.status}>{APPOINTMENT_STATUS[item.status]}</Badge>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <Input
                        placeholder="Blood pressure"
                        value={form.bloodPressure || ""}
                        onChange={(event) =>
                          updateVitalForm(item.id, "bloodPressure", event.target.value)
                        }
                      />
                      <Input
                        placeholder="Heart rate"
                        value={form.heartRate || ""}
                        onChange={(event) =>
                          updateVitalForm(item.id, "heartRate", event.target.value)
                        }
                      />
                      <Input
                        placeholder="Glucose"
                        value={form.glucose || ""}
                        onChange={(event) =>
                          updateVitalForm(item.id, "glucose", event.target.value)
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      className="mt-4"
                      variant="success"
                      loading={busyId === item.id}
                      disabled={!form.bloodPressure || !form.heartRate || !form.glucose}
                      onClick={() => recordVitals(item)}
                    >
                      Record Vitals
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>
    </Page>
  );
};

const DoctorDashboard = ({ db, appId, profile }) => {
  const { items: appointments } = useLiveCollection(
    db,
    ["artifacts", appId, "appointments"],
    Boolean(db && appId)
  );
  const [activeId, setActiveId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const queue = sortNewest(
    appointments.filter((item) => item.status === "ready" && item.doctorId === profile.uid)
  );
  const activeAppointment = queue.find((item) => item.id === activeId);

  const startConsult = (appointment) => {
    setActiveId(appointment.id);
    setNotes(appointment.clinicalNotes || "");
  };

  const completeConsult = async () => {
    if (!activeAppointment || !notes.trim()) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, "artifacts", appId, "appointments", activeAppointment.id), {
        status: "completed",
        clinicalNotes: notes.trim(),
        completedAt: serverTimestamp(),
        completedAtClient: new Date().toISOString(),
        completedBy: profile.uid,
        completedByName: profile.name,
        updatedAt: serverTimestamp(),
        updatedAtClient: new Date().toISOString(),
        statusEvents: arrayUnion(
          appointmentEvent("completed", profile, "Doctor completed consultation")
        ),
      });
      await writeNotification(db, appId, activeAppointment.patientId, {
        title: "Consultation completed",
        message: `Dr. ${profile.name} has completed your consultation notes.`,
        appointmentId: activeAppointment.id,
      });
      setActiveId("");
      setNotes("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page
      title="Doctor Consultation"
      subtitle="Review ready appointments assigned to you, then complete clinical notes or prescriptions."
    >
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <h2 className="text-lg font-bold text-gray-950">Ready Queue</h2>
          <div className="mt-4 space-y-3">
            {queue.length === 0 ? (
              <EmptyState title="No ready appointments assigned to you" />
            ) : (
              queue.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => startConsult(item)}
                  className={`w-full rounded-lg border p-4 text-left transition ${
                    activeId === item.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 bg-white hover:border-blue-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-gray-950">{item.patientName}</p>
                      <p className="mt-1 text-sm text-gray-600">{item.reason}</p>
                    </div>
                    <Badge status={item.status}>{APPOINTMENT_STATUS[item.status]}</Badge>
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-bold text-gray-950">Consultation Workspace</h2>
          {!activeAppointment ? (
            <EmptyState title="Select a patient" body="Start Consult from your ready queue." />
          ) : (
            <div className="mt-4 space-y-4">
              <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-700">
                <p>
                  <strong>Patient:</strong> {activeAppointment.patientName}
                </p>
                <p className="mt-2">
                  <strong>Reason:</strong> {activeAppointment.reason}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <p>
                    <strong>BP:</strong> {activeAppointment.vitals?.bloodPressure || "N/A"}
                  </p>
                  <p>
                    <strong>HR:</strong> {activeAppointment.vitals?.heartRate || "N/A"}
                  </p>
                  <p>
                    <strong>Glucose:</strong> {activeAppointment.vitals?.glucose || "N/A"}
                  </p>
                </div>
              </div>
              <Field label="Clinical Notes / Prescriptions">
                <TextArea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Enter notes, prescriptions, follow-up instructions, and safety advice."
                />
              </Field>
              <Button
                type="button"
                variant="success"
                loading={busy}
                disabled={!notes.trim()}
                onClick={completeConsult}
              >
                Complete
              </Button>
            </div>
          )}
        </Card>
      </div>
    </Page>
  );
};

const DoctorHistory = ({ db, appId, profile }) => {
  const { items: appointments } = useLiveCollection(
    db,
    ["artifacts", appId, "appointments"],
    Boolean(db && appId)
  );
  const completed = sortNewest(
    appointments.filter((item) => item.status === "completed" && item.doctorId === profile.uid)
  );

  return (
    <Page
      title="Doctor History"
      subtitle="Completed consultations assigned to your doctor account."
    >
      <Card>
        <div className="space-y-4">
          {completed.length === 0 ? (
            <EmptyState title="No completed consultations yet" />
          ) : (
            completed.map((item) => (
              <div key={item.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <p className="font-bold text-gray-950">{item.patientName}</p>
                    <p className="mt-1 text-sm text-gray-600">{item.reason}</p>
                  </div>
                  <Badge status="completed">Completed</Badge>
                </div>
                <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                  <p className="font-bold">Notes / Prescription</p>
                  <p className="mt-1 whitespace-pre-wrap">{item.clinicalNotes}</p>
                </div>
                <p className="mt-3 text-xs font-semibold text-gray-500">
                  Completed {formatDateTime(item.completedAt || item.completedAtClient)}
                </p>
              </div>
            ))
          )}
        </div>
      </Card>
    </Page>
  );
};

const AdminDashboard = ({ db, appId }) => {
  const { items: users } = useLiveCollection(
    db,
    ["artifacts", appId, "all_users"],
    Boolean(db && appId)
  );
  const { items: appointments } = useLiveCollection(
    db,
    ["artifacts", appId, "appointments"],
    Boolean(db && appId)
  );

  const stats = {
    totalUsers: users.length,
    activeDoctors: users.filter((item) => item.role === "doctor" && item.status === "approved").length,
    pending: users.filter((item) => item.status === "pending").length,
    requested: appointments.filter((item) => item.status === "requested").length,
    completed: appointments.filter((item) => item.status === "completed").length,
  };

  return (
    <Page title="Admin Dashboard" subtitle="System overview across users and appointments.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total users" value={stats.totalUsers} icon="users" tone="blue" />
        <StatCard label="Active doctors" value={stats.activeDoctors} icon="stethoscope" tone="green" />
        <StatCard label="Pending approvals" value={stats.pending} icon="checkCircle" tone="amber" />
        <StatCard label="Requested" value={stats.requested} icon="calendar" tone="purple" />
        <StatCard label="Completed" value={stats.completed} icon="history" tone="gray" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold text-gray-950">Recent Users</h2>
          <div className="mt-4 space-y-3">
            {sortNewest(users).slice(0, 5).map((user) => (
              <div key={user.uid} className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                <div>
                  <p className="font-semibold text-gray-900">{user.name}</p>
                  <p className="text-xs text-gray-500">{user.email}</p>
                </div>
                <div className="flex gap-2">
                  <Badge status={user.status}>{STATUS_LABELS[user.status] || user.status}</Badge>
                  <Badge status="scheduled">{ROLE_LABELS[user.role]}</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-bold text-gray-950">Recent Appointments</h2>
          <div className="mt-4 space-y-3">
            {sortNewest(appointments).slice(0, 5).map((item) => (
              <div key={item.id} className="rounded-lg bg-gray-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{item.patientName}</p>
                    <p className="truncate text-xs text-gray-500">{item.reason}</p>
                  </div>
                  <Badge status={item.status}>{APPOINTMENT_STATUS[item.status]}</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Page>
  );
};

const AdminApprovals = ({ db, appId, profile }) => {
  const { items: users } = useLiveCollection(
    db,
    ["artifacts", appId, "all_users"],
    Boolean(db && appId)
  );
  const [busyId, setBusyId] = useState("");
  const pending = users
    .filter((item) => item.status === "pending")
    .sort((a, b) => String(a.role).localeCompare(String(b.role)));

  const approve = async (user) => {
    setBusyId(user.uid);
    try {
      await updateProfileDocuments(db, appId, user.uid, {
        status: "approved",
        approvedBy: profile.uid,
        approvedByName: profile.name,
        approvedAtClient: new Date().toISOString(),
      });
    } finally {
      setBusyId("");
    }
  };

  return (
    <Page title="Admin Approvals" subtitle="Approve pending doctors, attenders, and additional admins.">
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Age/Gender</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {pending.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                    No pending approvals.
                  </td>
                </tr>
              ) : (
                pending.map((user) => (
                  <tr key={user.uid}>
                    <td className="px-4 py-3 font-semibold text-gray-900">{user.name}</td>
                    <td className="px-4 py-3 text-gray-600">{user.email}</td>
                    <td className="px-4 py-3">{ROLE_LABELS[user.role]}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {user.age || "N/A"} / {user.gender || "N/A"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge status={user.status}>{STATUS_LABELS[user.status]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="success"
                        loading={busyId === user.uid}
                        onClick={() => approve(user)}
                      >
                        Approve
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </Page>
  );
};

const AdminUsersDirectory = ({ db, appId }) => {
  const [roleFilter, setRoleFilter] = useState("all");
  const { items: users } = useLiveCollection(
    db,
    ["artifacts", appId, "all_users"],
    Boolean(db && appId)
  );
  const filteredUsers = users
    .filter((user) => roleFilter === "all" || user.role === roleFilter)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  return (
    <Page
      title="Users Directory"
      subtitle="Master list of every registered user from artifacts/{appId}/all_users."
      actions={
        <Select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
          <option value="all">All roles</option>
          <option value="patient">Patients</option>
          <option value="doctor">Doctors</option>
          <option value="attender">Attenders</option>
          <option value="admin">Admins</option>
        </Select>
      }
    >
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Age</th>
                <th className="px-4 py-3">Gender</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filteredUsers.map((user) => (
                <tr key={user.uid}>
                  <td className="px-4 py-3 font-semibold text-gray-900">{user.name}</td>
                  <td className="px-4 py-3 text-gray-600">{user.email}</td>
                  <td className="px-4 py-3">{ROLE_LABELS[user.role]}</td>
                  <td className="px-4 py-3">
                    <Badge status={user.status}>{STATUS_LABELS[user.status] || user.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{user.phone || "N/A"}</td>
                  <td className="px-4 py-3 text-gray-600">{user.age || "N/A"}</td>
                  <td className="px-4 py-3 text-gray-600">{user.gender || "N/A"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Page>
  );
};

const AdminSystemLog = ({ db, appId }) => {
  const { items: appointments } = useLiveCollection(
    db,
    ["artifacts", appId, "appointments"],
    Boolean(db && appId)
  );
  const ordered = sortNewest(appointments);

  return (
    <Page
      title="System Log"
      subtitle="Global chronological history of appointments created on the platform."
    >
      <Card>
        <div className="space-y-4">
          {ordered.length === 0 ? (
            <EmptyState title="No appointments have been created yet" />
          ) : (
            ordered.map((item) => (
              <div key={item.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-500">
                      {formatDateTime(item.createdAt || item.createdAtClient)}
                    </p>
                    <h3 className="mt-1 font-bold text-gray-950">{item.patientName}</h3>
                    <p className="mt-1 text-sm text-gray-600">{item.reason}</p>
                  </div>
                  <Badge status={item.status}>{APPOINTMENT_STATUS[item.status] || item.status}</Badge>
                </div>
                <div className="mt-4 grid gap-3 text-sm text-gray-700 md:grid-cols-3">
                  <p>
                    <strong>Doctor:</strong> {item.doctorName || "Not assigned"}
                  </p>
                  <p>
                    <strong>Schedule:</strong>{" "}
                    {item.scheduledDate && item.scheduledTime
                      ? `${item.scheduledDate} ${item.scheduledTime}`
                      : "N/A"}
                  </p>
                  <p>
                    <strong>Completed:</strong>{" "}
                    {item.completedAt || item.completedAtClient
                      ? formatDateTime(item.completedAt || item.completedAtClient)
                      : "N/A"}
                  </p>
                </div>
                {Array.isArray(item.statusEvents) && item.statusEvents.length > 0 ? (
                  <div className="mt-4 rounded-lg bg-gray-50 p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                      Workflow events
                    </p>
                    <div className="mt-2 space-y-2">
                      {item.statusEvents.map((event, index) => (
                        <div key={`${event.status}-${event.at}-${index}`} className="text-sm text-gray-700">
                          <strong>{APPOINTMENT_STATUS[event.status] || event.status}:</strong>{" "}
                          {event.label} by {event.actorName} at {formatDateTime(event.at)}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </Card>
    </Page>
  );
};

const ProfilePage = ({ auth, db, appId, profile }) => {
  const [form, setForm] = useState({
    name: profile.name || "",
    phone: profile.phone || "",
    age: profile.age || "",
    gender: profile.gender || "",
  });
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    setForm({
      name: profile.name || "",
      phone: profile.phone || "",
      age: profile.age || "",
      gender: profile.gender || "",
    });
  }, [profile.name, profile.phone, profile.age, profile.gender]);

  const update = (key, value) => setForm((state) => ({ ...state, [key]: value }));

  const saveProfile = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");
    try {
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: form.name });
      }
      await updateProfileDocuments(db, appId, profile.uid, form);
      setMessage("Profile updated.");
    } catch (saveError) {
      setError(saveError.message || "Could not update profile.");
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (event) => {
    event.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setPasswordLoading(true);
    setMessage("");
    setError("");
    try {
      await updatePassword(auth.currentUser, newPassword);
      setNewPassword("");
      setMessage("Password updated for the current auth session.");
    } catch (passwordError) {
      setError(
        passwordError.message ||
          "Could not update password. Sign in again and retry if Firebase requires recent login."
      );
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <Page title="Profile" subtitle="Update your account demographics and password.">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <Card>
          <h2 className="text-lg font-bold text-gray-950">Profile Details</h2>
          <form className="mt-4 space-y-4" onSubmit={saveProfile}>
            <Field label="Name">
              <Input value={form.name} onChange={(event) => update("name", event.target.value)} />
            </Field>
            <Field label="Phone Number">
              <Input value={form.phone} onChange={(event) => update("phone", event.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Age">
                <Input
                  type="number"
                  min="0"
                  value={form.age}
                  onChange={(event) => update("age", event.target.value)}
                />
              </Field>
              <Field label="Gender">
                <Select value={form.gender} onChange={(event) => update("gender", event.target.value)}>
                  <option value="">Select</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Non-binary">Non-binary</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </Select>
              </Field>
            </div>
            <Button type="submit" loading={loading}>
              Save Profile
            </Button>
          </form>
        </Card>

        <Card>
          <h2 className="text-lg font-bold text-gray-950">Security</h2>
          <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-700">
            <p>
              <strong>Email:</strong> {profile.email}
            </p>
            <p className="mt-2">
              <strong>Role:</strong> {ROLE_LABELS[profile.role]}
            </p>
            <p className="mt-2">
              <strong>Status:</strong>{" "}
              <Badge status={profile.status}>{STATUS_LABELS[profile.status]}</Badge>
            </p>
          </div>
          <form className="mt-5 space-y-4" onSubmit={resetPassword}>
            <Field label="New Password">
              <Input
                type="password"
                minLength={6}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Minimum 6 characters"
              />
            </Field>
            <Button type="submit" variant="secondary" loading={passwordLoading}>
              Reset Password
            </Button>
          </form>

          {message ? (
            <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              {message}
            </div>
          ) : null}
          {error ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </Card>
      </div>
    </Page>
  );
};

const SupportPage = () => (
  <Page title="Support" subtitle="Contact information for every role in the HMIS.">
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <Icon name="mail" className="text-blue-700" />
        <h2 className="mt-4 text-lg font-bold text-gray-950">Email</h2>
        <p className="mt-2 text-sm text-gray-600">support@vaidyamithra.example</p>
      </Card>
      <Card>
        <Icon name="phone" className="text-green-700" />
        <h2 className="mt-4 text-lg font-bold text-gray-950">Phone</h2>
        <p className="mt-2 text-sm text-gray-600">+91 080 5555 0101</p>
      </Card>
      <Card>
        <Icon name="hospital" className="text-purple-700" />
        <h2 className="mt-4 text-lg font-bold text-gray-950">Hospital Desk</h2>
        <p className="mt-2 text-sm text-gray-600">Open daily, 8:00 AM to 8:00 PM</p>
      </Card>
    </div>
  </Page>
);

const PendingNavBar = ({ currentPage, onNavigate, onLogout }) => {
  const links = [
    { id: "pending", label: "Wait", icon: "history" },
    { id: "profile", label: "Profile", icon: "user" },
    { id: "support", label: "Support", icon: "mail" },
  ];

  return (
    <nav className="z-20 flex-shrink-0 border-b border-gray-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Logo />
        <div className="flex items-center gap-1">
          {links.map((link) => (
            <button
              key={link.id}
              type="button"
              onClick={() => onNavigate(link.id)}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                currentPage === link.id
                  ? "bg-amber-100 text-amber-800"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <Icon name={link.icon} size={17} />
              <span className="hidden sm:inline">{link.label}</span>
            </button>
          ))}
          <Button type="button" size="icon" variant="ghost" onClick={onLogout} title="Sign out">
            <Icon name="logOut" size={20} />
          </Button>
        </div>
      </div>
    </nav>
  );
};

const PendingLayout = ({ auth, db, appId, profile, currentPage, onNavigate, onLogout }) => {
  const pageToRender =
    currentPage === "profile" ? (
      <ProfilePage auth={auth} db={db} appId={appId} profile={profile} />
    ) : currentPage === "support" ? (
      <SupportPage />
    ) : (
      <PendingApprovalPage profile={profile} />
    );

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-gradient-to-br from-blue-50 via-white to-amber-50 font-sans text-gray-900">
      <PendingNavBar currentPage={currentPage} onNavigate={onNavigate} onLogout={onLogout} />
      <main className="min-h-0 flex-grow overflow-y-auto">{pageToRender}</main>
      <Footer />
    </div>
  );
};

const MissingProfileSetupPage = ({ db, appId, user, onComplete, onLogout }) => {
  const [form, setForm] = useState({
    name: user?.displayName || normalizeEmail(user?.email).split("@")[0] || "",
    phone: "",
    age: "",
    gender: "",
    role: "patient",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const update = (key, value) => setForm((state) => ({ ...state, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (user && form.name) {
        await updateProfile(user, { displayName: form.name }).catch(() => {});
      }
      const status = form.role === "patient" ? "approved" : "pending";
      const profile = await ensureGlobalProfile(db, appId, user, {
        ...form,
        status,
      });
      onComplete({ id: user.uid, uid: user.uid, ...profile });
    } catch (setupError) {
      setError(setupError.message || "Could not create your profile.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-blue-50 via-white to-green-50 px-4 py-8">
      <Card className="w-full max-w-xl">
        <div className="mb-5">
          <Logo />
        </div>
        <h1 className="text-2xl font-bold text-gray-950">Complete your HMIS profile</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Your Firebase account exists, but the HMIS role profile was not created.
          Choose the intended role once and the app will continue normally.
        </p>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <Field label="Full name">
            <Input
              required
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone number">
              <Input
                value={form.phone}
                onChange={(event) => update("phone", event.target.value)}
              />
            </Field>
            <Field label="Age">
              <Input
                type="number"
                min="0"
                value={form.age}
                onChange={(event) => update("age", event.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Gender">
              <Select
                value={form.gender}
                onChange={(event) => update("gender", event.target.value)}
              >
                <option value="">Select</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Non-binary">Non-binary</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </Select>
            </Field>
            <Field label="Role">
              <Select value={form.role} onChange={(event) => update("role", event.target.value)}>
                <option value="patient">Patient</option>
                <option value="doctor">Doctor</option>
                <option value="attender">Attender</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
          </div>
          {form.role !== "patient" ? (
            <p className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">
              This role will be saved as pending until an approved admin confirms it.
            </p>
          ) : null}
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" loading={loading}>
              Create Profile
            </Button>
            <Button type="button" variant="secondary" onClick={onLogout}>
              Sign out
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

const ProfileLoadErrorPage = ({ error, onLogout }) => (
  <div className="grid h-screen place-items-center bg-gradient-to-br from-red-50 via-white to-blue-50 px-4">
    <Card className="max-w-xl text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-red-100 text-red-700">
        <Icon name="alertTriangle" size={28} />
      </div>
      <h1 className="mt-5 text-2xl font-bold text-gray-950">Profile could not be loaded</h1>
      <p className="mt-3 text-sm leading-6 text-gray-600">
        Firebase Auth has a signed-in user, but the HMIS profile document could
        not be read or created. Sign out, then sign in again with an email and
        password account.
      </p>
      {error ? (
        <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-left text-xs text-red-700">
          {error}
        </div>
      ) : null}
      <Button type="button" variant="secondary" className="mt-6" onClick={onLogout}>
        <Icon name="logOut" size={16} />
        Sign out
      </Button>
    </Card>
  </div>
);

const LoadingScreen = ({ label = "Loading Vaidya Mithra..." }) => (
  <div className="grid h-screen place-items-center bg-blue-50">
    <div className="text-center">
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-700" />
      <p className="mt-4 text-sm font-semibold text-blue-900">{label}</p>
    </div>
  </div>
);

const App = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [appId, setAppId] = useState("");
  const [firebaseReady, setFirebaseReady] = useState(false);
  const [firebaseError, setFirebaseError] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileReady, setProfileReady] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [page, setPage] = useState("patientHome");

  useEffect(() => {
    try {
      let firebaseConfig = {};
      if (typeof __firebase_config !== "undefined") {
        firebaseConfig = JSON.parse(__firebase_config);
      } else {
        firebaseConfig = getFirebaseConfig();
      }

      if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
        throw new Error(
          "Firebase config is missing. Set VITE_FIREBASE_CONFIG or individual VITE_FIREBASE_* variables."
        );
      }

      const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
      setLogLevel(env.VITE_FIREBASE_LOG_LEVEL || "error");
      setDb(getFirestore(app));
      setAuth(getAuth(app));
      setAppId(typeof __app_id !== "undefined" ? __app_id : (firebaseConfig.appId || env.VITE_APP_ID || firebaseConfig.projectId));
    } catch (error) {
      setFirebaseError(error.message || "Firebase initialization failed.");
    } finally {
      setFirebaseReady(true);
    }
  }, []);

  useEffect(() => {
    if (!auth) return undefined;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user?.isAnonymous) {
        setCurrentUser(null);
        setProfile(null);
        setProfileError("");
        setProfileReady(true);
        signOut(auth).catch((error) =>
          setFirebaseError(error.message || "Could not clear anonymous session.")
        );
        return;
      }

      setCurrentUser(user);
      setProfile(null);
      setProfileError("");
      setProfileReady(!user);
    });

    return unsubscribe;
  }, [auth]);

  useEffect(() => {
    if (!db || !appId || !currentUser) return undefined;

    setProfileReady(false);
    const unsubscribe = onSnapshot(
      userProfileRef(db, appId, currentUser.uid),
      async (snapshot) => {
        if (snapshot.exists()) {
          setProfile({ id: currentUser.uid, uid: currentUser.uid, ...snapshot.data() });
          setProfileError("");
          setProfileReady(true);
          return;
        }

        try {
          const isPersistedSuperAdmin =
            normalizeEmail(currentUser.email) === SUPER_ADMIN_EMAIL.toLowerCase();
          if (!isPersistedSuperAdmin) {
            setProfile(null);
            setProfileError("profile-missing");
            setProfileReady(true);
            return;
          }

          const createdProfile = await ensureGlobalProfile(db, appId, currentUser, {
            name: currentUser.displayName || "Super Admin",
            role: "admin",
            status: "approved",
          });
          setProfile({ id: currentUser.uid, uid: currentUser.uid, ...createdProfile });
          setProfileError("");
          setProfileReady(true);
        } catch (error) {
          setProfile(null);
          setProfileError(error.message || "Could not create the missing profile document.");
          setProfileReady(true);
        }
      },
      (error) => {
        setFirebaseError(error.message || "Could not load profile.");
        setProfileError(error.message || "Could not load profile.");
        setProfile(null);
        setProfileReady(true);
      }
    );

    return unsubscribe;
  }, [db, appId, currentUser]);

  useEffect(() => {
    if (!profileReady || !profile) return;

    if (profile.status !== "approved") {
      if (!["pending", "profile", "support"].includes(page)) {
        setPage("pending");
      }
      return;
    }

    if (page === "pending" || !isAllowedPage(page, profile.role)) {
      setPage(defaultPageForRole(profile.role));
    }
  }, [profileReady, profile, page]);

  const notificationPath = useMemo(
    () =>
      profile?.role === "patient" && currentUser
        ? ["artifacts", appId, "users", currentUser.uid, "notifications"]
        : [],
    [appId, currentUser, profile]
  );
  const { items: notifications } = useLiveCollection(
    db,
    notificationPath,
    Boolean(db && appId && currentUser && profile?.role === "patient")
  );

  const handleLogin = async (email, password) => {
    if (!auth || !db || !appId) throw new Error("Firebase is not ready.");

    if (isSuperAdminCredentials(email, password)) {
      let credential;
      try {
        credential = await signInWithEmailAndPassword(auth, normalizeEmail(email), password);
      } catch (loginError) {
        if (!["auth/user-not-found", "auth/invalid-credential"].includes(loginError.code)) {
          throw loginError;
        }
        try {
          credential = await createUserWithEmailAndPassword(
            auth,
            normalizeEmail(email),
            password
          );
        } catch (createError) {
          if (createError.code && createError.code !== "auth/email-already-in-use") {
            throw createError;
          }
          throw loginError;
        }
      }

      await updateProfile(credential.user, { displayName: "Super Admin" }).catch(() => {});
      await ensureGlobalProfile(db, appId, credential.user, {
        name: "Super Admin",
        role: "admin",
        status: "approved",
      });
      setPage("adminDashboard");
      return;
    }

    await signInWithEmailAndPassword(auth, normalizeEmail(email), password);
  };

  const handleSignup = async (form) => {
    if (!auth || !db || !appId) throw new Error("Firebase is not ready.");

    const role = form.role || "patient";
    const status = role === "patient" ? "approved" : "pending";
    const credential = await createUserWithEmailAndPassword(
      auth,
      normalizeEmail(form.email),
      form.password
    );
    await updateProfile(credential.user, { displayName: form.name }).catch(() => {});
    await ensureGlobalProfile(db, appId, credential.user, {
      name: form.name,
      phone: form.phone,
      age: form.age,
      gender: form.gender,
      role,
      status,
    });
    setPage(status === "approved" ? defaultPageForRole(role) : "pending");
  };

  const handleLogout = async () => {
    if (auth) await signOut(auth);
    setPage("patientHome");
  };

  const markNotificationsRead = useCallback(async () => {
    if (!db || !appId || !currentUser) return;
    const unread = notifications.filter((item) => !item.read);
    await Promise.all(
      unread.map((item) =>
        updateDoc(doc(db, "artifacts", appId, "users", currentUser.uid, "notifications", item.id), {
          read: true,
          readAtClient: new Date().toISOString(),
          readAt: serverTimestamp(),
        })
      )
    );
  }, [db, appId, currentUser, notifications]);

  const renderPage = () => {
    if (!profile) return null;
    const shared = { db, appId, profile };

    switch (page) {
      case "patientHome":
        return <PatientHomePage profile={profile} onNavigate={setPage} />;
      case "triage":
        return <TriagePage {...shared} />;
      case "docbot":
        return <DocBotPage profile={profile} />;
      case "appointments":
        return <PatientAppointmentsPage {...shared} />;
      case "hospitals":
        return <HospitalsPage />;
      case "attenderDashboard":
        return <AttenderDashboard {...shared} />;
      case "doctorDashboard":
        return <DoctorDashboard {...shared} />;
      case "doctorHistory":
        return <DoctorHistory {...shared} />;
      case "adminDashboard":
        return <AdminDashboard db={db} appId={appId} />;
      case "approvals":
        return <AdminApprovals {...shared} />;
      case "users":
        return <AdminUsersDirectory db={db} appId={appId} />;
      case "systemLog":
        return <AdminSystemLog db={db} appId={appId} />;
      case "profile":
        return <ProfilePage auth={auth} db={db} appId={appId} profile={profile} />;
      case "support":
        return <SupportPage />;
      default:
        return <PatientHomePage profile={profile} onNavigate={setPage} />;
    }
  };

  if (!firebaseReady) return <LoadingScreen />;

  if (!currentUser) {
    return (
      <AuthPage
        firebaseError={firebaseError}
        onLogin={handleLogin}
        onSignup={handleSignup}
      />
    );
  }

  if (!profileReady) return <LoadingScreen label="Loading profile..." />;

  if (!profile && profileError === "profile-missing") {
    return (
      <MissingProfileSetupPage
        db={db}
        appId={appId}
        user={currentUser}
        onLogout={handleLogout}
        onComplete={(createdProfile) => {
          setProfile(createdProfile);
          setProfileError("");
          setProfileReady(true);
          setPage(
            createdProfile.status === "approved"
              ? defaultPageForRole(createdProfile.role)
              : "pending"
          );
        }}
      />
    );
  }

  if (!profile) {
    return (
      <ProfileLoadErrorPage
        error={profileError || firebaseError}
        onLogout={handleLogout}
      />
    );
  }

  if (profile.status !== "approved") {
    return (
      <PendingLayout
        auth={auth}
        db={db}
        appId={appId}
        profile={profile}
        currentPage={page}
        onNavigate={setPage}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-gray-50 font-sans text-gray-900">
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <NavBar
        profile={profile}
        currentPage={page}
        onNavigate={setPage}
        onLogout={handleLogout}
        notifications={notifications}
        onMarkNotificationsRead={markNotificationsRead}
      />
      <main className="min-h-0 flex-grow overflow-y-auto">
        <div style={{ animation: "fadeInUp 0.2s ease-out" }}>{renderPage()}</div>
      </main>
      <Footer />
    </div>
  );
};

export default App;
