import React, { lazy, Suspense, useEffect, useState } from "react";
import LandingPage from "./pages/LandingPage";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Eula from "./pages/Eula";
import { fetchLatestVersion, APP_VERSION, VersionConfig } from "./lib/versionCheck";
import { VersionUpdateModal } from "./components/VersionUpdateModal";
import { useAuth } from "./hooks/useAuth";
import { StudioPreviewHelper } from "./components/StudioPreviewHelper";

// Lazy-load AppWorkspace
const AppWorkspace = lazy(() => import("./AppWorkspace"));

export default function App() {
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname.toLowerCase());
  const [updateConfig, setUpdateConfig] = useState<VersionConfig | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    // If we've started with ?source=pwa or are in standalone mode on the root path /,
    // or if the user is already authenticated, automatically and transparently redirect to /app.
    const params = new URLSearchParams(window.location.search);
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    if ((isPWA || params.get('source') === 'pwa' || isAuthenticated === true) && window.location.pathname === '/') {
      console.log("[App] Auto-navigating to /app workspace");
      window.history.replaceState(null, "", "/app");
      setCurrentPath("/app");
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname.toLowerCase());
    };

    window.addEventListener("popstate", handleLocationChange);
    return () => {
      window.removeEventListener("popstate", handleLocationChange);
    };
  }, []);

  // Reusable function to check for app updates
  const checkForAppUpdate = async () => {
    try {
      const config = await fetchLatestVersion();
      if (config) {
        const { latestVersion, forceUpdate } = config;
        if (latestVersion !== APP_VERSION) {
          const ignoredVersion = localStorage.getItem("ignored_app_version");
          if (forceUpdate || ignoredVersion !== latestVersion) {
            setUpdateConfig(config);
            setShowUpdateModal(true);
          }
        }
      }
    } catch (error) {
      console.error("Failed auto version update check:", error);
    }
  };

  useEffect(() => {
    checkForAppUpdate();
  }, []);

  // Determine which page to render
  const cleanPath = currentPath.replace(/\/$/, ""); // remove trailing slash

  const renderPage = () => {
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
                <div className="w-12 h-12 bg-blue-100/60 rounded-2xl flex items-center justify-center text-blue-600 animate-spin">
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
  };

  return (
    <>
      {showUpdateModal && updateConfig && (
        <VersionUpdateModal
          config={updateConfig}
          isOpen={showUpdateModal}
          onClose={() => setShowUpdateModal(false)}
        />
      )}
      {renderPage()}
      <StudioPreviewHelper />
    </>
  );
}

