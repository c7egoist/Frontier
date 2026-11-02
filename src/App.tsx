import { LauncherProvider } from './state/launcher'
import Shell from './components/Shell'

export default function App() {
  return (
    <LauncherProvider>
      <Shell />
    </LauncherProvider>
  )
}
