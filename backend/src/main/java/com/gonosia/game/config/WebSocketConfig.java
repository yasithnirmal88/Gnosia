package com.gonosia.game.config;

import com.gonosia.game.security.ClientIpHandshakeInterceptor;
import com.gonosia.game.security.IdentityChannelInterceptor;
import com.gonosia.game.security.RateLimitService;
import com.gonosia.game.security.SessionIdentityService;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

import java.util.ArrayList;
import java.util.List;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

  private final SessionIdentityService identityService;
  private final RateLimitService rateLimitService;
  private final AllowedOrigins allowedOrigins;

  public WebSocketConfig(SessionIdentityService identityService, RateLimitService rateLimitService,
          AllowedOrigins allowedOrigins) {
    this.identityService = identityService;
    this.rateLimitService = rateLimitService;
    this.allowedOrigins = allowedOrigins;
  }

  @Override
  public void configureClientInboundChannel(ChannelRegistration registration) {
    registration.interceptors(new IdentityChannelInterceptor(identityService, rateLimitService));
  }

  @Override
  public void configureMessageBroker(MessageBrokerRegistry config) {
    config.enableSimpleBroker("/topic", "/queue");
    config.setApplicationDestinationPrefixes("/app");
    config.setUserDestinationPrefix("/user");
  }

  @Override
  public void registerStompEndpoints(StompEndpointRegistry registry) {
    // Explicit origin allow-list only (validated by AppSecurityConfiguration) — a
    // request carrying an Origin header not on the list is rejected at the
    // handshake. When the allow-list is empty (dev fallback never is; prod refuses
    // to start without it), same-origin and header-less clients remain usable.
    String[] origins = toArray(allowedOrigins.values());
    registry.addEndpoint("/game-ws")
            .setAllowedOrigins(origins)
            .addInterceptors(new ClientIpHandshakeInterceptor())
            .withSockJS();
    registry.addEndpoint("/game-ws-raw")
            .setAllowedOrigins(origins)
            .addInterceptors(new ClientIpHandshakeInterceptor());
  }

  private String[] toArray(List<String> values) {
    return values == null || values.isEmpty() ? new String[0] : new ArrayList<>(values).toArray(new String[0]);
  }
}