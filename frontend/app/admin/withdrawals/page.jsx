"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { clearAdminToken } from "@/lib/token";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const STATUS_LABELS = {
  pending: "Pendiente",
  approved: "Aprobado",
  paid: "Pagado",
  rejected: "Rechazado",
};

const STATUS_COLORS = {
  pending: "badge--yellow",
  approved: "badge--blue",
  paid: "badge--green",
  rejected: "badge--red",
};

function StatusBadge({ status }) {
  return (
    <span className={`badge ${STATUS_COLORS[status] || "badge--gray"}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export default function AdminWithdrawalsPage() {
  const router = useRouter();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [actionLoading, setActionLoading] = useState(null);
  const [actionError, setActionError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

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
        setError("Error cargando solicitudes de retiro.");
        return;
      }

      const data = await res.json();
      setRequests(data.requests || []);
    } catch {
      setError("Error cargando solicitudes de retiro.");
    } finally {
      setLoading(false);
    }
  }, [authHeader, router, statusFilter]);

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
        setActionError(data.message || "Error al aprobar solicitud");
        return;
      }

      setSuccessMessage("Solicitud aprobada exitosamente");
      await loadRequests();
    } catch {
      setActionError("Error al aprobar solicitud");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id) => {
    if (!confirm("¿Estás seguro de rechazar esta solicitud? Las monedas serán devueltas al creador.")) {
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
        setActionError(data.message || "Error al rechazar solicitud");
        return;
      }

      setSuccessMessage("Solicitud rechazada y monedas restauradas");
      await loadRequests();
    } catch {
      setActionError("Error al rechazar solicitud");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <p>Cargando solicitudes de retiro...</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Solicitudes de Retiro</h1>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border rounded-lg"
          >
            <option value="">Todos</option>
            <option value="pending">Pendientes</option>
            <option value="approved">Aprobados</option>
            <option value="rejected">Rechazados</option>
            <option value="paid">Pagados</option>
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
          No hay solicitudes de retiro
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border rounded-lg">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Creador</th>
                <th className="px-4 py-3 text-left font-semibold">Monedas</th>
                <th className="px-4 py-3 text-left font-semibold">USD</th>
                <th className="px-4 py-3 text-left font-semibold">Estado</th>
                <th className="px-4 py-3 text-left font-semibold">Fecha</th>
                <th className="px-4 py-3 text-left font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request._id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div>
                      <div className="font-medium">
                        {request.userId?.username || request.userId?.name || "Sin nombre"}
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
                    <StatusBadge status={request.status} />
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
                          {actionLoading === request._id ? "..." : "Aprobar"}
                        </button>
                        <button
                          onClick={() => handleReject(request._id)}
                          disabled={actionLoading === request._id}
                          className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50 text-sm"
                        >
                          {actionLoading === request._id ? "..." : "Rechazar"}
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
