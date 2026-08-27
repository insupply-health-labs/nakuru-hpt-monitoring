import type React from "react";
import {
  LayoutDashboard,
  ClipboardList,
  FileText,
  Building2,
  Settings,
  LogOut,
  BarChart3,
  Users,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import "./Layout.css";

function Sidebar() {
  const navigate = useNavigate();

  const user = JSON.parse(sessionStorage.getItem("hpt_user") || "{}");
  const role = user?.role || "facility";

  const menuItems: {
  label: string;
  path: string;
  icon: React.ElementType;
}[] = [];

  // Facility User
  // Facility User
if (role === "facility") {
  menuItems.push(
    { label: "Data Collection", path: "/data-collection", icon: ClipboardList },
    { label: "SHA Reporting", path: "/facility-sha-reporting", icon: BarChart3 },
    { label: "Facility Trends", path: "/facilities", icon: Building2 }
  );
}

// County User
if (role === "county") {
  menuItems.push(
    { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { label: "Submissions", path: "/submissions", icon: FileText },
    { label: "County SHA Reporting", path: "/county-sha-reporting", icon: BarChart3 },
    { label: "SHA Performance", path: "/sha-performance", icon: BarChart3 },
    { label: "Facility Trends", path: "/facilities", icon: Building2 }
    
  );
}

// Admin User
if (role === "admin") {
  menuItems.push(
    { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { label: "Data Collection", path: "/data-collection", icon: ClipboardList },
    { label: "Submissions", path: "/submissions", icon: FileText },
    { label: "Facility Trends", path: "/facilities", icon: Building2 },
    { label: "County SHA Reporting", path: "/county-sha-reporting", icon: BarChart3 },
    { label: "SHA Performance", path: "/sha-performance", icon: BarChart3 },
    { label: "User Management", path: "/admin/users", icon: Users },
    { label: "Settings", path: "/settings", icon: Settings }
    
  );
}

  function handleLogout() {
    sessionStorage.removeItem("hpt_token");
    sessionStorage.removeItem("hpt_user");
    navigate("/login");
  }

  const initials =
    `${user?.first_name?.[0] || ""}${user?.last_name?.[0] || ""}`.toUpperCase();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img src="/assets/nakuru-logo.png" alt="Nakuru County" />
        <div>
          <h2>Nakuru County</h2>
          <p>HPT - FIMS
Financial Information Monitoring System</p>
        </div>
      </div>

      <nav className="sidebar-menu">
        {menuItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                isActive ? "sidebar-link active" : "sidebar-link"
              }
            >
              <Icon size={19} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="user-box">
          <div className="avatar">{initials || "U"}</div>
          <div>
            <strong>
              {user?.first_name} {user?.last_name}
            </strong>
            <p>{role}</p>
          </div>
        </div>

        <button className="logout-btn" onClick={handleLogout}>
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;