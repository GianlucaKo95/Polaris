import React from "react";
import ReactDOM from "react-dom/client";
import "./theme.css";
import App, { ErrorBoundary } from "./App.jsx";
import { VerlassenDialog } from "./components/VerlassenDialog.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
      <VerlassenDialog />
    </ErrorBoundary>
  </React.StrictMode>
);
