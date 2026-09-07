package com.gonosia.game.security;

import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.util.StringUtils;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.util.Map;

/**
 * Captures the remote client address at WebSocket handshake time and stores it on
 * the WebSocket session, where {@link SessionIdentityService} reads it on
 * {@code CONNECT} for IP-scoped rate limiting.
 *
 * <p><strong>Proxy handling:</strong> when the app is fronted by a reverse proxy /
 * load balancer (e.g. Render), the direct TCP peer is the proxy address and is the
 * <em>same for every user</em>. In that topology the real client address is taken
 * from the {@code X-Forwarded-For} header — this interceptor uses the first entry
 * when present (a single trusted proxy hop), and only falls back to the direct
 * peer address otherwise. Deployments behind a proxy must ensure the proxy strips
 * client-supplied {@code X-Forwarded-For} values; depending on that header blindly
 * would let a client impersonate an arbitrary IP and bypass IP-scoped limits.
 */
public class ClientIpHandshakeInterceptor implements HandshakeInterceptor {

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
            WebSocketHandler wsHandler, Map<String, Object> attributes) {
        String ip = forwardedIp(request);
        if (ip == null) {
            ip = directPeerIp(request);
        }
        if (ip != null) {
            attributes.put(SessionIdentityService.CLIENT_IP_ATTRIBUTE, ip);
        }
        return true;
    }

    private String forwardedIp(ServerHttpRequest request) {
        String forwarded = request.getHeaders().getFirst("X-Forwarded-For");
        if (!StringUtils.hasText(forwarded)) {
            return null;
        }
        // X-Forwarded-For: "client, proxy1, proxy2" — take the first entry.
        String[] parts = forwarded.split(",");
        String candidate = parts[0].trim();
        if (parts.length == 1 && StringUtils.hasText(candidate)) {
            return candidate;
        }
        return null;
    }

    private String directPeerIp(ServerHttpRequest request) {
        InetSocketAddress remote = request.getRemoteAddress();
        if (remote == null) {
            return null;
        }
        InetAddress address = remote.getAddress();
        return address == null ? null : address.getHostAddress();
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
            WebSocketHandler wsHandler, Exception exception) {
        // no-op
    }
}
