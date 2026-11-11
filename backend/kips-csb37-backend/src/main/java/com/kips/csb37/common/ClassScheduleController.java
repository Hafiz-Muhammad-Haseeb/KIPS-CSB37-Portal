package com.kips.csb37.common;

import com.kips.csb37.security.PortalPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/schedule")
public class ClassScheduleController {
    private final JdbcTemplate db;

    public ClassScheduleController(JdbcTemplate db) {
        this.db = db;
    }

    private PortalPrincipal principal(org.springframework.security.core.Authentication auth) {
        return (PortalPrincipal) auth.getPrincipal();
    }

    @GetMapping
    public Map<String, Object> current(org.springframework.security.core.Authentication auth) {
        PortalPrincipal p = principal(auth);
        List<Map<String, Object>> rows;
        if ("ADMIN".equals(p.role())) {
            rows = db.queryForList("""
                SELECT *, (CURRENT_DATE BETWEEN starts_on AND ends_on) AS is_current
                FROM class_schedule WHERE active=true
                ORDER BY (CURRENT_DATE BETWEEN starts_on AND ends_on) DESC, starts_on DESC, created_at DESC LIMIT 1
                """);
        } else {
            rows = db.queryForList("""
                SELECT *, true AS is_current FROM class_schedule
                WHERE active=true AND CURRENT_DATE BETWEEN starts_on AND ends_on
                ORDER BY starts_on DESC, created_at DESC LIMIT 1
                """);
        }
        return rows.isEmpty() ? Map.of("configured", false) : rows.get(0);
    }

    public record ScheduleIn(
        @NotBlank String weekType,
        Integer weekNumber,
        @NotNull LocalDate startDate,
        @NotNull LocalDate endDate,
        String description
    ) {}

    @PutMapping
    @Transactional
    public Map<String, Object> save(@Valid @RequestBody ScheduleIn in,
                                    org.springframework.security.core.Authentication auth) {
        PortalPrincipal p = principal(auth);
        if (!"ADMIN".equals(p.role())) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Administrator permission required.");
        String weekType = in.weekType().trim().toUpperCase();
        if (!List.of("TEST", "STUDY", "NORMAL", "OTHER").contains(weekType)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid schedule week type.");
        }
        if (in.endDate().isBefore(in.startDate())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "End date must be on or after start date.");
        if (in.weekNumber() != null && (in.weekNumber() < 1 || in.weekNumber() > 5)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Week number must be between 1 and 5.");
        }
        // Keep older schedule ranges for backdated fine entries. Newest matching range takes precedence.
        UUID id = UUID.randomUUID();
        String label = ("TEST".equals(weekType) ? "Test" : "STUDY".equals(weekType) ? "Study" : "NORMAL".equals(weekType) ? "Normal" : "Other") + " Week";
        db.update("""
            INSERT INTO class_schedule(id,label,week_type,week_number,starts_on,ends_on,description,active,created_by)
            VALUES(?,?,?,?,?,?,?,true,?)
            """, id, label, weekType, in.weekNumber(), in.startDate(), in.endDate(), in.description(), p.userId());
        db.update("INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,after_data) VALUES(?,?,?,?,jsonb_build_object('weekType',?,'startDate',?,'endDate',?))",
            p.userId(), "CLASS_SCHEDULE_UPDATED", "CLASS_SCHEDULE", id, weekType, in.startDate().toString(), in.endDate().toString());
        return Map.of("id", id, "label", label, "week_type", weekType, "week_number", in.weekNumber() == null ? 0 : in.weekNumber(),
            "starts_on", in.startDate(), "ends_on", in.endDate(), "description", in.description() == null ? "" : in.description(), "configured", true, "is_current", !LocalDate.now().isBefore(in.startDate()) && !LocalDate.now().isAfter(in.endDate()));
    }
}
