package com.gonosia.game.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class DeploymentConfigValidationTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(AppSecurityConfiguration.class);

    @Test
    void devProfileAcceptsExplicitOriginList() {
        runner.withPropertyValues(
                    "spring.profiles.active=dev",
                    "app.cors.allowed-origins=http://localhost:5173,https://gnosia.example.com")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    AllowedOrigins origins = context.getBean(AllowedOrigins.class);
                    assertThat(origins.values())
                            .containsExactly("http://localhost:5173", "https://gnosia.example.com");
                });
    }

    @Test
    void wildcardOriginsAreRejectedInEveryProfile() {
        runner.withPropertyValues(
                    "spring.profiles.active=dev",
                    "app.cors.allowed-origins=http://localhost:*")
                .run(context -> assertThat(context).hasFailed());
    }

    @Test
    void invalidOriginSchemeIsRejected() {
        runner.withPropertyValues(
                    "spring.profiles.active=dev",
                    "app.cors.allowed-origins=ftp://localhost:5173")
                .run(context -> assertThat(context).hasFailed());
    }

    @Test
    void prodRefusesToStartWithoutExplicitOrigins() {
        runner.withPropertyValues(
                    "spring.profiles.active=prod",
                    "app.cors.allowed-origins=")
                .run(context -> assertThat(context).hasFailed());
    }

    @Test
    void stagingRefusesToStartWithoutExplicitOrigins() {
        runner.withPropertyValues(
                    "spring.profiles.active=staging",
                    "app.cors.allowed-origins=")
                .run(context -> assertThat(context).hasFailed());
    }

    @Test
    void prodAcceptsExplicitOriginList() {
        runner.withPropertyValues(
                    "spring.profiles.active=prod",
                    "app.cors.allowed-origins=https://gnosia.example.com,https://gnosia.app")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context.getBean(AllowedOrigins.class).values())
                            .contains("https://gnosia.example.com", "https://gnosia.app");
                });
    }
}