# KIPS-CSB37-Portal — Final Integration Package

Yeh package tumhare latest supplied HTML file ko base bana kar aur pehle wali frontend files ko preserve karte hue integrate kiya gaya hai. Dashboard screenshot se **functionalities** li gayi hain; uska layout/design copy nahi kiya gaya.

## Package structure

```text
KIPS-CSB37-Portal/
├── .env.example
├── Generate-Secrets.ps1
├── Start-Backend.ps1
├── Start-Frontend.ps1
├── README-IMPLEMENTATION.md
├── IMPLEMENTATION-STATUS.md
├── frontend/
│   ├── index.html
│   ├── css/
│   │   ├── style.css
│   │   └── portal-enhancements.css
│   ├── js/
│   │   ├── app.js
│   │   ├── api.js
│   │   ├── auth.js
│   │   ├── portal-enhancements.js
│   │   └── tailwind-config.js
│   └── source-reference/   # supplied source copies for traceability
├── backend/kips-csb37-backend/
│   ├── pom.xml
│   ├── Dockerfile
│   └── src/main/...
└── database/
    ├── schema.sql
    └── migrations/
```

## Important: existing database ka backup pehle lo

Tumhara pehle se `KIPS_CSB37` database aur PostgreSQL container maujood tha. Is liye existing database par `schema.sql` ko bina check/backup ke blindly run mat karna. `CREATE TABLE IF NOT EXISTS` purani table ke missing columns automatically add nahi karta.

Agar database **new/empty** hai, project root se PowerShell mein yeh command chala sakte ho (container/user/database names apne setup ke mutabiq verify karna):

```powershell
cmd /c "docker exec -i kips_csb37_postgres psql -v ON_ERROR_STOP=1 -U kips_owner -d KIPS_CSB37 < database\schema.sql"
```

Agar database pehle se old schema use kar raha hai, pehle uska backup aur current table/column review karo. Existing student/fine records ko preserve karne ke liye required `ALTER TABLE` migration ko us actual schema ke mutabiq review karna zaroori hai. Is package ne tumhare live database par koi query run nahi ki.

## Local setup (Windows PowerShell)

### 1. Environment file

```powershell
Copy-Item .env.example .env
notepad .env
```

`.env` mein apne PostgreSQL credentials set karo. Root `.env` ko kisi ke saath share mat karna. `DB_URL` ka default tumhare pehle wale local mapping `localhost:5433/KIPS_CSB37` ke mutabiq hai.

### 2. Secure secrets generate karo

```powershell
.\Generate-Secrets.ps1
```

Output ki `JWT_SECRET` aur `FIELD_ENCRYPTION_KEY` values root `.env` mein paste karo. Dono values ko stable aur secret rakho. Field encryption key badalne/khone se pehle se encrypted WhatsApp numbers read nahi ho sakte.

`BOOTSTRAP_ADMIN_USERNAME` aur unique `BOOTSTRAP_ADMIN_PASSWORD` bhi `.env` mein set karo. Admin password kam az kam 12 characters ka hona chahiye. Backend startup par configured admin account sirf tab create hota hai jab woh username maujood na ho. Existing admin ka password is setting ko edit karne se reset nahi hota.

### 3. Backend start karo

JDK 17 aur Maven 3.9+ installed hone chahiye:

```powershell
java -version
mvn -version
.\Start-Backend.ps1
```

Health endpoint: `http://localhost:8080/api/health`

`Start-Backend.ps1` root `.env` ko process environment mein load karta hai; Maven command normal taur par `.env` file khud load nahi karta.

### 4. Frontend start karo

Doosri PowerShell window mein project root par:

```powershell
.\Start-Frontend.ps1
```

Browser mein kholo: `http://localhost:5500`

Frontend ko `file://` se direct open na karna. API CORS origins `.env` mein `localhost:5500` aur `127.0.0.1:5500` allowed hain.

## Admin aur student accounts

- Admin account `.env` ke `BOOTSTRAP_ADMIN_USERNAME` aur `BOOTSTRAP_ADMIN_PASSWORD` se create hota hai (agar pehle se nahi hai).
- Admin dashboard se student create karte waqt unique username aur initial password set hota hai. Student password BCrypt se hash hota hai; plaintext database mein save nahi hota.
- Login field username/password use karti hai; old HTML ke example credentials valid credentials nahi hain.
- JWT browser memory mein rehta hai. Page refresh karne par dobara login karna hoga.

