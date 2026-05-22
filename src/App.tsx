import React, { lazy, Suspense, useEffect, useState } from "react";
import LandingPage from "./pages/LandingPage";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Eula from "./pages/Eula";

// Lazy-load AppWorkspace
const AppWorkspace = lazy(() => import("./AppWorkspace"));

export default function App() {
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname.toLowerCase());

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname.toLowerCase());
    };

    window.addEventListener("popstate", handleLocationChange);
    return () => {
      window.removeEventListener("popstate", handleLocationChange);
    };
  }, []);

  // Determine which page to render
  const cleanPath = currentPath.replace(/\/$/, ""); // remove trailing slash

  if (cleanPath === "/privacy") {
    return <PrivacyPolicy />;
  }

  if (cleanPath === "/eula") {
    return <Eula />;
  }

  if (cleanPath === "/app") {
    return (
      <Suspense
        fallback={
          <div className="min-h-dvh bg-gray-50 flex items-center justify-center">
            <div className="animate-pulse flex flex-col items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 animate-spin">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <p className="text-gray-400 font-medium tracking-tight">Carregando Workspace...</p>
            </div>
          </div>
        }
      >
        <AppWorkspace />
      </Suspense>
    );
  }

  // Default fallback for /, /landing, /landingpage or any other path
  return <LandingPage />;
}
