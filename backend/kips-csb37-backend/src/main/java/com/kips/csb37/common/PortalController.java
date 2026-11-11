package com.kips.csb37.common;

import com.kips.csb37.security.PortalPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api")
public class PortalController {
  private final JdbcTemplate db; private final PhoneCrypto phoneCrypto; private final org.springframework.security.crypto.password.PasswordEncoder passwordEncoder; private final com.fasterxml.jackson.databind.ObjectMapper mapper;
  public PortalController(JdbcTemplate db,PhoneCrypto phoneCrypto,org.springframework.security.crypto.password.PasswordEncoder passwordEncoder,com.fasterxml.jackson.databind.ObjectMapper mapper){this.db=db;this.phoneCrypto=phoneCrypto;this.passwordEncoder=passwordEncoder;this.mapper=mapper;}
  private PortalPrincipal p(org.springframework.security.core.Authentication a){return (PortalPrincipal)a.getPrincipal();}
  private boolean admin(PortalPrincipal p){return "ADMIN".equals(p.role());}
  private void requireAdmin(PortalPrincipal p){if(!admin(p))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Administrator permission required.");}
  private UUID ownStudent(PortalPrincipal p){if(p.studentId()==null)throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Student account required.");return p.studentId();}
  private UUID scopedStudent(PortalPrincipal p, UUID requested){return admin(p)?requested:ownStudent(p);}
  private void audit(PortalPrincipal p,String action,String type,UUID id,Object after){
    db.update("INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,after_data) VALUES(?,?,?,?,?::jsonb)",
      p.userId(),action,type,id,after==null?null:json(after));
  }
  private String json(Object o){try{return mapper.writeValueAsString(o);}catch(Exception e){throw new IllegalStateException("Unable to create audit/policy JSON snapshot.",e);}}

  @GetMapping("/portal") public Map<String,Object> portal(org.springframework.security.core.Authentication a){
    PortalPrincipal p=p(a); UUID sid=p.studentId();
    List<Map<String,Object>> students=admin(p)?db.queryForList("SELECT id,roll_number AS roll,full_name AS name,class_name,academic_year,status,whatsapp_number_last4 FROM students ORDER BY roll_number")
      :db.queryForList("SELECT id,roll_number AS roll,full_name AS name,class_name,academic_year,status FROM students WHERE id=?",sid);
    String scope=admin(p)?"":" AND student_id='"+sid+"'";
    List<Map<String,Object>> fines=admin(p)?db.queryForList("""
      SELECT f.id,f.student_id AS \"studentId\",s.roll_number AS roll,s.full_name AS name,f.category AS reason,
      f.reason AS note,f.occurrence_date AS date,f.entry_date AS \"entryDate\",f.week_type AS \"weekType\",
      f.assessed_amount_pkr AS amount,f.status,
      COALESCE((SELECT sum(amount_pkr) FROM fine_payments fp WHERE fp.fine_id=f.id),0) AS \"paidAmount\",
      COALESCE((SELECT sum(amount_pkr) FROM fine_waivers fw WHERE fw.fine_id=f.id),0) AS \"waivedAmount\"
      FROM fines f JOIN students s ON s.id=f.student_id ORDER BY f.occurrence_date DESC,f.created_at DESC
      """) : db.queryForList("""
      SELECT f.id,f.student_id AS \"studentId\",s.roll_number AS roll,s.full_name AS name,f.category AS reason,
      f.reason AS note,f.occurrence_date AS date,f.entry_date AS \"entryDate\",f.week_type AS \"weekType\",
      f.assessed_amount_pkr AS amount,f.status,
      COALESCE((SELECT sum(amount_pkr) FROM fine_payments fp WHERE fp.fine_id=f.id),0) AS \"paidAmount\",
      COALESCE((SELECT sum(amount_pkr) FROM fine_waivers fw WHERE fw.fine_id=f.id),0) AS \"waivedAmount\"
      FROM fines f JOIN students s ON s.id=f.student_id WHERE f.student_id=? ORDER BY f.occurrence_date DESC
      """,sid);
    List<Map<String,Object>> expenses=admin(p)?db.queryForList("SELECT id,category,description AS comment,amount_pkr AS amount,expense_date AS date FROM class_expenses ORDER BY expense_date DESC"):List.of();
    List<Map<String,Object>> leaves=admin(p)?db.queryForList("SELECT l.*,s.roll_number AS roll,s.full_name AS name FROM leave_applications l JOIN students s ON s.id=l.student_id ORDER BY submitted_at DESC")
      :db.queryForList("SELECT * FROM leave_applications WHERE student_id=? ORDER BY submitted_at DESC",sid);
    List<Map<String,Object>> notices=db.queryForList("""
      SELECT n.id,n.title,n.category,n.short_description AS \"shortDescription\",n.body,n.event_date AS \"eventDate\",
      n.start_time AS \"startTime\",n.end_time AS \"endTime\",n.instructions,n.publish_at AS \"publishAt\",n.expires_at AS \"expiresAt\",
      CASE WHEN ar.user_id IS NULL THEN false ELSE true END AS \"isRead\"
      FROM announcements n LEFT JOIN announcement_reads ar ON ar.announcement_id=n.id AND ar.user_id=?
      WHERE n.status='PUBLISHED' AND (n.publish_at IS NULL OR n.publish_at<=now()) AND (n.expires_at IS NULL OR n.expires_at>now())
      ORDER BY n.event_date NULLS LAST,n.publish_at DESC
      """,p.userId());
    return Map.of("user",Map.of("id",p.userId(),"username",p.username(),"role",p.role(),"studentId",sid==null?"":sid),
      "students",students,"fines",fines,"expenses",expenses,"leaves",leaves,"notices",notices);
  }

  public record StudentIn(@NotBlank String rollNumber,@NotBlank String fullName,String className,String academicYear,String whatsappNumber,String username,String initialPassword){}
  @GetMapping("/students") public List<Map<String,Object>> students(org.springframework.security.core.Authentication a){PortalPrincipal p=p(a);if(admin(p)){List<Map<String,Object>> rows=db.queryForList("SELECT id,roll_number AS \"rollNumber\",full_name AS \"fullName\",class_name AS \"className\",academic_year AS \"academicYear\",status,whatsapp_number_ciphertext,whatsapp_number_last4 AS \"whatsappLast4\" FROM students ORDER BY roll_number");for(Map<String,Object> row:rows){byte[] encrypted=(byte[])row.remove("whatsapp_number_ciphertext");row.put("whatsappNumber",encrypted==null?null:phoneCrypto.decrypt(encrypted));}return rows;}return db.queryForList("SELECT id,roll_number AS \"rollNumber\",full_name AS \"fullName\",status FROM students WHERE id=?",ownStudent(p));}
  @PostMapping("/students") @Transactional public Map<String,Object> createStudent(@Valid @RequestBody StudentIn in,org.springframework.security.core.Authentication a){PortalPrincipal p=p(a);requireAdmin(p);UUID id=UUID.randomUUID();String phone=in.whatsappNumber()==null?null:in.whatsappNumber().replaceAll("[^0-9+]","");if(phone!=null&&!phone.isBlank()&&!phone.matches("^\\+?[1-9][0-9]{7,14}$"))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Enter a valid WhatsApp number with country code.");try{db.update("INSERT INTO students(id,roll_number,full_name,class_name,academic_year,whatsapp_number_ciphertext,whatsapp_number_last4) VALUES(?,?,?,?,?,?,?)",id,in.rollNumber().trim(),in.fullName().trim(),in.className()==null?"CSB-37":in.className(),in.academicYear(),phoneCrypto.encrypt(phone),phone==null||phone.length()<4?null:phone.substring(phone.length()-4));}catch(DuplicateKeyException e){throw new ResponseStatusException(HttpStatus.CONFLICT,"Roll number already exists.");}if(in.username()!=null&&!in.username().isBlank()&&in.initialPassword()!=null&&!in.initialPassword().isBlank()){if(in.initialPassword().length()<12)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Student password must contain at least 12 characters.");db.update("INSERT INTO app_users(username,password_hash,role,student_id,must_change_password) VALUES(?,?, 'STUDENT',?,true)",in.username().trim(),passwordEncoder.encode(in.initialPassword()),id);}audit(p,"STUDENT_CREATED","STUDENT",id,Map.of("rollNumber",in.rollNumber()));return Map.of("id",id,"rollNumber",in.rollNumber(),"fullName",in.fullName());}
  @PatchMapping("/students/{id}") @Transactional public Map<String,Object> updateStudent(@PathVariable UUID id,@RequestBody Map<String,Object> in,org.springframework.security.core.Authentication a){PortalPrincipal p=p(a);requireAdmin(p);String phone=(String)in.get("whatsappNumber");if(phone!=null){phone=phone.replaceAll("[^0-9+]","");if(!phone.matches("^\\+?[1-9][0-9]{7,14}$"))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Enter a valid WhatsApp number with country code.");}db.update("UPDATE students SET full_name=COALESCE(?,full_name),academic_year=COALESCE(?,academic_year),status=COALESCE(?,status),whatsapp_number_ciphertext=COALESCE(?,whatsapp_number_ciphertext),whatsapp_number_last4=COALESCE(?,whatsapp_number_last4),updated_at=now() WHERE id=?",in.get("fullName"),in.get("academicYear"),in.get("status"),phone==null?null:phoneCrypto.encrypt(phone),phone==null?null:phone.substring(phone.length()-4),id);audit(p,"STUDENT_UPDATED","STUDENT",id,in);return Map.of("updated",true);}
  @DeleteMapping("/students/{id}") @Transactional public Map<String,Object> deactivateStudent(@PathVariable UUID id,org.springframework.security.core.Authentication a){PortalPrincipal p=p(a);requireAdmin(p);db.update("UPDATE students SET status='INACTIVE',updated_at=now() WHERE id=?",id);db.update("UPDATE app_users SET enabled=false WHERE student_id=?",id);audit(p,"STUDENT_DEACTIVATED","STUDENT",id,Map.of());return Map.of("deactivated",true);}

  public record FineIn(@NotNull UUID studentId,@NotBlank String category,@NotNull LocalDate occurrenceDate,@NotNull @PositiveOrZero Long amountPkr,String weekType,String reason){}
  private record ResolvedFine(UUID policyId,long amount,String weekType,Map<String,Object> snapshot){}
  private ResolvedFine resolveFinePolicy(String category,LocalDate date,String requestedWeek,long providedAmount){
    String effectiveWeek = requestedWeek==null||requestedWeek.isBlank()?null:requestedWeek.trim().toUpperCase();
    if(date.getDayOfWeek()==java.time.DayOfWeek.SATURDAY) effectiveWeek="SATURDAY";
    else {
      var schedules=db.queryForList("SELECT week_type FROM class_schedule WHERE active=true AND starts_on<=? AND ends_on>=? ORDER BY created_at DESC LIMIT 1",date,date);
      if(!schedules.isEmpty()) effectiveWeek=String.valueOf(schedules.get(0).get("week_type"));
    }
    Map<String,String> keys=Map.of(
      "Absent during Test","TEST_ABSENCE", "Leave during Test","TEST_LEAVE",
      "Absent during Study Days","STUDY_ABSENCE", "Absent on Saturday","SATURDAY_ABSENCE",
      "Leave on Saturday","SATURDAY_ABSENCE", "Exceeded Study Days Leave","EXCEEDED_STUDY_LEAVE",
      "Late Arrival","LATE_ARRIVAL", "Uniform Violation","UNIFORM_VIOLATION", "Mobile Usage","MOBILE_USAGE");
    String key=keys.get(category); String requiredWeek=null;
    if(key!=null && key.startsWith("SATURDAY_") && date.getDayOfWeek()!=java.time.DayOfWeek.SATURDAY)
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Saturday fine category can only be used for a Saturday occurrence date.");
    if(key!=null){
      if(key.startsWith("TEST_")) requiredWeek="TEST";
      else if(key.startsWith("STUDY_")||key.equals("EXCEEDED_STUDY_LEAVE")) requiredWeek="STUDY";
      else if(key.startsWith("SATURDAY_")) requiredWeek="SATURDAY";
    }
    if(requiredWeek!=null && effectiveWeek!=null && !requiredWeek.equals(effectiveWeek))
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Selected fine category does not match the schedule for the occurrence date ("+effectiveWeek+"). Review the date/week and fine reason.");
    if(requiredWeek!=null && effectiveWeek==null) effectiveWeek=requiredWeek;
    UUID policyId=null; long amount=providedAmount; Map<String,Object> snapshot=new LinkedHashMap<>();
    if(key!=null){
      var policies=db.queryForList("SELECT id,amount_pkr,effective_from,effective_to,conditions FROM fine_policies WHERE policy_key=? AND enabled=true AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?) ORDER BY effective_from DESC LIMIT 1",key,date,date);
      if(!policies.isEmpty()){
        var policy=policies.get(0); policyId=(UUID)policy.get("id"); amount=((Number)policy.get("amount_pkr")).longValue(); snapshot.put("policyId",policyId.toString()); snapshot.put("policyAmountPkr",amount); snapshot.put("policyEffectiveFrom",Objects.toString(policy.get("effective_from"),"")); snapshot.put("policyEffectiveTo",Objects.toString(policy.get("effective_to"),"")); snapshot.put("policyConditions",Objects.toString(policy.get("conditions"),"{}"));
      }
    }
    snapshot.put("category",category); snapshot.put("occurrenceDate",date.toString()); snapshot.put("effectiveWeekType",Objects.toString(effectiveWeek,"")); snapshot.put("assessedAmountPkr",amount);
    return new ResolvedFine(policyId,amount,effectiveWeek,snapshot);
  }
  @GetMapping("/fines") public List<Map<String,Object>> fines(org.springframework.security.core.Authentication a){PortalPrincipal p=p(a);if(admin(p))return db.queryForList("SELECT f.*,s.roll_number,s.full_name,COALESCE((SELECT sum(amount_pkr) FROM fine_payments x WHERE x.fine_id=f.id),0) paid_amount,COALESCE((SELECT sum(amount_pkr) FROM fine_waivers w WHERE w.fine_id=f.id),0) waived_amount FROM fines f JOIN students s ON s.id=f.student_id ORDER BY occurrence_date DESC");return db.queryForList("SELECT f.*,COALESCE((SELECT sum(amount_pkr) FROM fine_payments x WHERE x.fine_id=f.id),0) paid_amount,COALESCE((SELECT sum(amount_pkr) FROM fine_waivers w WHERE w.fine_id=f.id),0) waived_amount FROM fines f WHERE student_id=? ORDER BY occurrence_date DESC",ownStudent(p));}
  @PostMapping("/fines") @Transactional public Map<String,Object> createFine(@Valid @RequestBody FineIn in,org.springframework.security.core.Authentication a){PortalPrincipal p=p(a);requireAdmin(p);ResolvedFine resolved=resolveFinePolicy(in.category(),in.occurrenceDate(),in.weekType(),in.amountPkr());if(resolved.amount()<0)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Fine amount is invalid.");UUID id=UUID.randomUUID();try{db.update("INSERT INTO fines(id,student_id,policy_id,category,reason,occurrence_date,entry_date,week_type,assessed_amount_pkr,policy_snapshot,created_by) VALUES(?,?,?,?,?,?,CURRENT_DATE,?,?,?::jsonb,?)",id,in.studentId(),resolved.policyId(),in.category(),in.reason(),in.occurrenceDate(),resolved.weekType(),resolved.amount(),json(resolved.snapshot()),p.userId());}catch(DuplicateKeyException ex){throw new ResponseStatusException(HttpStatus.CONFLICT,"A fine with the same category already exists for this student on the selected date.");}audit(p,"FINE_CREATED","FINE",id,Map.of("studentId",in.studentId(),"occurrenceDate",in.occurrenceDate().toString(),"amountPkr",resolved.amount(),"weekType",Objects.toString(resolved.weekType(),"")));return Map.of("id",id,"created",true,"amountPkr",resolved.amount(),"policyDate",in.occurrenceDate());}
  @PatchMapping("/fines/{id}") @Transactional public Map<String,Object> updateFine(@PathVariable UUID id,@RequestBody Map<String,Object> in,org.springframework.security.core.Authentication a){
    PortalPrincipal p=p(a);requireAdmin(p);var old=db.queryForMap("SELECT category,reason,occurrence_date,assessed_amount_pkr,week_type FROM fines WHERE id=?",id);
    String category=in.get("category")==null?String.valueOf(old.get("category")):String.valueOf(in.get("category"));
    LocalDate date=in.get("occurrenceDate")==null?(LocalDate)old.get("occurrence_date"):LocalDate.parse(String.valueOf(in.get("occurrenceDate")));
    long provided=in.get("amountPkr")==null?((Number)old.get("assessed_amount_pkr")).longValue():Long.parseLong(String.valueOf(in.get("amountPkr")));
    String requestedWeek=Objects.toString(in.get("weekType"),Objects.toString(old.get("week_type"),""));
    ResolvedFine resolved=resolveFinePolicy(category,date,requestedWeek,provided);
    long alreadySettled=db.queryForObject("SELECT COALESCE((SELECT sum(amount_pkr) FROM fine_payments WHERE fine_id=?),0)+COALESCE((SELECT sum(amount_pkr) FROM fine_waivers WHERE fine_id=?),0)",Long.class,id,id);
    if(resolved.amount()<alreadySettled)throw new ResponseStatusException(HttpStatus.CONFLICT,"Assessed fine cannot be reduced below amounts already paid or waived. Record a reviewed correction instead.");
    long paidNow=db.queryForObject("SELECT COALESCE(sum(amount_pkr),0) FROM fine_payments WHERE fine_id=?",Long.class,id);
    long waivedNow=db.queryForObject("SELECT COALESCE(sum(amount_pkr),0) FROM fine_waivers WHERE fine_id=?",Long.class,id);
    String recalculatedStatus=paidNow+waivedNow>=resolved.amount()?(waivedNow>0?"WAIVED":"PAID"):(paidNow>0?"PARTIAL":"UNPAID");
    db.update("UPDATE fines SET policy_id=?,category=?,reason=COALESCE(?,reason),occurrence_date=?,week_type=?,assessed_amount_pkr=?,policy_snapshot=?::jsonb,status=?,updated_at=now() WHERE id=?",resolved.policyId(),category,in.get("reason"),date,resolved.weekType(),resolved.amount(),json(resolved.snapshot()),recalculatedStatus,id);
    audit(p,"FINE_CORRECTED","FINE",id,Map.of("before",old,"after",in));return Map.of("updated",true,"amountPkr",resolved.amount(),"policyDate",date);
  }
  @PostMapping("/payments") @Transactional public Map<String,Object> payment(@RequestBody Map<String,Object> in,org.springframework.security.core.Authentication a){
    PortalPrincipal p=p(a);requireAdmin(p);UUID fineId=UUID.fromString(String.valueOf(in.get("fineId")));
    var f=db.queryForMap("SELECT student_id,assessed_amount_pkr,status FROM fines WHERE id=? FOR UPDATE",fineId);
    if("CANCELLED".equals(String.valueOf(f.get("status"))))throw new ResponseStatusException(HttpStatus.CONFLICT,"Cancelled fines cannot receive payments.");
    long paid=db.queryForObject("SELECT COALESCE(sum(amount_pkr),0) FROM fine_payments WHERE fine_id=?",Long.class,fineId);
    long waived=db.queryForObject("SELECT COALESCE(sum(amount_pkr),0) FROM fine_waivers WHERE fine_id=?",Long.class,fineId);
    long amount=Long.parseLong(String.valueOf(in.get("amountPkr")));
    long assessed=((Number)f.get("assessed_amount_pkr")).longValue();long remaining=assessed-paid-waived;
    if(amount<=0||amount>remaining)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Payment exceeds remaining balance.");
    UUID id=UUID.randomUUID();String receipt="CSB37-"+LocalDate.now().toString().replace("-","")+"-"+id.toString().substring(0,8).toUpperCase();
    db.update("INSERT INTO fine_payments(id,fine_id,student_id,amount_pkr,payment_method,reference_number,receipt_number,received_by,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?)",id,fineId,f.get("student_id"),amount,String.valueOf(in.getOrDefault("paymentMethod","CASH")),in.get("referenceNumber"),receipt,p.userId(),in.get("idempotencyKey"));
    long newPaid=paid+amount;db.update("UPDATE fines SET status=?,updated_at=now() WHERE id=?",newPaid+waived>=assessed?(waived>0?"WAIVED":"PAID"):(newPaid>0?"PARTIAL":"UNPAID"),fineId);
    audit(p,"PAYMENT_RECORDED","PAYMENT",id,Map.of("fineId",fineId,"amountPkr",amount,"receiptNumber",receipt));return Map.of("id",id,"receiptNumber",receipt,"amountPkr",amount);
  }

  @PostMapping("/fines/{id}/cancel") @Transactional public Map<String,Object> cancelFine(@PathVariable UUID id,@RequestBody Map<String,String> in,org.springframework.security.core.Authentication a){
    PortalPrincipal p=p(a);requireAdmin(p);var f=db.queryForList("SELECT assessed_amount_pkr,status FROM fines WHERE id=? FOR UPDATE",id);if(f.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Fine not found.");
    long paid=db.queryForObject("SELECT COALESCE(sum(amount_pkr),0) FROM fine_payments WHERE fine_id=?",Long.class,id);long waived=db.queryForObject("SELECT COALESCE(sum(amount_pkr),0) FROM fine_waivers WHERE fine_id=?",Long.class,id);
    if(paid>0||waived>0)throw new ResponseStatusException(HttpStatus.CONFLICT,"A fine with payments or waivers cannot be cancelled. Use a reviewed correction/waiver instead.");
    db.update("UPDATE fines SET status='CANCELLED',updated_at=now() WHERE id=?",id);audit(p,"FINE_CANCELLED","FINE",id,Map.of("reason",Objects.toString(in.get("reason"),"Admin cancellation")));return Map.of("cancelled",true);
  }
  @GetMapping("/students/{id}/statement") public Map<String,Object> statement(@PathVariable UUID id,org.springframework.security.core.Authentication a){
    PortalPrincipal p=p(a);UUID sid=scopedStudent(p,id);
    var student=db.queryForMap("SELECT id,roll_number,full_name,class_name,academic_year,whatsapp_number_last4,whatsapp_number_ciphertext FROM students WHERE id=?",sid);
    byte[] studentPhone=(byte[])student.remove("whatsapp_number_ciphertext");if(admin(p)&&studentPhone!=null)student.put("whatsapp_number",phoneCrypto.decrypt(studentPhone));
    List<Map<String,Object>> entries=db.queryForList("""
      SELECT f.id,f.category,f.reason,f.occurrence_date,f.entry_date,f.week_type,f.assessed_amount_pkr,
      COALESCE((SELECT sum(amount_pkr) FROM fine_payments x WHERE x.fine_id=f.id),0) paid_amount,
      COALESCE((SELECT sum(amount_pkr) FROM fine_waivers x WHERE x.fine_id=f.id),0) waived_amount,f.status
      FROM fines f WHERE f.student_id=? ORDER BY f.occurrence_date,f.created_at
      """,sid);
    long assessed=0,paid=0,waived=0;
    for(Map<String,Object> entry:entries){
      UUID fineId=(UUID)entry.get("id");
      List<Map<String,Object>> paymentRows=db.queryForList("SELECT amount_pkr,paid_at,receipt_number,payment_method AS method,reference_number FROM fine_payments WHERE fine_id=? ORDER BY paid_at",fineId);
      entry.put("payments",paymentRows);
      if(!"CANCELLED".equals(String.valueOf(entry.get("status")))){assessed+=((Number)entry.get("assessed_amount_pkr")).longValue();paid+=((Number)entry.get("paid_amount")).longValue();waived+=((Number)entry.get("waived_amount")).longValue();}
    }
    Map<String,Object> attendance=db.queryForMap("""
      SELECT COUNT(*) FILTER (WHERE status IN ('LEAVE','EMERGENCY_LEAVE')) AS total_leaves,
      COUNT(*) FILTER (WHERE status='ABSENT') AS total_absences,
      COUNT(*) FILTER (WHERE status='EMERGENCY_LEAVE') AS emergency_leaves,
      COUNT(*) FILTER (WHERE status='ABSENT' AND week_type='TEST') AS test_absences,
      COUNT(*) FILTER (WHERE status='ABSENT' AND week_type='STUDY') AS study_absences,
      COUNT(*) FILTER (WHERE status IN ('LEAVE','EMERGENCY_LEAVE') AND week_type='TEST') AS test_leaves,
      COUNT(*) FILTER (WHERE status IN ('LEAVE','EMERGENCY_LEAVE') AND week_type='STUDY') AS study_leaves
      FROM attendance WHERE student_id=?
      """,sid);
    Map<String,Object> applications=db.queryForMap("SELECT COUNT(*) FILTER (WHERE status='APPROVED') AS approved,COUNT(*) FILTER (WHERE status='REJECTED') AS rejected,COUNT(*) FILTER (WHERE status='PENDING') AS pending FROM leave_applications WHERE student_id=?",sid);
    return Map.of("student",student,"entries",entries,"attendanceSummary",attendance,"applicationSummary",applications,
      "summary",Map.of("assessedPkr",assessed,"paidPkr",paid,"waivedPkr",waived,"outstandingPkr",assessed-paid-waived));
  }

  public record LeaveIn(@NotBlank String leaveType,@NotNull LocalDate startDate,@NotNull LocalDate endDate,@NotBlank String description,@NotNull UUID proofFileId){}
  @GetMapping("/leaves") public List<Map<String,Object>> leaves(org.springframework.security.core.Authentication a){
    PortalPrincipal p=p(a);
    String base="SELECT l.*,(SELECT lf.file_id FROM leave_application_files lf WHERE lf.leave_application_id=l.id LIMIT 1) AS proof_file_id";
    return admin(p)?db.queryForList(base+",s.roll_number,s.full_name FROM leave_applications l JOIN students s ON s.id=l.student_id ORDER BY l.submitted_at DESC")
      :db.queryForList(base+" FROM leave_applications l WHERE l.student_id=? ORDER BY l.submitted_at DESC",ownStudent(p));
  }
  @PostMapping("/leaves") @Transactional public Map<String,Object> createLeave(@Valid @RequestBody LeaveIn in,org.springframework.security.core.Authentication a){PortalPrincipal p=p(a);if(admin(p))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Leave applications are submitted by the signed-in student.");UUID sid=ownStudent(p);if(in.endDate().isBefore(in.startDate()))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"End date must be on or after start date.");String type=in.leaveType().trim().toUpperCase();if(!List.of("EMERGENCY","MARRIAGE","MEDICAL","OTHER").contains(type))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid leave type.");if(!"EMERGENCY".equals(type)&&in.startDate().isBefore(LocalDate.now().plusDays(1)))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Normal leave must be submitted at least one day in advance. Use Emergency only for an unpredictable emergency.");if("MARRIAGE".equals(type)&&java.time.temporal.ChronoUnit.DAYS.between(in.startDate(),in.endDate())+1>3)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Marriage leave is limited to a maximum of 3 days.");var file=db.queryForList("SELECT id FROM private_files WHERE id=? AND purpose='LEAVE_PROOF' AND owner_student_id=?",in.proofFileId(),sid);if(file.isEmpty())throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"A valid supporting document is required.");UUID id=UUID.randomUUID();db.update("INSERT INTO leave_applications(id,student_id,leave_type,start_date,end_date,description) VALUES(?,?,?,?,?,?)",id,sid,type,in.startDate(),in.endDate(),in.description());db.update("INSERT INTO leave_application_files(leave_application_id,file_id) VALUES(?,?)",id,in.proofFileId());audit(p,"LEAVE_SUBMITTED","LEAVE",id,Map.of("startDate",in.startDate().toString(),"endDate",in.endDate().toString()));return Map.of("id",id,"status","PENDING");}
  @PostMapping("/leaves/{id}/decision") @Transactional public Map<String,Object> decideLeave(@PathVariable UUID id,@RequestBody Map<String,String> in,org.springframework.security.core.Authentication a){
    PortalPrincipal p=p(a);requireAdmin(p);String status=String.valueOf(in.get("status")).toUpperCase();
    if(!List.of("APPROVED","REJECTED").contains(status))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Decision must be APPROVED or REJECTED.");
    var rows=db.queryForList("SELECT student_id,start_date,end_date,leave_type FROM leave_applications WHERE id=? AND status='PENDING' FOR UPDATE",id);
    if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Pending leave application not found.");
    var row=rows.get(0); UUID studentId=(UUID)row.get("student_id"); LocalDate start=(LocalDate)row.get("start_date"); LocalDate end=(LocalDate)row.get("end_date");
    String note=Objects.toString(in.get("decisionNote"),"");
    if("REJECTED".equals(status)&&note.isBlank())throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"A rejection reason is required.");
    db.update("UPDATE leave_applications SET status=?,decision_note=?,decided_by=?,decided_at=now() WHERE id=?",status,note,p.userId(),id);
    int finesCreated=0;
    if("APPROVED".equals(status)){
      String attendanceStatus="EMERGENCY".equals(row.get("leave_type"))?"EMERGENCY_LEAVE":"LEAVE";
      for(LocalDate d=start;!d.isAfter(end);d=d.plusDays(1)){
        String weekType=d.getDayOfWeek()==java.time.DayOfWeek.SATURDAY?"SATURDAY":null;
        if(weekType==null){var schedule=db.queryForList("SELECT week_type FROM class_schedule WHERE active=true AND starts_on<=? AND ends_on>=? ORDER BY created_at DESC LIMIT 1",d,d);if(!schedule.isEmpty())weekType=String.valueOf(schedule.get(0).get("week_type"));}
        db.update("INSERT INTO attendance(student_id,attendance_date,status,week_type,note,marked_by) VALUES(?,?,?,?,?,?) ON CONFLICT(student_id,attendance_date) DO UPDATE SET status=EXCLUDED.status,week_type=EXCLUDED.week_type,note=EXCLUDED.note,marked_by=EXCLUDED.marked_by,updated_at=now()",studentId,d,attendanceStatus,weekType,"Approved leave application "+id,p.userId());
        String fineCategory=null;
        if("SATURDAY".equals(weekType)) fineCategory="Leave on Saturday";
        else if("TEST".equals(weekType)) fineCategory="Leave during Test";
        else if("STUDY".equals(weekType)){
          LocalDate monthStart=d.withDayOfMonth(1),monthEnd=d.withDayOfMonth(d.lengthOfMonth());
          Integer leaveDays=db.queryForObject("SELECT count(*) FROM attendance WHERE student_id=? AND attendance_date BETWEEN ? AND ? AND status IN ('LEAVE','EMERGENCY_LEAVE') AND week_type='STUDY'",Integer.class,studentId,monthStart,monthEnd);
          if(leaveDays!=null&&leaveDays>2)fineCategory="Exceeded Study Days Leave";
        }
        // Test-week and Saturday leave fines apply even after leave approval; any forgiveness is a separate audited waiver.
        if(fineCategory!=null){
          ResolvedFine resolved=resolveFinePolicy(fineCategory,d,weekType,0L);
          if(resolved.amount()>0){UUID fineId=UUID.randomUUID();int inserted=db.update("INSERT INTO fines(id,student_id,policy_id,category,reason,occurrence_date,entry_date,week_type,assessed_amount_pkr,policy_snapshot,created_by) VALUES(?,?,?,?,?,?,CURRENT_DATE,?,?,?::jsonb,?) ON CONFLICT(student_id,category,occurrence_date) WHERE status <> 'CANCELLED' DO NOTHING",fineId,studentId,resolved.policyId(),fineCategory,"Generated from approved leave application "+id,d,weekType,resolved.amount(),json(resolved.snapshot()),p.userId());if(inserted>0){finesCreated++;audit(p,"LEAVE_POLICY_FINE_CREATED","FINE",fineId,Map.of("leaveApplicationId",id,"occurrenceDate",d.toString(),"category",fineCategory,"amountPkr",resolved.amount()));}}
        }
      }
    }
    audit(p,"LEAVE_"+status,"LEAVE",id,Map.of("decisionNote",note,"attendanceSynced","APPROVED".equals(status),"finesCreated",finesCreated));
    return Map.of("updated",true,"status",status,"attendanceSynced","APPROVED".equals(status),"finesCreated",finesCreated,"fineWaived",false);
  }

