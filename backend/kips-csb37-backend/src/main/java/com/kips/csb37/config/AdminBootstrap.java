package com.kips.csb37.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class AdminBootstrap implements ApplicationRunner {
  private final JdbcTemplate db; private final PasswordEncoder encoder;
  @Value("${app.bootstrap.admin-username:}") private String username;
  @Value("${app.bootstrap.admin-password:}") private String password;
  public AdminBootstrap(JdbcTemplate db,PasswordEncoder encoder){this.db=db;this.encoder=encoder;}
  @Override public void run(ApplicationArguments args){
    if(username==null||username.isBlank()||password==null||password.length()<12)return;
    Integer count=db.queryForObject("SELECT count(*) FROM app_users WHERE role='ADMIN' AND username=?",Integer.class,username);
    if(count==null||count==0)db.update("INSERT INTO app_users(username,password_hash,role,student_id,must_change_password) VALUES(?,?, 'ADMIN',NULL,false)",username,encoder.encode(password));
  }
}
