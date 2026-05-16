// The root path now renders the real login page directly, removing the
// previous intermediate "Entrar ahora / Crear cuenta" landing screen.
// Authenticated users are redirected by the login page itself (and by
// middleware.js for SSR) to /admin or /feed.
export { default } from "./login/page";
