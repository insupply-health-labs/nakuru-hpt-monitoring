import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, Mail, Send } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../api/api";
import "./Login.css";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [resetUrl, setResetUrl] = useState("");

  const navigate = useNavigate();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!email.trim()) {
      setMessage("Please enter your email address.");
      return;
    }

    setSending(true);
    setMessage("");
    setResetUrl("");

    try {
      const response = await api.post(
        "/auth/forgot-password",
        {
          email: email.trim(),
        }
      );

      setMessage(
        response.data?.message ||
          "If an account exists for that email, a password reset link has been sent."
      );

      // This only appears during local development
      // when PASSWORD_RESET_DEBUG=true.
      if (response.data?.reset_url) {
        setResetUrl(response.data.reset_url);
      }
    } catch (error) {
      console.error(
        "Forgot password request failed:",
        error
      );

      setMessage(
        "Unable to process the request. Please try again."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-overlay">
        <header className="login-header">
          <img
            src="/assets/nakuru-logo.png"
            alt="Nakuru County Logo"
            className="county-logo"
          />

          <h1>NAKURU COUNTY</h1>

          <h2>
            HPT - Financial Information Monitoring System
          </h2>

          <p>Healthy People, Prosperous County</p>
        </header>

        <main className="login-content">
          <section className="login-card">
            <h3>Forgot Password?</h3>

            <p className="subtitle">
              Enter the email address associated with
              your account.
            </p>

            <form onSubmit={handleSubmit}>
              <div className="input-group">
                <Mail size={22} />

                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  autoComplete="email"
                  required
                />
              </div>

              <button
                type="submit"
                className="sign-in-btn"
                disabled={sending}
              >
                <Send size={22} />

                {sending
                  ? "Sending..."
                  : "Send Reset Link"}
              </button>
            </form>

            {message && (
              <p
                className="small-text"
                style={{
                  marginTop: "18px",
                  lineHeight: 1.5,
                }}
              >
                {message}
              </p>
            )}

            {resetUrl && (
              <button
                type="button"
                className="create-account-btn"
                onClick={() => {
                  window.location.href = resetUrl;
                }}
              >
                Open Development Reset Link
              </button>
            )}

            <div className="divider" />

            <button
              type="button"
              className="forgot-btn"
              onClick={() => navigate("/login")}
            >
              <ArrowLeft size={16} />
              Back to Login
            </button>
          </section>
        </main>

        <footer>
          Secure • Confidential • Reliable <br />
          © Nakuru County Health Department. All rights
          reserved.
        </footer>
      </div>
    </div>
  );
}

export default ForgotPassword;
