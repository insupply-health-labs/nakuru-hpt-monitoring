import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import DataCollection from "./pages/DataCollection";
import MainLayout from "./components/layout/MainLayout";
import Submissions from "./pages/Submissions";
import FacilityTrends from "./pages/FacilityTrends";
import FacilitySHAReporting from "./pages/FacilitySHAReporting";
import Register from "./pages/Register";
import AdminUsers from "./pages/AdminUsers";
import ProtectedRoute from "./components/auth/ProtectedRoute";

import CountyDashboard from "./pages/CountyDashboard";
import CountySHAReporting from "./pages/CountySHAReporting";
import SHAPerformance from "./pages/SHAPerformance";


function Placeholder({ title }: { title: string }) {
  return (
    <div>
      <h2>{title}</h2>
      <p>This page will be built next.</p>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<Navigate to="/login" />} />
        <Route path="/login" element={<Login />} />

        <Route element={<MainLayout />}>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRoles={["county", "admin"]}>
                <CountyDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/data-collection"
            element={
              <ProtectedRoute allowedRoles={["facility", "admin"]}>
                <DataCollection />
              </ProtectedRoute>
            }
          />
          <Route
            path="/submissions"
            element={
              <ProtectedRoute allowedRoles={["county", "admin"]}>
                <Submissions />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/users"
            element={<Navigate to="/admin/users" replace />}
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <Placeholder title="Settings" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/facility-sha-reporting"
            element={
              <ProtectedRoute allowedRoles={["facility", "admin"]}>
                <FacilitySHAReporting />
              </ProtectedRoute>
            }
          />

          <Route
            path="/facilities"
            element={
              <ProtectedRoute
                allowedRoles={["facility", "county", "admin"]}
              >
                <FacilityTrends />
              </ProtectedRoute>
            }
          />
          <Route
            path="/county-sha-reporting"
            element={
              <ProtectedRoute allowedRoles={["county", "admin"]}>
                <CountySHAReporting />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sha-performance"
            element={
              <ProtectedRoute allowedRoles={["county", "admin"]}>
                <SHAPerformance />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <AdminUsers />
              </ProtectedRoute>
            }
          />
          
          
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;