package com.gonosia.game.config;

import com.gonosia.game.security.ClientIpHandshakeInterceptor;
import com.gonosia.game.security.IdentityChannelInterceptor;
import com.gonosia.game.security.RateLimitService;
import com.gonosia.game.security.SessionIdentityService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

  @Value("${app.cors.allowed-origins:http://localhost:*,http://127.0.0.1:*,https://*.onrender.com}")
  private String allowedOrigins;

  private final SessionIdentityService identityService;
  private final RateLimitService rateLimitService;

  public WebSocketConfig(SessionIdentityService identityService, RateLimitService rateLimitService) {
    this.identityService = identityService;
    this.rateLimitService = rateLimitService;
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
    registry.addEndpoint("/game-ws")
            .setAllowedOriginPatterns(allowedOrigins.split(","))
            .addInterceptors(new ClientIpHandshakeInterceptor())
            .withSockJS();
    registry.addEndpoint("/game-ws-raw")
            .setAllowedOriginPatterns(allowedOrigins.split(","))
            .addInterceptors(new ClientIpHandshakeInterceptor());
  }
}