import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { HomePage } from '@/pages/HomePage'
import { MaterialsPage } from '@/pages/MaterialsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { JDPage } from '@/pages/JDPage'
import { ResumePage } from '@/pages/ResumePage'
import { InterviewPage } from '@/pages/InterviewPage'
import { settingsRepository } from '@/storage'
import { ThemeMode } from '@/types'
import { MaterialsProvider } from '@/context/MaterialsContext'

function App() {
  const [theme, setTheme] = useState<ThemeMode>('light')
  useEffect(() => {
    void settingsRepository.get().then((settings) => setTheme(settings.theme)).catch((error) => console.error('[Storage] settings read failed', error))
  }, [])
  useEffect(() => {
    const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
  }, [theme])

  return <MaterialsProvider><Layout theme={theme} onThemeChange={setTheme}>
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/materials" element={<MaterialsPage />} />
      <Route path="/settings" element={<SettingsPage onThemeChange={setTheme} />} />
      <Route path="/jd" element={<JDPage />} />
      <Route path="/resume" element={<ResumePage />} />
      <Route path="/interview" element={<InterviewPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </Layout></MaterialsProvider>
}

export default App
