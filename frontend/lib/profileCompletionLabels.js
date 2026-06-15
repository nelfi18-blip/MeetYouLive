const PROFILE_MISSING_FIELD_LABELS = {
  photo: "foto",
  images: "foto",
  birthdate: "fecha de nacimiento",
  location: "ubicación",
  interests: "intereses",
  intent: "intención",
  interestedIn: "preferencia",
  gender: "preferencia",
  name: "nombre",
};

export function getMissingProfileLabels(missingFields = []) {
  return Array.from(
    new Set(
      missingFields
        .map((field) => PROFILE_MISSING_FIELD_LABELS[field] || field)
        .filter(Boolean)
    )
  );
}
