# 🩺 Vaidya Mithra

Vaidya Mithra is an AI-powered healthcare assistance and hospital management web application designed to support patients, attenders, doctors, and administrators in one coordinated platform.

The application provides:

- Public AI symptom assessment
- Public nearby hospital finder
- Secure role-based login
- Patient appointment requests
- Attender scheduling and vitals recording
- Doctor consultation notes and prescriptions
- Specialist referral workflow
- Admin approvals, analytics, and audit logs
- Email updates when appointments are scheduled
- Responsive light/dark mode UI

The application is built using **React**, **Firebase**, **Tailwind CSS**, **Google Gemini AI**, and **EmailJS**.

---

# 🌐 Live Demo

🔗 [Open Vaidya Mithra](https://vaidya-mithra-app.vercel.app)

---

# 🚀 Features

## 🔍 Public AI Symptom Prediction

Users can access AI health assessment without logging in.

Users can:

- Select symptoms from categorized lists
- Enter age and gender
- Get AI-generated possible conditions
- View confidence levels
- Receive non-diagnostic next steps
- See emergency warnings for critical symptoms

The AI check is intended for informational guidance only and does not replace professional medical advice.

---

## 🤖 DocBot – Logged-in AI Health Assistant

DocBot is an AI chatbot powered by Google Gemini AI.

It can:

- Answer general health-related questions
- Explain symptoms and conditions in simple language
- Provide safe and non-diagnostic advice
- Encourage emergency care when severe symptoms are mentioned

DocBot is available only after login to help protect usage and keep the main public page lightweight.

---

## 🏥 Nearby Hospital Finder

The hospital finder helps users quickly search for hospitals nearby.

It:

- Provides a public hospital page
- Includes a nearby hospital search button
- Redirects users to Google Maps
- Works without login

---

## 👤 Role-Based Authentication

Vaidya Mithra supports secure email/password authentication using Firebase Authentication.

Supported roles:

- Patient
- Attender
- Doctor
- Admin

Patients are approved automatically. Doctors, attenders, and additional admins require admin approval before accessing their dashboards.

---

## 🧑‍⚕️ Patient Dashboard

Patients can:

- Request appointments/consultations
- Track appointment status
- View assigned doctor details
- See appointment date and time
- View queue token details
- Access AI triage history
- Use DocBot after login
- Update profile details

---

## 🧾 Appointment Requests

Patients can request a consult by entering their reason for visit or symptoms.

Each appointment includes:

- Patient details
- Reason for visit
- Appointment status
- Queue token
- Assigned doctor
- Scheduled date and time
- Vitals
- Consultation notes
- Prescription details

---

## 🎟️ Appointment Tokens

The system generates OPD-style queue tokens such as:

```text
OPD-001
OPD-002
OPD-003
```

Tokens help attenders, doctors, and patients track queue order.

The system also shows waiting count based on appointment order.

---

## 🧑‍💼 Attender Dashboard

Attenders can:

- View requested appointments
- Assign approved doctors
- Select valid schedule date and time
- Record patient vitals
- Mark patients as ready for doctor consultation
- Mark appointments as no-show or cancelled
- View patient queue and waiting count

When an appointment is scheduled, the patient receives:

- In-app notification
- Email schedule update

---

## 📧 Appointment Email Updates

Vaidya Mithra sends an email to the patient when an attender schedules an appointment.

The email includes:

- Patient name
- OPD token
- Scheduled date
- Scheduled time
- Doctor name

Email sending is handled using **EmailJS**.

Example email:

```text
Hi Dilip,

Your Vaidya Mithra appointment OPD-001 is scheduled on 2026-06-06 at 10:00 with Dr. Arya.

Thank you,
Vaidya Mithra
```

The attender dashboard also displays email status:

- Email Sent
- Email not sent
- Email pending

---

## 🩺 Doctor Dashboard

Doctors can:

- View appointments assigned to them
- See scheduled patients immediately after assignment
- Review patient details and visit reason
- View recorded vitals
- Add consultation notes
- Add prescriptions
- Complete consultations

Doctors can see assigned patients before the patient is marked ready, but consultation completion unlocks after vitals are recorded.

---

## 🏥 Specialist Referral Workflow

If an OPD doctor decides that a patient needs specialist care, the doctor can:

- Select a specialist doctor
- Add referral notes
- Complete the OPD consultation
- Automatically create a specialist consultation

This supports a more enterprise-level patient care flow.

---

## 📅 Doctor Availability

Admins and doctors can manage doctor availability.

Availability includes:

- Consulting days
- Time slots
- Doctor-specific schedule rules

Attenders can only schedule appointments into valid available slots.

---

## 🧑‍💻 Admin Dashboard

Admins can:

- Approve pending doctors
- Approve pending attenders
- Approve additional admins
- View all users
- Monitor appointments
- Manage doctor availability
- View analytics
- Review audit logs

---

## 📊 Analytics

The analytics dashboard includes charts and summaries for:

- Daily appointments
- Completed consultations
- Pending queues
- Doctor workload

This helps admins understand hospital activity and workload distribution.

---

## 🧾 Audit Trail

The system stores audit logs for important activities such as:

- Profile creation
- Profile updates
- User approvals
- Appointment requests
- Appointment scheduling
- Vitals recording
- Appointment cancellation
- No-show marking
- Doctor availability updates
- Consultation completion
- Prescription updates
- Specialist referrals

---

## 🔎 Search and Filters

Dashboards include search and filter support for:

- Patient name
- Doctor name
- Appointment token
- Appointment status
- Date
- Role
- Email
- Phone number

---

## 🌗 Light and Dark Mode

Vaidya Mithra includes a responsive light/dark mode system.

- Light mode is the default
- User preference is saved locally
- Dark mode is available across public and logged-in pages

---

## 📱 Responsive UI

The interface is designed to work across desktop, tablet, and mobile screens.

UI features include:

- Responsive navigation
- Professional login page
- Role-specific dashboards
- Clean card-based sections
- Accessible forms
- Status badges
- Smooth visual hierarchy
- Modern Tailwind CSS styling

---

# 🛠️ Technologies Used

| Technology | Purpose |
|---|---|
| React.js | Frontend framework |
| Vite | Build tool |
| Tailwind CSS | Styling and responsive layout |
| Firebase Authentication | Email/password authentication |
| Firebase Firestore | Real-time database |
| Google Gemini AI | AI triage and DocBot |
| EmailJS | Appointment schedule email updates |
| Google Maps | Nearby hospital search |
| Vercel | Deployment |

---

# 📂 Project Structure

```bash
vaidya-mithra/
│
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── vite.config.js
├── README.md
│
└── src/
    │
    ├── main.jsx
    ├── App.jsx
    └── index.css
```

---

# ⚙️ Environment Variables

Create a `.env` file in the root directory.

```env
VITE_FIREBASE_CONFIG=YOUR_FIREBASE_CONFIG
VITE_VAIDYA_MITHRA_GEMINI_KEY=YOUR_GEMINI_API_KEY
VITE_EMAILJS_SERVICE_ID=YOUR_EMAILJS_SERVICE_ID
VITE_EMAILJS_TEMPLATE_ID=YOUR_EMAILJS_TEMPLATE_ID
VITE_EMAILJS_PUBLIC_KEY=YOUR_EMAILJS_PUBLIC_KEY
VITE_EMAIL_FROM_NAME=Vaidya Mithra
```

You may also use individual Firebase variables instead of `VITE_FIREBASE_CONFIG`:

```env
VITE_FIREBASE_API_KEY=YOUR_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN=YOUR_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET=YOUR_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID=YOUR_FIREBASE_APP_ID
```

Optional Gemini model override:

```env
VITE_VAIDYA_MITHRA_GEMINI_MODEL=gemini-2.5-flash
```

---

# 🔥 Firebase Setup

1. Create a Firebase project.
2. Enable Firebase Authentication.
3. Enable Email/Password sign-in.
4. Create a Firestore Database.
5. Add the Firebase configuration to `.env`.
6. Add the Firestore security rules in Firebase Console.
7. Deploy or paste the Firestore rules before production use.

Firestore is used for:

- User profiles
- Global user directory
- Appointments
- Notifications
- AI triage history
- Doctor availability
- Audit logs

---

# 📧 EmailJS Setup

Vaidya Mithra uses EmailJS to send appointment schedule emails.

## 1. Create EmailJS Account

Go to:

🔗 [EmailJS Dashboard](https://dashboard.emailjs.com/)

## 2. Add Email Service

1. Open **Email Services**
2. Click **Add New Service**
3. Choose Gmail or another supported provider
4. Connect the email account
5. Copy the **Service ID**

Add it to `.env`:

```env
VITE_EMAILJS_SERVICE_ID=YOUR_SERVICE_ID
```

## 3. Create Email Template

1. Open **Email Templates**
2. Click **Create New Template**
3. Set a template name such as:

```text
Appointment Schedule
```

4. Copy the **Template ID**

Add it to `.env`:

```env
VITE_EMAILJS_TEMPLATE_ID=YOUR_TEMPLATE_ID
```

## 4. EmailJS Template Fields

Use these variables inside the EmailJS template:

```text
{{to_email}}
{{to_name}}
{{patient_name}}
{{queue_token}}
{{scheduled_date}}
{{scheduled_time}}
{{doctor_name}}
{{from_name}}
{{subject}}
{{message}}
```

Recommended template:

```text
To Email: {{to_email}}
To Name: {{to_name}}
From Name: {{from_name}}
Subject: {{subject}}
```

Email body:

```text
Hi {{patient_name}},

Your Vaidya Mithra appointment {{queue_token}} is scheduled on {{scheduled_date}} at {{scheduled_time}} with {{doctor_name}}.

Thank you,
{{from_name}}
```

## 5. Add Public Key

1. Open **Account**
2. Copy the **Public Key**
3. Add it to `.env`:

```env
VITE_EMAILJS_PUBLIC_KEY=YOUR_PUBLIC_KEY
```

---

# ▶️ Installation & Running

## Clone Repository

```bash
git clone https://github.com/dilipgowdaan/vaidya-mithra.git
```

## Navigate to Project

```bash
cd vaidya-mithra
```

## Install Dependencies

```bash
npm install
```

## Start Development Server

```bash
npm run dev
```

---

# 🏗️ Build

To create a production build:

```bash
npm run build
```

To preview the production build locally:

```bash
npm run preview
```

---

# 🌐 Deployment

This project is optimized for deployment on:

- Vercel
- Netlify
- Firebase Hosting

Recommended deployment:

```text
Vercel
```

When deploying on Vercel, add all required environment variables in:

```text
Project Settings → Environment Variables
```

After changing environment variables, redeploy the project.

---

# ⚠️ Disclaimer

This application is intended only for educational and informational purposes.

It is NOT a substitute for:

- Professional medical advice
- Diagnosis
- Treatment
- Emergency healthcare services

Always consult a qualified healthcare professional for medical concerns.

In an emergency, contact local emergency services immediately.

---

# 👨‍💻 Team

## Dilip Gowda

- Email: dilipgowda7259@gmail.com
- Contact: 7259447817

## Arya B V

- Email: aryabvarya@gmail.com
- Contact: 8050141198

---

# 📌 Future Enhancements

- Voice-enabled assistant
- Multi-language support
- Document upload for scans and reports
- Patient discharge summaries
- Medicine stock management
- Lab report management
- Billing and invoice generation
- Wearable device integration
- Email reminders before appointment time
- Advanced hospital analytics

---

# 📄 License

Developed and maintained by the Vaidya Mithra Team.

This project is intended for academic and educational purposes only.

All rights reserved © 2026 Vaidya Mithra Team.

---

# ⭐ Support

If you found this project useful, consider giving it a ⭐ on GitHub.
