import { useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Lock,
} from "lucide-react";
import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import api from "../api/api";
import "./Login.css";

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get("token") || "";

  const [newPassword, setNewPassword] =
    useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [showPassword, setShowPassword] =
    useState(false);

  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);

  const [submitting, setSubmitting] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [success, setSuccess] =
    useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setMessage("");
    setSuccess(false);

    if (!token) {
      setMessage(
        "This password reset link is invalid."
      );
      return;
    }

    if (newPassword.length < 8) {
      setMessage(
        "Password must be at least 8 characters long."
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage(
        "The passwords do not match."
      );
      return;
    }

    setSubmitting(true);

    try {
      const response = await api.post(
        "/auth/reset-password",
        {
          token,
          new_password: newPassword,
        }
      );

      setSuccess(true);

      setMessage(
        response.data?.message ||
          "Password reset successfully."
      );

      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      console.error(
        "Password reset failed:",
        error
      );

      setMessage(
        error?.response?.data?.detail ||
          "Unable to reset password. Please request a new reset link."
      );
    } finally {
      setSubmitting(false);
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

          <p>
            Healthy People, Prosperous County
          </p>
        </header>

        <main className="login-content">
          <section className="login-card">
            <h3>Reset Password</h3>

            <p className="subtitle">
              Enter and confirm your new password.
            </p>

            {!success && (
              <form onSubmit={handleSubmit}>
                <div className="input-group">
                  <Lock size={22} />

                  <input
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    placeholder="New password"
                    value={newPassword}
                    onChange={(event) =>
                      setNewPassword(
                        event.target.value
                      )
                    }
                    autoComplete="new-password"
                    required
                  />

                  <button
                    type="button"
                    className="right-icon"
                    onClick={() =>
                      setShowPassword(
                        !showPassword
                      )
                    }
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    {showPassword ? (
                      <EyeOff size={22} />
                    ) : (
                      <Eye size={22} />
                    )}
                  </button>
                </div>

                <div className="input-group">
                  <Lock size={22} />

                  <input
                    type={
                      showConfirmPassword
                        ? "text"
                        : "password"
                    }
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(event) =>
                      setConfirmPassword(
                        event.target.value
                      )
                    }
                    autoComplete="new-password"
                    required
                  />

                  <button
                    type="button"
                    className="right-icon"
                    onClick={() =>
                      setShowConfirmPassword(
                        !showConfirmPassword
                      )
                    }
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    {showConfirmPassword ? (
                      <EyeOff size={22} />
                    ) : (
                      <Eye size={22} />
                    )}
                  </button>
                </div>

                <button
                  type="submit"
                  className="sign-in-btn"
                  disabled={submitting}
                >
                  <Lock size={22} />

                  {submitting
                    ? "Resetting..."
                    : "Reset Password"}
                </button>
              </form>
            )}

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

            {success && (
              <button
                type="button"
                className="sign-in-btn"
                onClick={() =>
                  navigate("/login")
                }
              >
                Sign In
              </button>
            )}

            <div className="divider" />

            <button
              type="button"
              className="forgot-btn"
              onClick={() =>
                navigate("/login")
              }
            >
              <ArrowLeft size={16} />
              Back to Login
            </button>
          </section>
        </main>

        <footer>
          Secure • Confidential • Reliable
          <br />
          © Nakuru County Health Department.
          All rights reserved.
        </footer>
      </div>
    </div>
  );
}

export default ResetPassword;
