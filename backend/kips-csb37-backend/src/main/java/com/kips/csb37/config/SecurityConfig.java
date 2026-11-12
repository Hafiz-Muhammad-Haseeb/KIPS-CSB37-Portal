
package com.kips.csb37.config;

import com.kips.csb37.security.JwtAuthFilter;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Configuration
public class SecurityConfig {

    private static final String PRODUCTION_FRONTEND =
        "https://kips-csb37-portal.pages.dev";

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    SecurityFilterChain filterChain(
            HttpSecurity http,
            JwtAuthFilter jwt
    ) throws Exception {

        return http
            .csrf(csrf -> csrf.disable())
            .cors(Customizer.withDefaults())

            .sessionManagement(session ->
                session.sessionCreationPolicy(
                    SessionCreationPolicy.STATELESS
                )
            )

            .authorizeHttpRequests(auth -> auth
                .requestMatchers(
                    "/api/auth/login",
                    "/api/health",
                    "/error"
                ).permitAll()

                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()

                .anyRequest().authenticated()
            )

            .addFilterBefore(
                jwt,
                UsernamePasswordAuthenticationFilter.class
            )

            .build();
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(
            @Value("${app.cors.allowed-origins:}") String configuredOrigins
    ) {

        Set<String> allowedOrigins = new LinkedHashSet<>();

        // Production Cloudflare Pages frontend
        allowedOrigins.add(PRODUCTION_FRONTEND);

        // Preserve local and additional configured origins
        if (configuredOrigins != null && !configuredOrigins.isBlank()) {

            Arrays.stream(configuredOrigins.split(","))
                .map(String::trim)
                .map(value -> value.replaceAll("^[\"']|[\"']$", ""))
                .map(String::trim)
                .map(value -> value.replaceAll("/+$", ""))
                .filter(value -> !value.isBlank())
                .forEach(allowedOrigins::add);
        }

        CorsConfiguration cors = new CorsConfiguration();

        cors.setAllowedOrigins(List.copyOf(allowedOrigins));

        cors.setAllowedMethods(List.of(
            "GET",
            "POST",
            "PATCH",
            "PUT",
            "DELETE",
            "OPTIONS"
        ));

        cors.setAllowedHeaders(List.of(
            "Authorization",
            "Content-Type",
            "Idempotency-Key"
        ));

        cors.setAllowCredentials(false);
        cors.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source =
            new UrlBasedCorsConfigurationSource();

        source.registerCorsConfiguration("/**", cors);

        return source;
    }
}
