import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const dashboards = [
  {
    role: 'admin',
    label: 'Admin',
    color: 'from-purple-600 to-purple-400',
    stats: [
      { l: 'Live conversations', v: '147' },
      { l: 'Applications today', v: '+218' },
      { l: 'Avg. call duration', v: '3m 42s' },
      { l: 'Knowledge documents', v: '1,284' }
    ],
    sidebar: [
      'Admissions funnel',
      'Knowledge uploads',
      'Prompt management',
      'Voice AI',
      'Telephony'
    ],
    chart: true
  },

  {
    role: 'faculty',
    label: 'Faculty',
    color: 'from-cyan-600 to-cyan-400',
    stats: [
      { l: 'Next class', v: 'Algorithms • 10:30' },
      { l: 'Attendance %', v: '94%' },
      { l: 'Pending assignments', v: '12' },
      { l: 'Students at risk', v: '3' },
      { l: 'Office hours', v: '4-6pm' }
    ],
    sidebar: [
      'Classes',
      'Attendance',
      'Meetings',
      'Assignments',
      'Analytics'
    ],
    chart: true
  },

  {
    role: 'student',
    label: 'Student',
    color: 'from-emerald-600 to-emerald-400',
    stats: [
      { l: 'Application status', v: 'Under review' },
      { l: 'Scholarship match', v: '₹ 80,000 / yr' },
      { l: 'Next deadline', v: '15 Mar' },
      { l: 'Recommended colleges', v: '8' },
      { l: 'Semester progress', v: '62%' }
    ],
    sidebar: [
      'Career assistant',
      'Admissions tracker',
      'Scholarships',
      'Documents',
      'Roadmap'
    ],
    chart: true
  }
]

export default function DashboardShowcase() {
  const [activeRole, setActiveRole] = useState(0)
  const dashboard = dashboards[activeRole]
  return (
    <section id="about" className="py-32 relative">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
          <p className="text-purple-400 text-sm font-medium tracking-widest mb-4">THREE ROLES, ONE ECOSYSTEM</p>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">Built for everyone who runs the <span className="text-gradient">institution.</span></h2>
        </motion.div>
        <div className="flex justify-center mb-12">
          <div className="glass rounded-full p-1 flex gap-1">
            {dashboards.map((d, i) => (
              <button key={d.role} onClick={() => setActiveRole(i)}
                className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all ${
                  i === activeRole ? 'bg-gradient-to-r ' + d.color + ' text-white shadow-lg' : 'text-zinc-400 hover:text-white'
                }`}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={dashboard.role} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}
            className="glass rounded-3xl p-6 border border-white/10">
            <div className="flex items-center gap-2 mb-6 pb-4 border-b border-white/10">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
              </div>
              <div className="flex-1 mx-4">
                <div className="glass rounded-lg px-4 py-1.5 text-xs text-zinc-500 text-center">adhoc.ai / {dashboard.role}</div>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-1">
                <p className="text-xs text-zinc-500 font-medium tracking-wider mb-4 uppercase">
                  {dashboard.role === 'admin' ? 'AI Control Center' : dashboard.role === 'faculty' ? 'Today, at a glance' : 'Your AI Mentor'}
                </p>
                {dashboard.sidebar.map((item) => (
                  <div key={item} className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-zinc-300 hover:bg-white/5 transition-colors cursor-pointer">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />{item}
                  </div>
                ))}
              </div>
              <div className="lg:col-span-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                  {dashboard.stats.map((stat) => (
                    <div key={stat.l} className="glass rounded-2xl p-4 hover:bg-white/10 transition-all">
                      <p className="text-xs text-zinc-500 mb-1">{stat.l}</p>
                      <p className="text-xl font-bold text-white">{stat.v}</p>
                    </div>
                  ))}
                </div>
                {dashboard.chart && (
                  <div className="glass rounded-2xl p-6 h-48 flex items-end justify-between gap-1">
                    {[...Array(30)].map((_, i) => (
                      <motion.div key={i} className="flex-1 bg-gradient-to-t from-purple-500/60 to-cyan-400/60 rounded-t-lg"
                        initial={{ height: 0 }} animate={{ height: `${20 + Math.random() * 80}%` }} transition={{ delay: i * 0.03, duration: 0.5 }} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}
