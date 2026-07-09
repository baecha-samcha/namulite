import { AuthProvider, useAuth } from "./auth/AuthContext";
import { AuthPage } from "./pages/AuthPage";
import { WikiPage } from "./pages/WikiPage";
import "./styles.css";

function AppContent() {
  const { user, loading } = useAuth();
  if (loading) return <main className="loading-screen">Wikindle</main>;
  return user ? <WikiPage /> : <AuthPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}