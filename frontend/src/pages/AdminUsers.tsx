import { useEffect, useState } from "react";
import api from "../api/api";
import "./AdminUsers.css";

type User = {
  user_id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  facility_name?: string;
  subcounty_name?: string;
  is_active: boolean;
  is_approved: boolean;
  created_at: string;
};

function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const USERS_PER_PAGE = 15;

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredUsers = users.filter((user) => {
    const fullName = `${user.first_name} ${user.last_name}`.toLowerCase();
    const email = user.email.toLowerCase();

    return (
      fullName.includes(normalizedSearch) ||
      email.includes(normalizedSearch)
    );
  });

  const totalPages = Math.max(
    1,
    Math.ceil(filteredUsers.length / USERS_PER_PAGE)
  );

  const safeCurrentPage = Math.min(currentPage, totalPages);

  const startIndex = (safeCurrentPage - 1) * USERS_PER_PAGE;

  const paginatedUsers = filteredUsers.slice(
    startIndex,
    startIndex + USERS_PER_PAGE
  );

  async function loadUsers() {
    try {
      setLoading(true);
      const res = await api.get("/auth/users");
      setUsers(res.data || []);
    } catch (error) {
      console.error(error);
      alert("Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  async function approveUser(userId: number) {
    await api.put(`/auth/users/${userId}/approve`);
    await loadUsers();
  }

  async function deactivateUser(userId: number) {
    await api.put(`/auth/users/${userId}/deactivate`);
    await loadUsers();
  }

  async function activateUser(userId: number) {
    await api.put(`/auth/users/${userId}/activate`);
    await loadUsers();
  }

  async function deleteUser(userId: number) {
    const confirmDelete = window.confirm(
      "Are you sure you want to permanently delete this user?"
    );

    if (!confirmDelete) return;

    await api.delete(`/auth/users/${userId}/delete`);
    await loadUsers();
  }

  if (loading) {
    return <div className="admin-users-page">Loading users...</div>;
  }

  return (
    <div className="admin-users-page">
      <div className="admin-users-header">
        <div>
          <h1>User Management</h1>
          <p>Approve users, manage account status, and review roles.</p>
        </div>

        <button className="refresh-btn" onClick={loadUsers}>
          Refresh
        </button>
      </div>

      <div className="admin-users-toolbar">
        <input
          type="search"
          className="admin-users-search"
          placeholder="Search by name or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        <span className="admin-users-count">
          {filteredUsers.length} user{filteredUsers.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="admin-users-card">
        <table className="admin-users-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Facility / County</th>
              <th>Approved</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {paginatedUsers.map((user) => (
              <tr key={user.user_id}>
                <td>
                  {user.first_name} {user.last_name}
                </td>

                <td>{user.email}</td>

                <td>
                  <span className={`role-badge ${user.role}`}>
                    {user.role}
                  </span>
                </td>

                <td>
                  {user.role === "facility"
                    ? user.facility_name || "-"
                    : user.subcounty_name || "County/National"}
                </td>

                <td>
                  <span
                    className={
                      user.is_approved
                        ? "status-badge approved"
                        : "status-badge pending"
                    }
                  >
                    {user.is_approved ? "Approved" : "Pending"}
                  </span>
                </td>

                <td>
                  <span
                    className={
                      user.is_active
                        ? "status-badge active"
                        : "status-badge inactive"
                    }
                  >
                    {user.is_active ? "Active" : "Inactive"}
                  </span>
                </td>

                <td>
                  {user.created_at
                    ? new Date(user.created_at).toLocaleDateString()
                    : "-"}
                </td>

                <td className="action-cell">
                  {!user.is_approved && (
                    <button
                      className="approve-btn"
                      onClick={() => approveUser(user.user_id)}
                    >
                      Approve
                    </button>
                  )}

                  {user.is_active ? (
                    <button
                      className="deactivate-btn"
                      onClick={() => deactivateUser(user.user_id)}
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      className="activate-btn"
                      onClick={() => activateUser(user.user_id)}
                    >
                      Activate
                    </button>
                  )}

                  <button
                    className="delete-btn"
                    onClick={() => deleteUser(user.user_id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}

            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-state">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filteredUsers.length > 0 && (
        <div className="admin-users-pagination">
          <div className="pagination-summary">
            Showing {startIndex + 1}–
            {Math.min(
              startIndex + USERS_PER_PAGE,
              filteredUsers.length
            )} of {filteredUsers.length}
          </div>

          <div className="pagination-controls">
            <button
              type="button"
              onClick={() =>
                setCurrentPage((page) => Math.max(1, page - 1))
              }
              disabled={safeCurrentPage === 1}
            >
              Previous
            </button>

            <span>
              Page {safeCurrentPage} of {totalPages}
            </span>

            <button
              type="button"
              onClick={() =>
                setCurrentPage((page) =>
                  Math.min(totalPages, page + 1)
                )
              }
              disabled={safeCurrentPage === totalPages}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminUsers;