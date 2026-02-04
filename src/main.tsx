
import { createRoot } from "react-dom/client"
import { App } from "./app"
import "./index.css"

const rootEl = document.getElementById("app")
if (!rootEl) {
  throw new Error("Root element #app not found")
}

createRoot(rootEl).render(<App />)
