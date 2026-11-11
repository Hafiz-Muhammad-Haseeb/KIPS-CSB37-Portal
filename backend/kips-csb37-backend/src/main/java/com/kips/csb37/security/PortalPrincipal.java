package com.kips.csb37.security;

import java.util.UUID;

public record PortalPrincipal(UUID userId, String username, String role, UUID studentId) { }