## Integrated functionality

### Backend/database
- PostgreSQL entities for students, user accounts, policies, schedules, attendance, leave applications, fines, payments, waivers, appeals, expenses, announcements, per-user read status, private file metadata, WhatsApp statement snapshots and audit records.
- Spring Boot 3 / Java 17 API, BCrypt password hashing, JWT role-based access, student identity scoped from JWT, AES-GCM encrypted WhatsApp number storage.
- Fine occurrence date and record-entry date alag store hoti hain. Fine rate selected occurrence date ki effective policy se resolve hota hai; saved class schedule date-range matching use karta hai.
- Partial payments, receipt references, separate amount-and-reason waivers, cancellation history, audit events and duplicate fine protection. Admin can record a partial payment or a separately approved waiver against the remaining balance.
- Student leave requests with a mandatory server-stored PDF/JPG/PNG proof file (5 MB max), admin approval/rejection and rejection reason.
- Approved leaves attendance mein reflect hoti hain. Applicable Test Week/Saturday/study-leave-limit fines create ho sakte hain; leave approval khud automatic fine waiver nahi karti. Admin Attendance Register se daily present/absent/leave/emergency-leave bhi mark kar sakta hai; configured Test/Study/Saturday policies par matching fines audit ke saath create hote hain.
- Announcement create/edit/publish/unpublish, publish/expiry dates, event details, private attachments and persistent student read state.
- Admin-only JSON database backup endpoint. Password hashes backup mein include nahi hote.

### Frontend
- Latest HTML + existing design baseline preserved; `portal-enhancements.css` light theme ko clean white backgrounds deta hai; dark theme existing navy/gold design par rehti hai.
- Student/fine/payment/expense business records browser `localStorage` mein persist nahi hote. Sirf `kips_theme` preference localStorage mein rehti hai.
- Screenshot se requested dashboard functions: schedule status, WhatsApp Alert navigation, Issue New Fine, Total Students, Fine Records, Total Assessed, Total Paid, Pending Dues, Collection Rate, Pending Leaves and Net Class Fund. Values API/database data se render hote hain. Admin-only Attendance Register date ke hisaab se bulk marking karta hai.
- Admin-only WhatsApp Management with outstanding balance list and full statement preview. WhatsApp Web par message manually review/send hota hai.
- Student leave application and own application status; admin leave review.
- New Updates student/admin views and unread badge.
- Full detailed student statement with fine entries, individual payments, attendance/application counts and financial totals; browser Print dialog se Save as PDF.
- Student WhatsApp number add/edit by admin.
- CSV fine export and server-generated JSON backup.

## Existing fine policy values

Starting policy rows supplied HTML/JS se preserve ki gayi hain: Test absence/leave PKR 200, Study-day absence PKR 150, Saturday absence/leave PKR 500, exceeded study leave PKR 150, late arrival PKR 100, uniform violation PKR 100, mobile usage PKR 300. Monthly study-leave allowance 2 aur marriage leave maximum 3 days proof ke saath. Production use se pehle institution se in values ko verify karna.

## Important scope / deployment notes

- WhatsApp integration abhi manual WhatsApp Web hand-off hai. WhatsApp Business API se automatic message sending is package mein enabled nahi.
- PDF statement browser print workflow se banta hai; server-side PDF rendering engine is package mein configured nahi.
- Private uploaded files `UPLOAD_DIRECTORY` mein DB ke bahar store hote hain. JSON backup unki metadata list deta hai, file bytes nahi. Database backup ke saath `private-uploads` folder ka separate secure backup bhi zaroori hai.
- Fine source mein Normal Week ke liye separate absence/leave fine rate explicitly defined nahi. Attendance Register Normal Week attendance save karta hai lekin us undefined rate ke liye automatic fine invent nahi karta. Normal Week leave allowance/rate ko production se pehle admin/institution-approved policy ke taur par configure karna hoga.
- Login rate limiting, password reset/change-password workflow, MFA, production HTTPS/reverse proxy, automated database backups, malware scanning for uploads and full deployment hardening abhi configure karna baqi hai.
- Fine policy rules user-provided HTML se seed kiye gaye hain; kisi policy interpretation ko institutional approval ke baghair final na samjho.
- Real student data se pehle local environment par schema compatibility, Java build, admin/student role tests, payment/fine rules, file uploads, notices, WhatsApp statement, backup and restore workflow test karna lazmi hai.
