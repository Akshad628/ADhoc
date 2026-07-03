import { useState, useRef, useEffect } from 'react'
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LayoutDashboard, GraduationCap, FileText, Award, BookOpen, Map, LogOut, Search, Bell, Clock, CheckCircle, Building2, TrendingUp, AlertCircle, Upload, Calendar } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useAnalytics } from '../hooks/useAnalytics'
import toast from 'react-hot-toast'

function StudentHome() {
  const { callsOverTime, loading } = useAnalytics()
  const stats = [
    { label: 'Application status', value: 'Under review', icon: Clock, color: 'text-yellow-400' },
    { label: 'Scholarship match', value: '₹ 80,000 / yr', icon: Award, color: 'text-emerald-400' },
    { label: 'Next deadline', value: '15 Mar', icon: Calendar, color: 'text-purple-400' },
    { label: 'Recommended colleges', value: '8', icon: Building2, color: 'text-cyan-400' },
    { label: 'Semester progress', value: '62%', icon: TrendingUp, color: 'text-emerald-400' },
  ]
  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold text-white mb-1">Student Dashboard</h1><p className="text-zinc-400">Track your admissions, explore scholarships, and plan your academic journey.</p></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
            className="glass rounded-2xl p-5 hover:bg-white/10 transition-all">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                <stat.icon size={20} className={stat.color} />
              </div>
              <p className="text-xs text-zinc-500">{stat.label}</p>
            </div>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
          </motion.div>
        ))}
      </div>
      <div className="glass rounded-2xl p-6">
        <h3 className="font-semibold text-white mb-4">Academic Progress</h3>
        {loading ? (
          <div className="h-48 flex items-center justify-center text-sm text-zinc-500">Loading analytics...</div>
        ) : callsOverTime.length > 0 ? (
          <div className="flex items-end justify-between gap-1 h-48">
            {callsOverTime.slice(-30).map((point, i) => {
              const maxCalls = Math.max(...callsOverTime.map((item) => item.calls), 1)
              const height = `${Math.max((point.calls / maxCalls) * 100, 8)}%`
              return (
                <motion.div key={`${point.date}-${i}`} className="flex-1 bg-gradient-to-t from-emerald-500/80 to-cyan-400/80 rounded-t-lg"
                  initial={{ height: 0 }} animate={{ height }} transition={{ delay: i * 0.02, duration: 0.5 }} />
              )
            })}
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center text-sm text-zinc-500">No analytics available</div>
        )}
      </div>
    </div>
  )
}

