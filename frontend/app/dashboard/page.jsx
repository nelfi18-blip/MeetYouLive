if (session?.backendToken) {
  localStorage.setItem("token", session.backendToken);
} else {
  localStorage.removeItem("token");
}

const token = localStorage.getItem("token");

if (!token) {
  window.location.href = "/login";
  return;
}
