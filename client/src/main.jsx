import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import '@fontsource-variable/nunito'
import App from './App.jsx'

const vietnameseGlyphs = 'ă â ê ô ơ ư đ Ă Â Ê Ô Ơ Ư Đ á à ả ã ạ ấ ầ ẩ ẫ ậ ế ề ể ễ ệ ố ồ ổ ỗ ộ ớ ờ ở ỡ ợ ứ ừ ử ữ ự'
const renderApp = () => createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

void Promise.all([
  document.fonts.load('400 16px "Nunito Variable"', vietnameseGlyphs),
  document.fonts.load('700 16px "Nunito Variable"', vietnameseGlyphs),
]).catch(() => []).then(renderApp)
