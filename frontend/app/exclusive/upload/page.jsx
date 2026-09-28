"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearToken } from "@/lib/token";
import { useLanguage } from "@/contexts/LanguageContext";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function ExclusiveUploadPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("video");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [coinPrice, setCoinPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      clearToken();
      router.replace("/login");
      return;
    }

    fetch(`${API_URL}/api/user/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.status === 401) {
          clearToken();
          router.replace("/login");
          return null;
        }
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        if (data.role !== "creator" || data.creatorStatus !== "approved") {
          router.replace("/exclusive");
          return;
        }
        setLoading(false);
      })
      .catch(() => {
        setError(t("exclusiveUpload.verifyAccountError"));
        setLoading(false);
      });
  }, [router, t]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!title.trim() || !mediaUrl.trim()) {
      setError(t("exclusiveUpload.requiredFields"));
      return;
    }

    const parsedPrice = Number(coinPrice);
    if (isNaN(parsedPrice) || parsedPrice < 1) {
      setError(t("exclusiveUpload.minPrice"));
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/login");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/exclusive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          type,
          thumbnailUrl: thumbnailUrl.trim(),
          mediaUrl: mediaUrl.trim(),
          coinPrice: parsedPrice,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || t("exclusiveUpload.publishError"));

      setSuccess(t("exclusiveUpload.publishSuccess"));
      setTimeout(() => router.push(`/exclusive/${data._id}`), 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="upload-page">
        <div className="skeleton" style={{ height: 400, borderRadius: "var(--radius)" }} />
        <style jsx>{`.upload-page { max-width: 600px; margin: 0 auto; }`}</style>
      </div>
    );
  }

  return (
    <div className="upload-page">
      <div className="upload-header">
        <Link href="/exclusive" className="back-link">{t("exclusiveUpload.back")}</Link>
        <h1 className="upload-title">{t("exclusiveUpload.title")}</h1>
        <p className="upload-sub">
          {t("exclusiveUpload.subtitle")}
        </p>
      </div>

      <form className="upload-form card" onSubmit={handleSubmit}>
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <div className="form-group">
          <label className="form-label">
            {t("exclusiveUpload.fieldTitle")} <span className="required">*</span>
          </label>
          <input
            type="text"
            className="form-input"
            placeholder={t("exclusiveUpload.titlePlaceholder")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">{t("exclusiveUpload.fieldDescription")}</label>
          <textarea
            className="form-input form-textarea"
            placeholder={t("exclusiveUpload.descriptionPlaceholder")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
          />
        </div>

        <div className="form-group">
          <label className="form-label">
            {t("exclusiveUpload.fieldType")} <span className="required">*</span>
          </label>
          <select
            className="form-input"
            value={type}
            onChange={(e) => setType(e.target.value)}
            required
          >
            <option value="video">{t("exclusiveUpload.videoOption")}</option>
            <option value="photo">{t("exclusiveUpload.photoOption")}</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">{t("exclusiveUpload.fieldThumbnailUrl")}</label>
          <input
            type="url"
            className="form-input"
            placeholder={t("exclusiveUpload.thumbnailPlaceholder")}
            value={thumbnailUrl}
            onChange={(e) => setThumbnailUrl(e.target.value)}
          />
          <span className="form-hint">{t("exclusiveUpload.thumbnailHint")}</span>
        </div>

        <div className="form-group">
          <label className="form-label">
            {t("exclusiveUpload.fieldContentUrl")} <span className="required">*</span>
          </label>
          <input
            type="url"
            className="form-input"
            placeholder={t("exclusiveUpload.contentUrlPlaceholder")}
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            required
          />
          <span className="form-hint">
            {t("exclusiveUpload.contentUrlHint")}
          </span>
        </div>

        <div className="form-group">
          <label className="form-label">
            {t("exclusiveUpload.fieldPrice")} <span className="required">*</span>
          </label>
          <input
            type="number"
            className="form-input"
            placeholder={t("exclusiveUpload.pricePlaceholder")}
            value={coinPrice}
            onChange={(e) => setCoinPrice(e.target.value)}
            min={1}
            required
          />
          <span className="form-hint">
            {t("exclusiveUpload.priceHint")}
          </span>
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-lg submit-btn"
          disabled={submitting}
        >
          {submitting ? t("exclusiveUpload.publishing") : t("exclusiveUpload.publishButton")}
        </button>
      </form>

      <style jsx>{`
        .upload-page {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          max-width: 600px;
          margin: 0 auto;
        }

        .back-link {
          font-size: 0.875rem;
          color: var(--text-muted);
          text-decoration: none;
          transition: color var(--transition);
          display: inline-flex;
        }
        .back-link:hover {
          color: var(--text);
        }

        .upload-header {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .upload-title {
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--text);
          letter-spacing: -0.02em;
        }

        .upload-sub {
          color: var(--text-muted);
          font-size: 0.875rem;
          line-height: 1.5;
        }

        .upload-sub strong {
          color: #e040fb;
        }

        .upload-form {
          background: rgba(15, 8, 32, 0.7);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 1.75rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .alert {
          padding: 0.75rem 1rem;
          border-radius: var(--radius-sm);
          font-size: 0.875rem;
          font-weight: 600;
        }
        .alert-error {
          background: rgba(244, 67, 54, 0.08);
          border: 1px solid var(--error);
          color: var(--error);
        }
        .alert-success {
          background: rgba(34, 197, 94, 0.08);
          border: 1px solid rgba(34, 197, 94, 0.3);
          color: #4ade80;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .form-label {
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--text);
        }

        .required {
          color: #e040fb;
        }

        .form-input {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text);
          font-size: 0.9rem;
          padding: 0.7rem 1rem;
          transition: border-color var(--transition), box-shadow var(--transition);
          outline: none;
          width: 100%;
          box-sizing: border-box;
        }

        .form-input:focus {
          border-color: rgba(162, 28, 175, 0.5);
          box-shadow: 0 0 0 3px rgba(162, 28, 175, 0.1);
        }

        .form-input::placeholder {
          color: var(--text-dim);
        }

        .form-textarea {
          resize: vertical;
          min-height: 80px;
          font-family: inherit;
        }

        .form-hint {
          font-size: 0.75rem;
          color: var(--text-dim);
          line-height: 1.4;
        }

        .submit-btn {
          align-self: flex-start;
        }
      `}</style>
    </div>
  );
}
