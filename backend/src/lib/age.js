const calculateAge = (birthdate, now) => {
  if (!birthdate) return null;
  const date = birthdate instanceof Date ? birthdate : new Date(birthdate);
  if (Number.isNaN(date.getTime())) return null;
  const referenceDate = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(referenceDate.getTime())) return null;
  let age = referenceDate.getFullYear() - date.getFullYear();
  const monthDelta = referenceDate.getMonth() - date.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && referenceDate.getDate() < date.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
};

module.exports = {
  calculateAge,
};
