import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

type Role = "facility" | "county" | "admin";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles: Role[];
}

function ProtectedRoute({
  children,
  allowedRoles,
}: ProtectedRouteProps) {
  const token = sessionStorage.getItem("hpt_token");

  let user: {
    role?: Role;
  } = {};

  try {
    user = JSON.parse(
      sessionStorage.getItem("hpt_user") || "{}"
    );
  } catch {
    user = {};
  }

  if (!token || !user?.role) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    if (user.role === "facility") {
      return (
        <Navigate
          to="/data-collection"
          replace
        />
      );
    }

    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

export default ProtectedRoute;
