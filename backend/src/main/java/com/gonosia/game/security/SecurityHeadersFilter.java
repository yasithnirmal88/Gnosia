package com.gonosia.game.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Hardened security headers for the API surface. Applied to every response,
 * including WebSocket handshakes, when the prod/staging profile is active.
 *
 * <p>The backend itself only serves JSON + WebSocket frames, so its CSP is
 * deliberately minimal. The nginx/Vercel configuration serves the HTML app and
 * carries the full site CSP (inline styles, WebRTC, SockJS transports, fonts).
 */
public class SecurityHeadersFilter extends OncePerRequestFilter {

    public static final String CSP =
            "default-src 'none'; frame-ancestors 'self'; base-uri 'self'; connect-src 'self' ws: wss:";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        response.setHeader("Content-Security-Policy", CSP);
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
        response.setHeader("X-Frame-Options", "SAMEORIGIN");
        // 2 years; includeSubDomains but not `preload` (preload is an explicit,
        // irreversible enrollment decision the operator makes on purpose).
        response.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
        // WebRTC is the only ambient capability the game uses — keep it self-scoped.
        response.setHeader("Permissions-Policy",
                "camera=(self), microphone=(self), display-capture=(self), gamepad=(self)");
        filterChain.doFilter(request, response);
    }
}