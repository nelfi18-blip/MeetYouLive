// Root entry point.
//
// Renders the existing login experience directly so that:
//   - Logged-out visitors see the real login form (Google, email, password,
//     register link) without an intermediate CTA landing page.
//   - Already authenticated regular users are redirected to /feed by the
//     login form's own session handling.
//   - Already authenticated admin users are redirected to /admin by the
//     login form's own session handling.
//
// The previous "Entrar ahora / Crear cuenta" CTA landing has been removed.
// We reuse the /login page component instead of duplicating auth logic.
export { default } from "./login/page";
