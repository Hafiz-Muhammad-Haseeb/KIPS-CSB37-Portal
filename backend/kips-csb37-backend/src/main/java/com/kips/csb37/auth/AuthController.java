package com.kips.csb37.auth;

import com.kips.csb37.security.JwtService;
import com.kips.csb37.security.PortalPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class AuthController {
  private final JdbcTemplate db; private final PasswordEncoder encoder; private final JwtService jwt;
  public AuthController(JdbcTemplate db, PasswordEncoder encoder, JwtService jwt){this.db=db;this.encoder=encoder;this.jwt=jwt;}
  public record LoginRequest(@NotBlank String username,@NotBlank String password){}
  @PostMapping("/auth/login") public Map<String,Object> login(@Valid @RequestBody LoginRequest in){
    var rows=db.queryForList("""
      SELECT u.id,u.username,u.password_hash,u.role,u.student_id,s.full_name,s.roll_number
      FROM app_users u LEFT JOIN students s ON s.id=u.student_id
      WHERE lower(u.username)=lower(?) AND u.enabled=true
      """,in.username());
    if(rows.isEmpty() || !encoder.matches(in.password(),String.valueOf(rows.get(0).get("password_hash"))))
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Invalid username or password.");
    var r=rows.get(0); UUID userId=(UUID)r.get("id"); UUID studentId=(UUID)r.get("student_id");
    String role=String.valueOf(r.get("role")); String username=String.valueOf(r.get("username"));
    db.update("UPDATE app_users SET last_login_at=now() WHERE id=?",userId);
    var p=new PortalPrincipal(userId,username,role,studentId);
    Map<String,Object> user=Map.of("id",userId,"username",username,"role",role,
      "studentId",studentId==null?"":studentId,
      "name",r.get("full_name")==null?username:r.get("full_name"),
      "rollNumber",r.get("roll_number")==null?"":r.get("roll_number"));
    return Map.of("accessToken",jwt.issue(p),"tokenType","Bearer","user",user);
  }
  @GetMapping("/health") public Map<String,Object> health(){return Map.of("status","UP","service","KIPS-CSB37-Portal API");}
}
