import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import "./Layout.css";

function MainLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="app-shell">
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      <div
        className={
          mobileMenuOpen
            ? "mobile-sidebar-backdrop show"
            : "mobile-sidebar-backdrop"
        }
        onClick={() => setMobileMenuOpen(false)}
      />

      <main className="main-area">
        <Topbar
          onMenuClick={() => setMobileMenuOpen(true)}
        />

        <section className="page-content">
          <Outlet />
        </section>
      </main>
    </div>
  );
}

export default MainLayout;
