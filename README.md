# ⚡ TaskFlow — Team Task Manager

A full-stack web application for managing team projects and tasks with role-based access control.

**Live Demo:** [Your Railway URL here]  
**Demo Video:** [Your Loom/YouTube link here]  
**GitHub Repo:** https://github.com/thanusree2/Taskflow

---

## 🚀 Features

- **Authentication** — Signup/Login with JWT tokens, 7-day sessions
- **Role-Based Access** — Global Admin vs Member roles + per-project Admin/Member roles
- **Project Management** — Create projects, invite team members, set roles
- **Task Management** — Create, assign, track tasks with status (To Do / In Progress / Done) and priority (Low / Medium / High)
- **Dashboard** — Stats overview, my tasks, project progress bars, overdue highlights
- **Filters** — Filter tasks by status and priority
- **Overdue Detection** — Automatic highlighting of past-due tasks

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js + Express |
| Database | SQLite (via better-sqlite3) |
| Auth | JWT + bcryptjs |
| Validation | express-validator |
| Frontend | Vanilla JS SPA (no framework) |
| Deployment | Railway |

---

## ⚙️ Local Setup

### Prerequisites
- Node.js 18+
- npm

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/taskflow.git
cd taskflow

# 2. Install backend dependencies
cd backend
npm install

# 3. Set up environment
cp .env.example .env
# Edit .env and set a strong JWT_SECRET

# 4. Start the server
npm start
# OR for development with auto-reload:
npm run dev
```

Open `http://localhost:3000` — the backend serves the frontend too!

---

## 🌐 Deploy to Railway (Step by Step)

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit — TaskFlow"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/taskflow.git
git push -u origin main
```

### 2. Deploy on Railway

1. Go to [railway.app](https://railway.app) → **New Project**
2. Click **Deploy from GitHub repo**
3. Select your `taskflow` repository
4. Railway will auto-detect the config and deploy

### 3. Set Environment Variables on Railway

In your Railway project → **Variables** tab, add:

```
JWT_SECRET=your_super_secret_key_minimum_32_characters_long
PORT=3000
```

Railway automatically sets `PORT`, but set it explicitly to be safe.

### 4. Get Your Live URL

Railway → **Settings** → **Domains** → Generate a domain  
Your app will be live at `https://taskflow-production-XXXX.up.railway.app`

---

## 📡 API Endpoints

### Auth
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/signup` | Create account | ❌ |
| POST | `/api/auth/login` | Login | ❌ |
| GET | `/api/auth/me` | Current user | ✅ |
| GET | `/api/auth/users` | All users | ✅ |

### Projects
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/projects` | List projects | ✅ |
| POST | `/api/projects` | Create project | ✅ |
| GET | `/api/projects/:id` | Project details + members + tasks | ✅ Member |
| PUT | `/api/projects/:id` | Update project | ✅ Project Admin |
| DELETE | `/api/projects/:id` | Delete project | ✅ Project Admin |
| POST | `/api/projects/:id/members` | Add member | ✅ Project Admin |
| DELETE | `/api/projects/:id/members/:userId` | Remove member | ✅ Project Admin |

### Tasks
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/projects/:projectId/tasks` | List tasks | ✅ Member |
| POST | `/api/projects/:projectId/tasks` | Create task | ✅ Member |
| GET | `/api/tasks/:id` | Task detail | ✅ Member |
| PUT | `/api/tasks/:id` | Update task | ✅ Member* |
| DELETE | `/api/tasks/:id` | Delete task | ✅ Admin/Creator |
| GET | `/api/dashboard` | Dashboard stats | ✅ |

*Members can only update status of their assigned tasks; project admins have full edit access.

---

## 🔐 Role-Based Access Control

### Global Roles
- **Admin** — Can see all projects, access everything
- **Member** — Can only see projects they're members of

### Project-Level Roles
- **Project Admin** — Can create tasks, add/remove members, edit project
- **Project Member** — Can view tasks, update status of assigned tasks

---

## 📂 Project Structure

```
taskflow/
├── backend/
│   ├── db/
│   │   └── database.js      # SQLite setup + schema
│   ├── middleware/
│   │   └── auth.js          # JWT + RBAC middleware
│   ├── routes/
│   │   ├── auth.js          # Auth endpoints
│   │   ├── projects.js      # Project + member endpoints
│   │   └── tasks.js         # Task + dashboard endpoints
│   ├── server.js            # Express app entry point
│   └── package.json
├── frontend/
│   ├── css/
│   │   └── style.css        # Complete styles
│   ├── js/
│   │   └── app.js           # Single-page app logic
│   └── index.html           # SPA shell
├── railway.toml             # Railway deployment config
├── nixpacks.toml            # Build config
└── README.md
```

---

## 🎥 Demo Video Script (2-5 min)

1. **Intro** (20s) — "This is TaskFlow, a team task manager with role-based access"
2. **Sign Up as Admin** (30s) — Show signup with Admin role
3. **Create a Project** (30s) — Create "Website Redesign" project
4. **Add Tasks** (45s) — Create 3 tasks with different priorities and due dates
5. **Sign Up as Member** (30s) — Open incognito, create a member account
6. **Admin adds Member** (30s) — Go back to admin, add the member to the project
7. **Member view** (30s) — Show member sees only their project, can update task status
8. **Dashboard** (30s) — Show stats: total tasks, overdue, progress bars
9. **Outro** (15s) — Show the Railway live URL

---

## 🧪 Test Credentials (create these after deploying)

Create an admin account first via signup, then create a member account to demo the RBAC.

---

## 📝 License

MIT
