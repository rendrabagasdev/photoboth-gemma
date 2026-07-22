import './App.css'
import { appContainer } from './bootstrap/app-container'
import { BoothApp } from './modules/booth/presentation/booth-app'

export default function App() {
  return <BoothApp container={appContainer} />
}
