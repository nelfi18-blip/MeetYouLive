"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { clearAdminToken } from "@/lib/token";
import { useLanguage } from "@/contexts/LanguageContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const STATUS_COLORS = {
  pending: "badge--yellow",
  approved: "badge--blue",
  paid: "badge--green",
  rejected: "badge--red",
};

function StatusBadge({ status, labels }) {
  return (
    <span className={`badge ${STATUS_COLORS[status] || "badge--gray"}`}>
      {labels[status] || status}
    </span>
  );
}

export default function AdminWithdrawalsPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [actionLoading, setActionLoading] = useState(null);
  const [actionError, setActionError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const STATUS_LABELS = {
    pending: t("adminWithdrawals.status.pending"),
    approved: t("adminWithdrawals.status.approved"),
    paid: t("adminWithdrawals.status.paid"),
    rejected: t("adminWithdrawals.status.rejected"),
  };

  const authHeader = useCallback(() => {
    const token = localStorage.getItem("admin_token");
    return { Authorization: `Bearer ${token}` };
  }, []);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError("");
    const token = localStorage.getItem("admin_token");
    if (!token) {
      router.replace("/admin/login");
      return;
    }

    try {
      const url = statusFilter
        ? `${API_URL}/api/admin/withdrawals?status=${statusFilter}`
        : `${API_URL}/api/admin/withdrawals`;
      const res = await fetch(url, { headers: authHeader() });

      if (res.status === 401) {
        clearAdminToken();
        router.replace("/admin/login");
        return;
      }

      if (!res.ok) {
        setError(t("adminWithdrawals.loadError"));
        return;
      }

      const data = await res.json();
      setRequests(data.requests || []);
    } catch {
      setError(t("adminWithdrawals.loadError"));
    } finally {
      setLoading(false);
    }
  }, [authHeader, router, statusFilter, t]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleApprove = async (id) => {
    setActionLoading(id);
    setActionError("");
    setSuccessMessage("");

    try {
      const res = await fetch(`${API_URL}/api/admin/withdrawals/${id}/approve`, {
        method: "PATCH",
        headers: authHeader(),
      });

      if (res.status === 401) {
        clearAdminToken();
        router.replace("/admin/login");
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(data.message || t("adminWithdrawals.approveError"));
        return;
      }

      setSuccessMessage(t("adminWithdrawals.approveSuccess"));
      await loadRequests();
    } catch {
      setActionError(t("adminWithdrawals.approveError"));
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id) => {
    if (!confirm(t("adminWithdrawals.rejectConfirm"))) {
      return;
    }

    setActionLoading(id);
    setActionError("");
    setSuccessMessage("");

    try {
      const res = await fetch(`${API_URL}/api/admin/withdrawals/${id}/reject`, {
        method: "PATCH",
        headers: authHeader(),
      });

      if (res.status === 401) {
        clearAdminToken();
        router.replace("/admin/login");
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(data.message || t("adminWithdrawals.rejectError"));
        return;
      }

      setSuccessMessage(t("adminWithdrawals.rejectSuccess"));
      await loadRequests();
    } catch {
      setActionError(t("adminWithdrawals.rejectError"));
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
      <p>{t("adminWithdrawals.loading")}</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">{t("adminWithdrawals.title")}</h1>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border rounded-lg"
          >
            <option value="">{t("adminWithdrawals.filters.all")}</option>
            <option value="pending">{t("adminWithdrawals.filters.pending")}</option>
            <option value="approved">{t("adminWithdrawals.filters.approved")}</option>
            <option value="rejected">{t("adminWithdrawals.filters.rejected")}</option>
            <option value="paid">{t("adminWithdrawals.filters.paid")}</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="mb-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded">
          {successMessage}
        </div>
      )}

      {actionError && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          {actionError}
        </div>
      )}

      {requests.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          {t("adminWithdrawals.empty")}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border rounded-lg">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">{t("adminWithdrawals.table.creator")}</th>
                <th className="px-4 py-3 text-left font-semibold">{t("adminWithdrawals.table.coins")}</th>
                <th className="px-4 py-3 text-left font-semibold">USD</th>
                <th className="px-4 py-3 text-left font-semibold">{t("adminWithdrawals.table.status")}</th>
                <th className="px-4 py-3 text-left font-semibold">{t("adminWithdrawals.table.date")}</th>
                <th className="px-4 py-3 text-left font-semibold">{t("adminWithdrawals.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request._id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div>
                      <div className="font-medium">
                        {request.userId?.username || request.userId?.name || t("adminWithdrawals.noName")}
                      </div>
                      <div className="text-sm text-gray-500">
                        {request.userId?.email || ""}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    {request.amountCoins.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-semibold text-green-600">
                    ${request.amountUSD.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={request.status} labels={STATUS_LABELS} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(request.createdAt).toLocaleDateString("es-ES", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    {request.status === "pending" && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprove(request._id)}
                          disabled={actionLoading === request._id}
                          className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 text-sm"
                        >
                          {actionLoading === request._id ? "..." : t("adminWithdrawals.actions.approve")}
                        </button>
                        <button
                          onClick={() => handleReject(request._id)}
                          disabled={actionLoading === request._id}
                          className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50 text-sm"
                        >
                          {actionLoading === request._id ? "..." : t("adminWithdrawals.actions.reject")}
                        </button>
                      </div>
                    )}
                    {request.status !== "pending" && (
                      <span className="text-sm text-gray-500">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style jsx>{`
        .badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
        }
        .badge--yellow {
          background-color: #fef3c7;
          color: #92400e;
        }
        .badge--blue {
          background-color: #dbeafe;
          color: #1e40af;
        }
        .badge--green {
          background-color: #d1fae5;
          color: #065f46;
        }
        .badge--red {
          background-color: #fee2e2;
          color: #991b1b;
        }
        .badge--gray {
          background-color: #f3f4f6;
          color: #4b5563;
        }
      `}</style>
    </div>
  );
}
