import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'

import './index.css'
import './tailwind.css'

import Home from './App'
import Process from './Process'

const preloadImages = [
  '/bg_fragment.svg',
  '/bg_print.png',
  '/picto_text.svg',
]

preloadImages.forEach((src) => {
  const img = new Image()
  img.src = src
})

const router = createBrowserRouter([
  {
    path: '/',
    element: <Home />,
  },
  {
    path: '/process',
    element: <Process />,
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)