package com.kips.csb37.security;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

@Service
public class JwtService {
    private final SecretKey key;
    private final long expirationMinutes;
    public JwtService(@Value("${app.jwt.secret}") String secret,
                      @Value("${app.jwt.expiration-minutes:60}") long expirationMinutes) {
        if (secret == null || secret.getBytes(StandardCharsets.UTF_8).length < 32)
            throw new IllegalStateException("JWT_SECRET must be set to a random secret of at least 32 bytes.");
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expirationMinutes = expirationMinutes;
    }
    public String issue(PortalPrincipal p) {
        Instant now = Instant.now();
        var builder = Jwts.builder().subject(p.userId().toString()).claim("username",p.username())
                .claim("role",p.role()).issuedAt(Date.from(now)).expiration(Date.from(now.plusSeconds(expirationMinutes*60)));
        if (p.studentId()!=null) builder.claim("studentId",p.studentId().toString());
        return builder.signWith(key).compact();
    }
    public PortalPrincipal parse(String token) {
        var c = Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
        String sid = c.get("studentId", String.class);
        return new PortalPrincipal(UUID.fromString(c.getSubject()), c.get("username",String.class),
                c.get("role",String.class), sid == null ? null : UUID.fromString(sid));
    }
}
