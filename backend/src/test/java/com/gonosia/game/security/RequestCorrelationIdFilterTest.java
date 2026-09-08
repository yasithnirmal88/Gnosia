package com.gonosia.game.security;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;

class RequestCorrelationIdFilterTest {

    private final RequestCorrelationIdFilter filter = new RequestCorrelationIdFilter();

    @Test
    void echoesValidInboundHeader() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(RequestCorrelationIdFilter.HEADER, "abc-123_XYZ.42");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getHeader(RequestCorrelationIdFilter.HEADER)).isEqualTo("abc-123_XYZ.42");
    }

    @Test
    void generatesIdWhenHeaderAbsent() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(new MockHttpServletRequest(), response, new MockFilterChain());

        assertThat(response.getHeader(RequestCorrelationIdFilter.HEADER)).isNotBlank();
    }

    @Test
    void discardsUnsafeHeaderValue() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(RequestCorrelationIdFilter.HEADER, "evil<script>alert(1)");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getHeader(RequestCorrelationIdFilter.HEADER)).isNotEqualTo("evil<script>alert(1)");
    }
}