import { Routes, Route } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { AuthProvider } from './context/AuthContext'
import GlobalBackground from './components/GlobalBackground'
import LandingPage from './pages/LandingPage'
import AuthPage from './pages/AuthPage'
import AdminDashboard from './pages/AdminDashboard'
import FacultyDashboard from './pages/FacultyDashboard'
import StudentDashboard from './pages/StudentDashboard'
import VoiceCallPage from './pages/VoiceCallPage'
import ProtectedRoute from './components/ProtectedRoute'
import StudentProfilePage from './pages/StudentProfile'

function App() {
  return (
    <AuthProvider>
      <GlobalBackground />
      <AnimatePresence mode="wait">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/voice-demo" element={<VoiceCallPage />} />
          <Route path="/admin/*" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          } />
          <Route path="/faculty/*" element={
            <ProtectedRoute allowedRoles={['faculty']}>
              <FacultyDashboard />
            </ProtectedRoute>
          } />
          {/* /student/profile must come BEFORE /student/* wildcard */}
          <Route path="/student/profile" element={
            <ProtectedRoute allowedRoles={['student']}>
              <StudentProfilePage />
            </ProtectedRoute>
          } />
          <Route path="/student/*" element={
            <ProtectedRoute allowedRoles={['student']}>
              <StudentDashboard />
            </ProtectedRoute>
          } />
        </Routes>
      </AnimatePresence>
    </AuthProvider>
  )
}

export default App
