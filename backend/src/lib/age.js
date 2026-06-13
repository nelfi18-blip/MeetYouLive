const calculateAge = (birthdate, now = new Date()) => {
  if (!birthdate) return null;
  const date = birthdate instanceof Date ? birthdate : new Date(birthdate);
  if (Number.isNaN(date.getTime())) return null;
  let age = now.getFullYear() - date.getFullYear();
  const monthDelta = now.getMonth() - date.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < date.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
};

module.exports = {
  calculateAge,
};
