package com.gonosia.game;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.messaging.converter.MappingJackson2MessageConverter;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;

import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Locks in the production CORS contract: only browser origins on the explicit
 * allow-list (dev profile here, CORS_ALLOWED_ORIGINS in prod) may complete a
 * WebSocket handshake; anything else is rejected server-side. Wildcards are
 * rejected at startup by DeploymentConfigValidationTest, so this file only has to
 * verify the runtime handshake boundary.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class WebSocketOriginPolicyTest {

    @LocalServerPort
    private int port;

    private WebSocketStompClient stompClient() {
        WebSocketStompClient client = new WebSocketStompClient(new StandardWebSocketClient());
        client.setMessageConverter(new MappingJackson2MessageConverter());
        return client;
    }

    @Test
    void handshakeFromAllowedOriginSucceeds() throws Exception {
        WebSocketHttpHeaders headers = new WebSocketHttpHeaders();
        headers.setOrigin("http://localhost:8080"); // dev-profile allow-list entry

        StompSession session = stompClient()
                .connect(connectUrl(), headers, new StompHeaders(), new StompSessionHandlerAdapter() {})
                .get(5, TimeUnit.SECONDS);

        assertThat(session.isConnected()).isTrue();
        session.disconnect();
    }

    @Test
    void handshakeFromUnexpectedOriginIsRejected() {
        WebSocketHttpHeaders headers = new WebSocketHttpHeaders();
        headers.setOrigin("https://evil.example.com");

        assertThatThrownBy(() -> stompClient()
                .connect(connectUrl(), headers, new StompHeaders(), new StompSessionHandlerAdapter() {})
                .get(5, TimeUnit.SECONDS))
                .isInstanceOf(Throwable.class);
    }

    private String connectUrl() {
        return "ws://localhost:" + port + "/game-ws-raw";
    }
}