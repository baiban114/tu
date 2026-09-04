package com.tu.backend.auth.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class CurrentUserIdResolver {

    public static final String LOCAL_USER_ID = "dev-local-user";
    private static final String USER_ID_HEADER = "X-User-Id";

    private final HttpServletRequest request;

    public CurrentUserIdResolver(HttpServletRequest request) {
        this.request = request;
    }

    public String resolve() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof AppUserDetails details) {
            return details.getUser().getId();
        }
        String headerUserId = request.getHeader(USER_ID_HEADER);
        if (StringUtils.hasText(headerUserId)) {
            return normalize(headerUserId);
        }
        return LOCAL_USER_ID;
    }

    public boolean isLocalUser(String userId) {
        return LOCAL_USER_ID.equals(userId) || "local".equals(userId);
    }

    private String normalize(String value) {
        String normalized = value.trim();
        return normalized.length() > 64 ? normalized.substring(0, 64) : normalized;
    }
}
