import { Bell, Menu, Search } from "lucide-react";
import "./Layout.css";

type TopbarProps = {
  onMenuClick: () => void;
};

function Topbar({ onMenuClick }: TopbarProps) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          type="button"
          className="mobile-menu-btn"
          onClick={onMenuClick}
          aria-label="Open menu"
        >
          <Menu size={24} />
        </button>

        <div className="topbar-title">
          <h1>
            <span className="desktop-title">
              HPT - Financial Information Monitoring System
            </span>

            <span className="mobile-title">
              HPT - FIMS
            </span>
          </h1>

          <p>
            Nakuru County visibility and compliance tracking
          </p>
        </div>
      </div>

      <div className="topbar-actions">
        <div className="search-box">
          <Search size={18} />
          <input placeholder="Search facility..." />
        </div>

        <button className="icon-btn">
          <Bell size={18} />
        </button>
      </div>
    </header>
  );
}

export default Topbar;