  @GetMapping("/attendance") public List<Map<String,Object>> attendance(@RequestParam LocalDate date,org.springframework.security.core.Authentication a){PortalPrincipal p=p(a);return admin(p)?db.queryForList("SELECT a.*,s.roll_number,s.full_name FROM attendance a JOIN students s ON s.id=a.student_id WHERE attendance_date=? ORDER BY s.roll_number",date):db.queryForList("SELECT * FROM attendance WHERE student_id=? AND attendance_date=?",ownStudent(p),date);}
  @PostMapping("/attendance/bulk") @Transactional public Map<String,Object> attendanceBulk(@RequestBody List<Map<String,Object>> rows,org.springframework.security.core.Authentication a){
    PortalPrincipal p=p(a);requireAdmin(p);if(rows==null||rows.isEmpty()||rows.size()>500)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Attendance batch must contain between 1 and 500 rows.");int n=0,finesCreated=0;
    for(var r:rows){
      UUID studentId=UUID.fromString(String.valueOf(r.get("studentId")));LocalDate date=LocalDate.parse(String.valueOf(r.get("date")));String status=String.valueOf(r.get("status")).toUpperCase();
      if(!List.of("PRESENT","ABSENT","LEAVE","EMERGENCY_LEAVE").contains(status))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid attendance status.");
      Integer activeStudent=db.queryForObject("SELECT count(*) FROM students WHERE id=? AND status='ACTIVE'",Integer.class,studentId);if(activeStudent==null||activeStudent==0)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Student is not active or does not exist.");
      String weekType=date.getDayOfWeek()==java.time.DayOfWeek.SATURDAY?"SATURDAY":null;
      if(weekType==null){var schedule=db.queryForList("SELECT week_type FROM class_schedule WHERE active=true AND starts_on<=? AND ends_on>=? ORDER BY created_at DESC LIMIT 1",date,date);if(!schedule.isEmpty())weekType=String.valueOf(schedule.get(0).get("week_type"));}
      db.update("INSERT INTO attendance(student_id,attendance_date,status,week_type,note,marked_by) VALUES(?,?,?,?,?,?) ON CONFLICT(student_id,attendance_date) DO UPDATE SET status=EXCLUDED.status,week_type=EXCLUDED.week_type,note=EXCLUDED.note,marked_by=EXCLUDED.marked_by,updated_at=now()",studentId,date,status,weekType,r.get("note"),p.userId());n++;
      String fineCategory=null;
      if("ABSENT".equals(status)){
        if("SATURDAY".equals(weekType))fineCategory="Absent on Saturday";
        else if("TEST".equals(weekType))fineCategory="Absent during Test";
        else if("STUDY".equals(weekType))fineCategory="Absent during Study Days";
      } else if("LEAVE".equals(status)||"EMERGENCY_LEAVE".equals(status)){
        if("SATURDAY".equals(weekType))fineCategory="Leave on Saturday";
        else if("TEST".equals(weekType))fineCategory="Leave during Test";
        else if("STUDY".equals(weekType)){
          LocalDate monthStart=date.withDayOfMonth(1),monthEnd=date.withDayOfMonth(date.lengthOfMonth());
          Integer leaveDays=db.queryForObject("SELECT count(*) FROM attendance WHERE student_id=? AND attendance_date BETWEEN ? AND ? AND status IN ('LEAVE','EMERGENCY_LEAVE') AND week_type='STUDY'",Integer.class,studentId,monthStart,monthEnd);
          if(leaveDays!=null&&leaveDays>2)fineCategory="Exceeded Study Days Leave";
        }
      }
      if(fineCategory!=null){
        ResolvedFine resolved=resolveFinePolicy(fineCategory,date,weekType,0L);
        if(resolved.amount()>0){UUID fineId=UUID.randomUUID();int inserted=db.update("INSERT INTO fines(id,student_id,policy_id,category,reason,occurrence_date,entry_date,week_type,assessed_amount_pkr,policy_snapshot,created_by) VALUES(?,?,?,?,?,?,CURRENT_DATE,?,?,?::jsonb,?) ON CONFLICT(student_id,category,occurrence_date) WHERE status <> 'CANCELLED' DO NOTHING",fineId,studentId,resolved.policyId(),fineCategory,"Generated from attendance register",date,resolved.weekType(),resolved.amount(),json(resolved.snapshot()),p.userId());if(inserted>0){finesCreated++;audit(p,"ATTENDANCE_POLICY_FINE_CREATED","FINE",fineId,Map.of("studentId",studentId,"attendanceDate",date.toString(),"category",fineCategory,"amountPkr",resolved.amount()));}}
      }
    }
    audit(p,"ATTENDANCE_BULK_SAVED","ATTENDANCE",null,Map.of("count",n,"finesCreated",finesCreated));return Map.of("saved",n,"finesCreated",finesCreated);
  }

