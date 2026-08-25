import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Lock, Mail, UserPlus, Users, Building2, LogIn } from "lucide-react";
import api from "../api/api";
import "./Login.css";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  async function handleLogin() {
    try {
      const res = await api.post("/auth/login", {
        email,
        password,
      });

      if (!res.data.success) {
        alert(res.data.message || "Login failed");
        return;
      }

      const user = res.data.user;
      const accessToken = res.data.access_token;

      if (!accessToken) {
        alert("Login succeeded but no authentication token was returned.");
        return;
      }

      sessionStorage.setItem("hpt_user", JSON.stringify(user));
      sessionStorage.setItem("hpt_token", accessToken);

      if (user.role === "facility") {
        navigate("/data-collection");
      } else {
        navigate("/dashboard");
      }
    } catch (error) {
      console.error(error);
      alert("Unable to login. Please try again.");
    }
  }

  return (
    <div className="login-page">
      <div className="login-overlay">
        <header className="login-header">
          <img src="/assets/nakuru-logo.png" alt="Nakuru County Logo" className="county-logo" />
          <h1>NAKURU COUNTY</h1>
          <h2>HPT - Financial Information Monitoring System</h2>
          <p>Healthy People, Prosperous County</p>
        </header>

        <main className="login-content">
          <section className="login-card">
            <h3>Welcome Back!</h3>
            <p className="subtitle">Sign in to continue to your account</p>

            <div className="input-group">
              <Mail size={22} />
              <input
                type="text"
                placeholder="Email or username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="input-group">
              <Lock size={22} />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Eye
                size={22}
                className="right-icon"
                onClick={() => setShowPassword(!showPassword)}
                style={{ cursor: "pointer" }}
              />
            </div>

            <button className="sign-in-btn" onClick={handleLogin}>
              <LogIn size={24} />
              Sign In
            </button>

            <div className="divider" />

            <p className="small-text">Don’t have an account?</p>

            <button
              className="create-account-btn"
              onClick={() => navigate("/register")}
            >
              <UserPlus size={22} />
              Create Account
            </button>

            <button
              className="forgot-btn"
              onClick={() => alert("Password reset will be enabled later.")}
            >
              Forgot your password?
            </button>
          </section>

          <aside className="info-card">
            <h3>Who can use this system?</h3>

            <div className="info-item">
              <Building2 size={34} />
              <div>
                <h4>Facility Users</h4>
                <p>Health facility staff can collect, enter and manage HPT service data.</p>
              </div>
            </div>

            <div className="info-item">
              <Users size={34} />
              <div>
                <h4>County / Sub County Users</h4>
                <p>County and sub county teams can view reports, dashboards and analytics.</p>
              </div>
            </div>

            <div className="green-note">
              Together, we monitor today for a healthier tomorrow.
            </div>
          </aside>
        </main>

        <footer>
          Secure • Confidential • Reliable <br />
          © Nakuru County Health Department. All rights reserved.
        </footer>
      </div>
    </div>
  );
}

export default Login;