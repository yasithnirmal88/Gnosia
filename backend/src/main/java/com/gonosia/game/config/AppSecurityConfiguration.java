package com.gonosia.game.config;

import com.gonosia.game.security.RequestCorrelationIdFilter;
import com.gonosia.game.security.SecurityHeadersFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.util.StringUtils;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Central security configuration for deployments.
 *
 * <ul>
 *   <li>{@link #allowedOrigins()} parses the {@code app.cors.allowed-origins} env-driven
 *       list into an explicit, validated origin allow-list. Wildcards are rejected in
 *       every profile; the {@code prod}/{@code staging} profiles additionally refuse to
 *       start with an empty list, so a mis-deployed backend fails at boot instead of
 *       serving with a silently open CORS policy.</li>
 *   <li>Structured filters: request correlation IDs on every HTTP request, and hardened
 *       security headers for {@code prod}/{@code staging}.</li>
 * </ul>
 */
@Configuration
public class AppSecurityConfiguration {

  private static final Logger log = LoggerFactory.getLogger(AppSecurityConfiguration.class);

  private final Environment environment;

  @Value("${app.cors.allowed-origins:}")
  private String allowedOriginsRaw;

  public AppSecurityConfiguration(Environment environment) {
    this.environment = environment;
  }

  @Bean
  public AllowedOrigins allowedOrigins() {
    List<String> parsed = new ArrayList<>();
    if (StringUtils.hasText(allowedOriginsRaw)) {
      for (String part : allowedOriginsRaw.split(",")) {
        String origin = part.trim();
        if (origin.isEmpty()) continue;
        if (origin.contains("*")) {
          throw new IllegalStateException(
              "app.cors.allowed-origins must be an explicit origin allow-list; "
                  + "wildcards are not allowed (got: " + origin + ")");
        }
        try {
          URI uri = new URI(origin);
          if (!"http".equalsIgnoreCase(uri.getScheme()) && !"https".equalsIgnoreCase(uri.getScheme())) {
            throw new IllegalStateException("app.cors.allowed-origins entries must be http(s) origins: " + origin);
          }
        } catch (URISyntaxException e) {
          throw new IllegalStateException("Invalid origin in app.cors.allowed-origins: " + origin, e);
        }
        parsed.add(origin);
      }
    }

    boolean strict = Arrays.stream(activeProfiles()).anyMatch(p -> p.equals("prod") || p.equals("staging"));
    if (strict && parsed.isEmpty()) {
      throw new IllegalStateException(
          "Production/staging requires an explicit CORS_ALLOWED_ORIGINS allow-list. "
              + "Refusing to start with an open or empty origin policy.");
    }

    boolean rateLimitDisabled = "false".equalsIgnoreCase(
        environment.getProperty("app.rate-limit.enabled", "true"));
    if (strict && rateLimitDisabled) {
      log.warn("[CONFIG] rate limiting is DISABLED in a strict profile");
    }

    log.info("[CONFIG] profile={} allowed-origins={}", String.join(",", activeProfiles()), parsed);
    return new AllowedOrigins(parsed);
  }

  @Bean
  public RequestCorrelationIdFilter requestCorrelationIdFilter() {
    return new RequestCorrelationIdFilter();
  }

  /** Hardened response headers — production and staging only (CSP would break the Vite dev pipeline). */
  @Bean
  @Profile({"prod", "staging"})
  public SecurityHeadersFilter securityHeadersFilter() {
    return new SecurityHeadersFilter();
  }

  private String[] activeProfiles() {
    String[] active = environment.getActiveProfiles();
    if (active.length == 0) {
      active = environment.getDefaultProfiles();
    }
    return active;
  }
}