  @GetMapping("/notices") public List<Map<String,Object>> notices(org.springframework.security.core.Authentication a){
    PortalPrincipal p=p(a);String select="SELECT n.*,(SELECT af.file_id FROM announcement_files af WHERE af.announcement_id=n.id LIMIT 1) AS attachment_file_id,CASE WHEN ar.user_id IS NULL THEN false ELSE true END AS is_read FROM announcements n LEFT JOIN announcement_reads ar ON ar.announcement_id=n.id AND ar.user_id=? ";
    return admin(p)?db.queryForList(select+"ORDER BY n.created_at DESC",p.userId()):db.queryForList(select+"WHERE n.status='PUBLISHED' AND (n.publish_at IS NULL OR n.publish_at<=now()) AND (n.expires_at IS NULL OR n.expires_at>now()) ORDER BY n.publish_at DESC",p.userId());
  }
  @PostMapping("/notices") @Transactional public Map<String,Object> createNotice(@RequestBody Map<String,Object> in,org.springframework.security.core.Authentication a){
    PortalPrincipal p=p(a);requireAdmin(p);UUID id=UUID.randomUUID();
    java.sql.Date eventDate=in.get("eventDate")==null||String.valueOf(in.get("eventDate")).isBlank()?null:java.sql.Date.valueOf(LocalDate.parse(String.valueOf(in.get("eventDate"))));
    java.sql.Time start=in.get("startTime")==null||String.valueOf(in.get("startTime")).isBlank()?null:java.sql.Time.valueOf(java.time.LocalTime.parse(String.valueOf(in.get("startTime"))));
    java.sql.Time end=in.get("endTime")==null||String.valueOf(in.get("endTime")).isBlank()?null:java.sql.Time.valueOf(java.time.LocalTime.parse(String.valueOf(in.get("endTime"))));
    Object publish=in.get("publishAt")==null||String.valueOf(in.get("publishAt")).isBlank()?null:java.sql.Timestamp.valueOf(java.time.LocalDateTime.parse(String.valueOf(in.get("publishAt"))));
    Object expires=in.get("expiresAt")==null||String.valueOf(in.get("expiresAt")).isBlank()?null:java.sql.Timestamp.valueOf(java.time.LocalDateTime.parse(String.valueOf(in.get("expiresAt"))));
    db.update("INSERT INTO announcements(id,title,category,short_description,body,event_date,start_time,end_time,instructions,publish_at,expires_at,status,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,'DRAFT',?)",id,in.get("title"),in.getOrDefault("category","GENERAL"),in.get("shortDescription"),in.get("body"),eventDate,start,end,in.get("instructions"),publish,expires,p.userId());
    audit(p,"ANNOUNCEMENT_CREATED","ANNOUNCEMENT",id,in);return Map.of("id",id,"status","DRAFT");
  }
  @PatchMapping("/notices/{id}") @Transactional public Map<String,Object> updateNotice(@PathVariable UUID id,@RequestBody Map<String,Object> in,org.springframework.security.core.Authentication a){
    PortalPrincipal p=p(a);requireAdmin(p);
    Object eventDate=in.get("eventDate")==null?null:java.sql.Date.valueOf(LocalDate.parse(String.valueOf(in.get("eventDate"))));
    Object start=in.get("startTime")==null?null:java.sql.Time.valueOf(java.time.LocalTime.parse(String.valueOf(in.get("startTime"))));
    Object end=in.get("endTime")==null?null:java.sql.Time.valueOf(java.time.LocalTime.parse(String.valueOf(in.get("endTime"))));
    Object publish=in.get("publishAt")==null?null:java.sql.Timestamp.valueOf(java.time.LocalDateTime.parse(String.valueOf(in.get("publishAt"))));
    Object expires=in.get("expiresAt")==null?null:java.sql.Timestamp.valueOf(java.time.LocalDateTime.parse(String.valueOf(in.get("expiresAt"))));
    db.update("UPDATE announcements SET title=COALESCE(?,title),category=COALESCE(?,category),short_description=COALESCE(?,short_description),body=COALESCE(?,body),event_date=CASE WHEN ? THEN NULL ELSE COALESCE(?,event_date) END,start_time=CASE WHEN ? THEN NULL ELSE COALESCE(?,start_time) END,end_time=CASE WHEN ? THEN NULL ELSE COALESCE(?,end_time) END,instructions=COALESCE(?,instructions),status=COALESCE(?,status),publish_at=CASE WHEN ? THEN NULL ELSE COALESCE(?,publish_at) END,expires_at=CASE WHEN ? THEN NULL ELSE COALESCE(?,expires_at) END,updated_at=now() WHERE id=?",in.get("title"),in.get("category"),in.get("shortDescription"),in.get("body"),Boolean.TRUE.equals(in.get("clearEventDate")),eventDate,Boolean.TRUE.equals(in.get("clearStartTime")),start,Boolean.TRUE.equals(in.get("clearEndTime")),end,in.get("instructions"),in.get("status"),Boolean.TRUE.equals(in.get("clearPublishAt")),publish,Boolean.TRUE.equals(in.get("clearExpiresAt")),expires,id);
    if(in.get("attachmentFileId")!=null){UUID fileId=UUID.fromString(String.valueOf(in.get("attachmentFileId")));Integer valid=db.queryForObject("SELECT count(*) FROM private_files WHERE id=? AND purpose='ANNOUNCEMENT_ATTACHMENT'",Integer.class,fileId);if(valid==null||valid==0)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Announcement attachment is invalid.");db.update("INSERT INTO announcement_files(announcement_id,file_id) VALUES(?,?) ON CONFLICT(announcement_id,file_id) DO NOTHING",id,fileId);}
    audit(p,"ANNOUNCEMENT_UPDATED","ANNOUNCEMENT",id,in);return Map.of("updated",true);
  }
  @PostMapping("/notices/{id}/read") public Map<String,Object> markNoticeRead(@PathVariable UUID id,org.springframework.security.core.Authentication a){PortalPrincipal p=p(a);db.update("INSERT INTO announcement_reads(announcement_id,user_id) VALUES(?,?) ON CONFLICT DO NOTHING",id,p.userId());return Map.of("read",true);}

  @GetMapping("/expenses") public List<Map<String,Object>> expenses(org.springframework.security.core.Authentication a){PortalPrincipal p=p(a);requireAdmin(p);return db.queryForList("SELECT * FROM class_expenses ORDER BY expense_date DESC");}
  @PostMapping("/expenses") @Transactional public Map<String,Object> expense(@RequestBody Map<String,Object> in,org.springframework.security.core.Authentication a){PortalPrincipal p=p(a);requireAdmin(p);UUID id=UUID.randomUUID();db.update("INSERT INTO class_expenses(id,category,description,amount_pkr,expense_date,created_by) VALUES(?,?,?,?,?,?)",id,in.get("category"),in.get("description"),Long.valueOf(String.valueOf(in.get("amountPkr"))),LocalDate.parse(String.valueOf(in.get("expenseDate"))),p.userId());audit(p,"EXPENSE_CREATED","EXPENSE",id,in);return Map.of("id",id);}

  @GetMapping("/appeals") public List<Map<String,Object>> appeals(org.springframework.security.core.Authentication a){PortalPrincipal p=p(a);return admin(p)?db.queryForList("SELECT ap.*,s.roll_number,s.full_name FROM appeals ap JOIN students s ON s.id=ap.student_id ORDER BY ap.created_at DESC"):db.queryForList("SELECT * FROM appeals WHERE student_id=? ORDER BY created_at DESC",ownStudent(p));}
  @PostMapping("/appeals") @Transactional public Map<String,Object> createAppeal(@RequestBody Map<String,Object> in,org.springframework.security.core.Authentication a){PortalPrincipal p=p(a);UUID sid=ownStudent(p);UUID fineId=UUID.fromString(String.valueOf(in.get("fineId")));Integer owns=db.queryForObject("SELECT count(*) FROM fines WHERE id=? AND student_id=? AND status IN ('UNPAID','PARTIAL')",Integer.class,fineId,sid);if(owns==null||owns==0)throw new ResponseStatusException(HttpStatus.FORBIDDEN,"This fine cannot be appealed by this account.");if(in.get("proofFileId")==null)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Supporting proof is required.");UUID proofId=UUID.fromString(String.valueOf(in.get("proofFileId")));{Integer proofOk=db.queryForObject("SELECT count(*) FROM private_files WHERE id=? AND owner_student_id=? AND purpose='APPEAL_PROOF'",Integer.class,proofId,sid);if(proofOk==null||proofOk==0)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Appeal proof file is invalid.");}UUID id=UUID.randomUUID();db.update("INSERT INTO appeals(id,fine_id,student_id,reason,proof_file_id) VALUES(?,?,?,?,?)",id,fineId,sid,in.get("reason"),proofId);audit(p,"APPEAL_SUBMITTED","APPEAL",id,Map.of("fineId",fineId));return Map.of("id",id,"status","PENDING");}
  @PostMapping("/appeals/{id}/decision") @Transactional public Map<String,Object> decideAppeal(@PathVariable UUID id,@RequestBody Map<String,Object> in,org.springframework.security.core.Authentication a){
    PortalPrincipal p=p(a);requireAdmin(p);String status=String.valueOf(in.get("status")).toUpperCase();
    if(!List.of("APPROVED","REJECTED").contains(status))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid appeal decision.");
    var rows=db.queryForList("SELECT fine_id FROM appeals WHERE id=? AND status='PENDING' FOR UPDATE",id);
    if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Pending appeal not found.");
    UUID fineId=(UUID)rows.get(0).get("fine_id");
    var fine=db.queryForMap("SELECT assessed_amount_pkr,status FROM fines WHERE id=? FOR UPDATE",fineId);
    if("CANCELLED".equals(String.valueOf(fine.get("status"))))throw new ResponseStatusException(HttpStatus.CONFLICT,"Cancelled fine cannot be waived through an appeal.");
    db.update("UPDATE appeals SET status=?,decision_note=?,decided_by=?,decided_at=now() WHERE id=?",status,in.get("decisionNote"),p.userId(),id);
    if("APPROVED".equals(status)){
      Object amount=in.get("waiverAmountPkr");if(amount==null)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Approved appeal requires an explicit waiver amount.");
      long n=Long.parseLong(String.valueOf(amount));if(n<=0)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Waiver amount must be positive.");
      long paid=db.queryForObject("SELECT COALESCE(sum(amount_pkr),0) FROM fine_payments WHERE fine_id=?",Long.class,fineId);
      long waived=db.queryForObject("SELECT COALESCE(sum(amount_pkr),0) FROM fine_waivers WHERE fine_id=?",Long.class,fineId);
      long assessed=((Number)fine.get("assessed_amount_pkr")).longValue();if(n>assessed-paid-waived)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Waiver exceeds the remaining fine balance.");
      db.update("INSERT INTO fine_waivers(fine_id,amount_pkr,reason,approved_by) VALUES(?,?,?,?)",fineId,n,Objects.toString(in.get("waiverReason"),"Approved appeal"),p.userId());
      long totalWaived=waived+n;db.update("UPDATE fines SET status=?,updated_at=now() WHERE id=?",paid+totalWaived>=assessed?(totalWaived>0?"WAIVED":"PAID"):(paid>0?"PARTIAL":"UNPAID"),fineId);
    }
    audit(p,"APPEAL_"+status,"APPEAL",id,in);return Map.of("updated",true,"status",status);
  }
  @PostMapping("/fines/{id}/waive") @Transactional public Map<String,Object> waiveFine(@PathVariable UUID id,@RequestBody Map<String,Object> in,org.springframework.security.core.Authentication a){PortalPrincipal p=p(a);requireAdmin(p);var fine=db.queryForMap("SELECT assessed_amount_pkr,status FROM fines WHERE id=? FOR UPDATE",id);if("CANCELLED".equals(String.valueOf(fine.get("status"))))throw new ResponseStatusException(HttpStatus.CONFLICT,"Cancelled fines cannot be waived.");long amount=Long.parseLong(String.valueOf(in.get("amountPkr")));if(amount<=0)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Waiver must be positive.");long paid=db.queryForObject("SELECT COALESCE(sum(amount_pkr),0) FROM fine_payments WHERE fine_id=?",Long.class,id);long waived=db.queryForObject("SELECT COALESCE(sum(amount_pkr),0) FROM fine_waivers WHERE fine_id=?",Long.class,id);long assessed=((Number)fine.get("assessed_amount_pkr")).longValue();if(amount>assessed-paid-waived)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Total payments and waivers cannot exceed assessed amount.");db.update("INSERT INTO fine_waivers(fine_id,amount_pkr,reason,approved_by) VALUES(?,?,?,?)",id,amount,Objects.toString(in.get("reason"),"Admin waiver"),p.userId());long totalWaived=waived+amount;db.update("UPDATE fines SET status=?,updated_at=now() WHERE id=?",paid+totalWaived>=assessed?(totalWaived>0?"WAIVED":"PAID"):(paid>0?"PARTIAL":"UNPAID"),id);audit(p,"FINE_WAIVED","FINE",id,in);return Map.of("waived",true);}
  @GetMapping("/receipts/{id}") public Map<String,Object> receipt(@PathVariable UUID id,org.springframework.security.core.Authentication a){PortalPrincipal p=p(a);var rows=db.queryForList("SELECT fp.*,f.category,f.occurrence_date,s.roll_number,s.full_name FROM fine_payments fp JOIN fines f ON f.id=fp.fine_id JOIN students s ON s.id=fp.student_id WHERE fp.id=?",id);if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND);var r=rows.get(0);if(!admin(p)&&!p.studentId().equals(r.get("student_id")))throw new ResponseStatusException(HttpStatus.FORBIDDEN);return r;}

  @GetMapping("/admin/backup") public Map<String,Object> adminBackup(org.springframework.security.core.Authentication a){
    PortalPrincipal p=p(a);requireAdmin(p);
    List<Map<String,Object>> studentRows=db.queryForList("SELECT id,roll_number,full_name,class_name,academic_year,status,whatsapp_number_ciphertext,whatsapp_number_last4,created_at,updated_at FROM students ORDER BY roll_number");
    for(Map<String,Object> row:studentRows){byte[] encrypted=(byte[])row.remove("whatsapp_number_ciphertext");row.put("whatsapp_number",encrypted==null?null:phoneCrypto.decrypt(encrypted));}
    List<Map<String,Object>> users=db.queryForList("SELECT id,username,role,student_id,enabled,must_change_password,last_login_at,created_at FROM app_users ORDER BY created_at");
    List<Map<String,Object>> fineRows=db.queryForList("SELECT * FROM fines ORDER BY occurrence_date,created_at");
    for(Map<String,Object> fine:fineRows){UUID fineId=(UUID)fine.get("id");fine.put("payments",db.queryForList("SELECT id,student_id,amount_pkr,payment_method,reference_number,receipt_number,received_by,paid_at FROM fine_payments WHERE fine_id=? ORDER BY paid_at",fineId));fine.put("waivers",db.queryForList("SELECT id,amount_pkr,reason,approved_by,created_at FROM fine_waivers WHERE fine_id=? ORDER BY created_at",fineId));}
    Map<String,Object> out=new LinkedHashMap<>();out.put("application","KIPS College CSB-37 Fine & Governance Management Portal");out.put("backupCreatedAt",java.time.OffsetDateTime.now().toString());out.put("schemaVersion","1.0");
    out.put("students",studentRows);out.put("userAccounts",users);out.put("finePolicies",db.queryForList("SELECT * FROM fine_policies ORDER BY policy_key,effective_from"));out.put("classSchedule",db.queryForList("SELECT * FROM class_schedule ORDER BY starts_on,created_at"));out.put("attendance",db.queryForList("SELECT * FROM attendance ORDER BY attendance_date,student_id"));out.put("leaveApplications",db.queryForList("SELECT l.*,(SELECT lf.file_id FROM leave_application_files lf WHERE lf.leave_application_id=l.id) AS proof_file_id FROM leave_applications l ORDER BY submitted_at"));out.put("fines",fineRows);out.put("appeals",db.queryForList("SELECT * FROM appeals ORDER BY created_at"));out.put("classExpenses",db.queryForList("SELECT * FROM class_expenses ORDER BY expense_date"));out.put("announcements",db.queryForList("SELECT n.*,(SELECT af.file_id FROM announcement_files af WHERE af.announcement_id=n.id) AS attachment_file_id FROM announcements n ORDER BY created_at"));out.put("announcementReads",db.queryForList("SELECT * FROM announcement_reads ORDER BY read_at"));out.put("privateFileManifest",db.queryForList("SELECT id,owner_student_id,uploaded_by,purpose,storage_key,original_filename,content_type,size_bytes,sha256_hex,created_at FROM private_files ORDER BY created_at"));out.put("whatsappNotificationSnapshots",db.queryForList("SELECT id,student_id,event_type,destination_last4,status,statement_snapshot,created_at,sent_at,delivered_at FROM whatsapp_notifications ORDER BY created_at"));out.put("auditLogs",db.queryForList("SELECT * FROM audit_logs ORDER BY created_at"));
    audit(p,"DATABASE_BACKUP_EXPORTED","DATABASE",null,Map.of("students",studentRows.size(),"fines",fineRows.size()));
    return out;
  }

  @GetMapping("/audit") public List<Map<String,Object>> auditLogs(org.springframework.security.core.Authentication a){PortalPrincipal p=p(a);requireAdmin(p);return db.queryForList("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 500");}
  @GetMapping("/analytics/class") public Map<String,Object> analytics(org.springframework.security.core.Authentication a){PortalPrincipal p=p(a);requireAdmin(p);var totals=db.queryForMap("SELECT count(*) fine_count,COALESCE(sum(assessed_amount_pkr),0) assessed FROM fines WHERE status<>'CANCELLED'");return Map.of("totals",totals);}
}
