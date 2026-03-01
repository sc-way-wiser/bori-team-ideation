import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { CircleNotchIcon as Loader2Icon } from "@phosphor-icons/react";
import { AuthProvider, useAuth } from "./contexts/AuthContext.jsx";
import Layout from "./components/Layout/Layout.jsx";
import SignIn from "./components/Auth/SignIn.jsx";
import ServiceWorkerUpdater from "./components/ServiceWorkerUpdater.jsx";

function EveningThemeSync() {
  useEffect(() => {
    const sync = () => {
      const isEvening = new Date().getHours() >= 18;
      document.documentElement.toggleAttribute("data-evening", isEvening);
    };
    sync();
    const id = setInterval(sync, 60_000);
    return () => clearInterval(id);
  }, []);
  return null;
}

const ProtectedRoute = ({ children }) => {
  const { session, isAuthLoading } = useAuth();

  if (isAuthLoading) {
    return (
      <div
        className="h-screen flex items-center justify-center gap-2"
        style={{
          backgroundColor: "var(--color-background)",
          color: "var(--color-text-muted)",
        }}
      >
        <Loader2Icon size={20} className="animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }

  if (!session) return <Navigate to="/signin" replace />;
  return children;
};

const PublicRoute = ({ children }) => {
  const { session, isAuthLoading } = useAuth();

  if (isAuthLoading) {
    return (
      <div
        className="h-screen flex items-center justify-center gap-2"
        style={{
          backgroundColor: "var(--color-background)",
          color: "var(--color-text-muted)",
        }}
      >
        <Loader2Icon size={20} className="animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }

  if (session) return <Navigate to="/notes" replace />;
  return children;
};

function App() {
  return (
    <AuthProvider>
      <EveningThemeSync />
      <ServiceWorkerUpdater />
      <BrowserRouter>
        <Routes>
          <Route
            path="/signin"
            element={
              <PublicRoute>
                <SignIn />
              </PublicRoute>
            }
          />
          <Route
            path="/notes"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/notes" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