function CareerAssistant() {
  const [messages, setMessages] = useState([
    { role: 'agent', text: 'Hello! I am your AI Career Assistant. Tell me about your interests and I will help you find the best career path.' },
    { role: 'user', text: 'I am interested in technology and programming.' },
    { role: 'agent', text: 'Great choice! Based on your interests, I recommend exploring: 1) Computer Science Engineering, 2) Data Science, 3) Artificial Intelligence. Would you like me to suggest colleges for these streams?' },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
}, [messages, loading])

  const sendMessage = async () => {
  if (!input.trim() || loading) return;

  const userMessage = input;

  // Show user's message immediately
  setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
  setInput('');
  setLoading(true);

  try {
    const token = localStorage.getItem('token');

    const response = await fetch('http://localhost:8000/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        message: userMessage,
        session_id: 'career-assistant',
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to get AI response');
    }

    const data = await response.json();

    setMessages(prev => [
      ...prev,
      {
        role: 'agent',
        text: data.response,
      },
    ]);
    setLoading(false);
  } catch (error) {
    console.error(error);

    setLoading(false);

    setMessages(prev => [
      ...prev,
      {
        role: 'agent',
        text: 'Sorry, something went wrong while contacting the AI.',
      },
    ]);

    toast.error('Unable to contact the AI server. Please check your internet or try again.');
  }
};

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold text-white tracking-tight mb-1">Career Assistant</h1>
      <p className="text-zinc-400">Get personalized career guidance from our AI.</p>
      <div className="glass-panel rounded-2xl p-6 h-[500px] flex flex-col border border-white/10 shadow-2xl">
        <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 scrollbar-thin">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] px-4 py-3 rounded-2xl shadow-lg transition-all ${
                msg.role === 'user' 
                  ? 'bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500 text-white rounded-tr-none border border-white/10' 
                  : 'glass-panel text-zinc-200 rounded-tl-none border border-white/10'
              }`}>
                <p className="text-[10px] font-mono font-bold tracking-wider text-purple-400 mb-1.5">{msg.role === 'agent' ? 'AI ASSISTANT' : 'YOU'}</p>
                <p className="text-sm leading-relaxed">{msg.text}</p>
              </div>
            </div>
          ))}
          {/* AI Typing */}
{loading && (
  <div className="flex justify-start">
    <div
      className="max-w-[75%] px-4 py-3 rounded-2xl shadow-lg glass-panel text-zinc-200 rounded-tl-none border border-white/10"
    >
      <p className="text-[10px] font-mono font-bold tracking-wider text-purple-400 mb-1.5">
        AI ASSISTANT
      </p>

      <div className="flex items-center gap-1">
        <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"></span>
        <span
          className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"
          style={{ animationDelay: "0.2s" }}
        ></span>
        <span
          className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"
          style={{ animationDelay: "0.4s" }}
        ></span>
      </div>
    </div>
  </div>
)}
          <div ref={messagesEndRef} />
        </div>
        <div className="flex gap-2">
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Ask about careers, courses, colleges..."
            className="flex-1 bg-white/[0.03] border border-white/10 rounded-xl py-3 px-4 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 hover:border-white/20 transition-all" />
          <button
  onClick={sendMessage}
  disabled={loading}
  className={`px-6 py-3 rounded-xl font-medium transition-all shadow-md border border-white/10 ${
    loading
      ? "bg-zinc-700 cursor-not-allowed opacity-60"
      : "bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500 hover:border-purple-300/30 glow-purple"
  } text-white`}
>
  {loading ? "Thinking..." : "Send"}
</button>
        </div>
      </div>
    </div>
  )
}

function AdmissionsTracker() {
  const stages = [
    { name: 'Application Submitted', status: 'completed', date: 'Jan 15, 2026' },
    { name: 'Document Verification', status: 'completed', date: 'Jan 18, 2026' },
    { name: 'Entrance Exam Score', status: 'completed', date: 'Feb 1, 2026' },
    { name: 'Interview Scheduled', status: 'in-progress', date: 'Mar 10, 2026' },
    { name: 'Final Decision', status: 'pending', date: 'Mar 25, 2026' },
  ]
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white mb-1">Admissions Tracker</h1>
      <p className="text-zinc-400">Track your admission application status in real-time.</p>
      <div className="space-y-4">
        {stages.map((stage) => (
          <div key={stage.name} className="glass rounded-2xl p-5 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${stage.status === 'completed' ? 'bg-emerald-500/20' : stage.status === 'in-progress' ? 'bg-purple-500/20' : 'bg-white/5'}`}>
              {stage.status === 'completed' ? <CheckCircle size={20} className="text-emerald-400" /> : stage.status === 'in-progress' ? <Clock size={20} className="text-purple-400" /> : <AlertCircle size={20} className="text-zinc-500" />}
            </div>
            <div className="flex-1">
              <p className="text-white font-medium">{stage.name}</p>
              <p className="text-sm text-zinc-500">{stage.date}</p>
            </div>
            <span className={`text-xs px-3 py-1 rounded-full ${stage.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : stage.status === 'in-progress' ? 'bg-purple-500/20 text-purple-400' : 'bg-white/5 text-zinc-500'}`}>
              {stage.status === 'completed' ? 'Completed' : stage.status === 'in-progress' ? 'In Progress' : 'Pending'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Scholarships() {
  const scholarships = [
    { name: 'Merit Scholarship', amount: '₹ 80,000/year', eligibility: '90%+ in 12th', deadline: 'Mar 31, 2026', status: 'Eligible' },
    { name: 'Minority Scholarship', amount: '₹ 50,000/year', eligibility: 'Minority community', deadline: 'Apr 15, 2026', status: 'Eligible' },
    { name: 'Sports Quota', amount: '₹ 40,000/year', eligibility: 'National level player', deadline: 'Apr 30, 2026', status: 'Check Eligibility' },
    { name: 'Research Fellowship', amount: '₹ 1,20,000/year', eligibility: 'JEE Advanced rank < 5000', deadline: 'May 15, 2026', status: 'Not Eligible' },
  ]
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white mb-1">Scholarships</h1>
      <p className="text-zinc-400">Find and apply for scholarships.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {scholarships.map((s, i) => (
          <motion.div key={s.name} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
            className="glass rounded-2xl p-5 hover:bg-white/10 transition-all">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-white">{s.name}</h3>
              <span className={`text-xs px-2 py-1 rounded-full ${s.status === 'Eligible' ? 'bg-emerald-500/20 text-emerald-400' : s.status === 'Check Eligibility' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>{s.status}</span>
            </div>
            <p className="text-2xl font-bold text-purple-400 mb-2">{s.amount}</p>
            <p className="text-sm text-zinc-400 mb-1">Eligibility: {s.eligibility}</p>
            <p className="text-sm text-zinc-500">Deadline: {s.deadline}</p>
            <button className="mt-4 w-full py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm text-white transition-all">Apply Now</button>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function Documents() {
  const docs = [
    { name: '10th Marksheet', status: 'Uploaded', size: '2.4 MB', date: 'Jan 15, 2026' },
    { name: '12th Marksheet', status: 'Uploaded', size: '3.1 MB', date: 'Jan 15, 2026' },
    { name: 'JEE Score Card', status: 'Uploaded', size: '1.8 MB', date: 'Feb 2, 2026' },
    { name: 'Aadhaar Card', status: 'Pending', size: '-', date: '-' },
    { name: 'Income Certificate', status: 'Pending', size: '-', date: '-' },
  ]
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white mb-1">Documents</h1>
      <p className="text-zinc-400">Manage your academic documents.</p>
      <div className="glass rounded-2xl p-12 text-center border border-dashed border-white/20 mb-6">
        <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mx-auto mb-4"><Upload size={24} className="text-zinc-400" /></div>
        <h3 className="font-semibold text-white mb-2">Upload documents</h3>
        <p className="text-sm text-zinc-400 mb-4">PDF, JPG, PNG up to 10 MB</p>
        <button className="px-6 py-2.5 bg-white text-black rounded-full text-sm font-medium hover:bg-zinc-100 transition-all">Select Files</button>
      </div>
      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead><tr className="text-xs text-zinc-500 border-b border-white/10">
            <th className="text-left px-6 py-3 font-medium">NAME</th>
            <th className="text-left px-6 py-3 font-medium">SIZE</th>
            <th className="text-left px-6 py-3 font-medium">DATE</th>
            <th className="text-left px-6 py-3 font-medium">STATUS</th>
          </tr></thead>
          <tbody>
            {docs.map((d, i) => (
              <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                <td className="px-6 py-4 text-sm text-white flex items-center gap-2"><FileText size={16} className="text-zinc-500" />{d.name}</td>
                <td className="px-6 py-4 text-sm text-zinc-400\">{d.size}</td>
                <td className="px-6 py-4 text-sm text-zinc-400\">{d.date}</td>
                <td className="px-6 py-4"><span className={`text-xs px-2.5 py-1 rounded-full ${d.status==='Uploaded'?'bg-emerald-500/20 text-emerald-400':'bg-yellow-500/20 text-yellow-400'}`}>{d.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Roadmap() {
  const milestones = [
    { semester: 'Semester 1', courses: ['Programming Fundamentals', 'Mathematics I', 'Physics', 'Communication Skills'], completed: true },
    { semester: 'Semester 2', courses: ['Data Structures', 'Mathematics II', 'Digital Electronics', 'Environmental Science'], completed: true },
    { semester: 'Semester 3', courses: ['Algorithms', 'Database Systems', 'Computer Networks', 'Web Development'], completed: false },
    { semester: 'Semester 4', courses: ['Operating Systems', 'Software Engineering', 'Machine Learning Basics', 'Cloud Computing'], completed: false },
    { semester: 'Semester 5', courses: ['AI & Deep Learning', 'Big Data Analytics', 'Cybersecurity', 'Internship'], completed: false },
    { semester: 'Semester 6', courses: ['Capstone Project', 'Industry Training', 'Placement Preparation'], completed: false },
  ]
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white mb-1">Academic Roadmap</h1>
      <p className="text-zinc-400">Your personalized academic journey from admission to placement.</p>
      <div className="space-y-4">
        {milestones.map((m, i) => (
          <motion.div key={m.semester} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
            className="glass rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${m.completed ? 'bg-emerald-500/20' : 'bg-purple-500/20'}`}>
                {m.completed ? <CheckCircle size={16} className="text-emerald-400" /> : <Map size={16} className="text-purple-400" />}
              </div>
              <h3 className="font-semibold text-white">{m.semester}</h3>
              {m.completed && <span className="text-xs text-emerald-400 ml-auto">Completed</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {m.courses.map(c => (
                <span key={c} className="px-3 py-1 rounded-full text-xs bg-white/5 text-zinc-300">{c}</span>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

export default function StudentDashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const handleLogout = () => { logout(); toast.success('Signed out successfully'); navigate('/') }
  const navItems = [
    { path: '/student', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/student/career', label: 'Career Assistant', icon: GraduationCap },
    { path: '/student/admissions', label: 'Admissions Tracker', icon: FileText },
    { path: '/student/scholarships', label: 'Scholarships', icon: Award },
    { path: '/student/documents', label: 'Documents', icon: BookOpen },
    { path: '/student/roadmap', label: 'Roadmap', icon: Map },
  ]
  return (
    <div className="min-h-screen bg-transparent flex">
      <aside className="w-64 glass-panel border-r border-white/10 flex flex-col backdrop-blur-2xl">
        <div className="p-6">
          <Link to="/" className="flex items-center gap-2 group w-fit">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-cyan-400 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
              <span className="text-white font-bold text-sm">A</span>
            </div>
            <span className="font-extrabold text-lg text-white">ADhoc<span className="text-gradient-neon font-black">.ai</span></span>
          </Link>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => (
            <Link key={item.path} to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                location.pathname === item.path 
                  ? 'bg-gradient-to-r from-purple-500/15 to-cyan-500/5 border border-purple-500/25 text-white shadow-lg shadow-purple-500/5' 
                  : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
              }`}>
              <item.icon size={18} />{item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10">
          <div className="glass-panel rounded-xl p-4 mb-4 border border-white/5 bg-white/[0.01]">
            <p className="text-[10px] text-zinc-500 mb-1 font-mono tracking-wider">SIGNED IN</p>
            <p className="text-sm text-white truncate font-medium">{user?.email}</p>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-all w-full text-left">
            <LogOut size={18} />Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 flex flex-col">
        <header className="h-16 glass-panel border-b border-white/10 flex items-center justify-between px-6">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input type="text" placeholder="Search courses, scholarships..."
                className="w-full bg-white/[0.03] border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 hover:border-white/20 transition-all" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white border border-white/5 transition-all relative">
              <Bell size={18} /><span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </button>
            <button onClick={() => navigate('/student/profile')} className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-400 flex items-center justify-center text-white font-extrabold text-sm shadow-md hover:scale-105 active:scale-95 transition-transform" title="My Profile">
              {user?.full_name?.[0] || user?.email?.[0] || 'S'}
            </button>
          </div>
        </header>
        <div className="flex-1 p-6 overflow-auto bg-transparent">
          <Routes>
            <Route path="/" element={<StudentHome />} />
            <Route path="/career" element={<CareerAssistant />} />
            <Route path="/admissions" element={<AdmissionsTracker />} />
            <Route path="/scholarships" element={<Scholarships />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/roadmap" element={<Roadmap />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}