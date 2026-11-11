package com.kips.csb37.notifications;

import com.kips.csb37.security.PortalPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;

@RestController
@RequestMapping("/api/notifications")
public class WhatsAppController {
  private final JdbcTemplate db;
  private final com.kips.csb37.common.PhoneCrypto crypto;
  private final com.fasterxml.jackson.databind.ObjectMapper mapper;
  public WhatsAppController(JdbcTemplate db,com.kips.csb37.common.PhoneCrypto crypto,com.fasterxml.jackson.databind.ObjectMapper mapper){this.db=db;this.crypto=crypto;this.mapper=mapper;}

  @PostMapping("/whatsapp/statement") @Transactional
  public Map<String,Object> statement(@RequestBody Map<String,String> in,org.springframework.security.core.Authentication auth){
    PortalPrincipal p=(PortalPrincipal)auth.getPrincipal();
    if(!"ADMIN".equals(p.role()))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Administrator permission required.");
    UUID sid=UUID.fromString(in.get("studentId"));
    var students=db.queryForList("SELECT id,roll_number,full_name,class_name,academic_year,whatsapp_number_ciphertext,whatsapp_number_last4 FROM students WHERE id=? AND status='ACTIVE'",sid);
    if(students.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Student not found.");
    var student=students.get(0);
    var entries=db.queryForList("""
      SELECT f.id,f.category,f.reason,f.occurrence_date,f.week_type,f.assessed_amount_pkr,
      COALESCE((SELECT sum(amount_pkr) FROM fine_payments p WHERE p.fine_id=f.id),0) paid,
      COALESCE((SELECT sum(amount_pkr) FROM fine_waivers w WHERE w.fine_id=f.id),0) waived,f.status
      FROM fines f WHERE f.student_id=? ORDER BY f.occurrence_date,f.created_at
      """,sid);
    long assessed=0,paid=0,waived=0;
    StringBuilder msg=new StringBuilder("KIPS COLLEGE — CSB-37 COMPLETE FINE STATEMENT\n")
      .append("Student: ").append(student.get("full_name")).append("\n")
      .append("Roll: ").append(student.get("roll_number")).append("\n")
      .append("Class: ").append(Objects.toString(student.get("class_name"),"CSB-37")).append("\n")
      .append("Academic year: ").append(Objects.toString(student.get("academic_year"),"Not set")).append("\n\n");
    for(var e:entries){
      UUID fineId=(UUID)e.get("id");
      List<Map<String,Object>> paymentRows=db.queryForList("SELECT amount_pkr,paid_at,receipt_number,payment_method FROM fine_payments WHERE fine_id=? ORDER BY paid_at",fineId);
      e.put("payments",paymentRows);
      long a=((Number)e.get("assessed_amount_pkr")).longValue();
      long pay=((Number)e.get("paid")).longValue();
      long w=((Number)e.get("waived")).longValue();
      boolean cancelled="CANCELLED".equals(String.valueOf(e.get("status")));
      if(!cancelled){assessed+=a;paid+=pay;waived+=w;}
      long due=cancelled?0:a-pay-w;
      msg.append(e.get("occurrence_date")).append(" | ").append(e.get("category"))
        .append(" | ").append(Objects.toString(e.get("week_type"),"—"))
        .append(" | Assessed PKR ").append(a).append(" | Paid PKR ").append(pay)
        .append(" | Waived PKR ").append(w).append(" | Outstanding PKR ").append(due)
        .append(" | Status ").append(cancelled?"CANCELLED":(due==0?(w>0?"WAIVED":"PAID"):(pay>0?"PARTIAL":"UNPAID"))).append("\n");
      for(var payment:paymentRows){
        msg.append("   Payment: ").append(payment.get("paid_at")).append(" | PKR ").append(payment.get("amount_pkr"))
          .append(" | ").append(payment.get("payment_method")).append(" | Receipt ").append(payment.get("receipt_number")).append("\n");
      }
    }
    var attendance=db.queryForMap("""
      SELECT COUNT(*) FILTER (WHERE status IN ('LEAVE','EMERGENCY_LEAVE')) total_leaves,
      COUNT(*) FILTER (WHERE status='ABSENT') total_absences,
      COUNT(*) FILTER (WHERE status='EMERGENCY_LEAVE') emergency_leaves,
      COUNT(*) FILTER (WHERE status='ABSENT' AND week_type='TEST') test_absences,
      COUNT(*) FILTER (WHERE status='ABSENT' AND week_type='STUDY') study_absences,
      COUNT(*) FILTER (WHERE status IN ('LEAVE','EMERGENCY_LEAVE') AND week_type='TEST') test_leaves,
      COUNT(*) FILTER (WHERE status IN ('LEAVE','EMERGENCY_LEAVE') AND week_type='STUDY') study_leaves
      FROM attendance WHERE student_id=?
      """,sid);
    var applications=db.queryForMap("SELECT COUNT(*) FILTER (WHERE status='APPROVED') approved,COUNT(*) FILTER (WHERE status='REJECTED') rejected,COUNT(*) FILTER (WHERE status='PENDING') pending FROM leave_applications WHERE student_id=?",sid);
    msg.append("\nATTENDANCE & LEAVE SUMMARY\n")
      .append("Leaves: ").append(attendance.get("total_leaves")).append(" | Absences: ").append(attendance.get("total_absences"))
      .append(" | Emergency leaves: ").append(attendance.get("emergency_leaves")).append("\n")
      .append("Test-week leaves/absences: ").append(attendance.get("test_leaves")).append("/").append(attendance.get("test_absences"))
      .append(" | Study-week leaves/absences: ").append(attendance.get("study_leaves")).append("/").append(attendance.get("study_absences")).append("\n")
      .append("Leave applications — approved: ").append(applications.get("approved")).append(", rejected: ").append(applications.get("rejected")).append(", pending: ").append(applications.get("pending")).append("\n\n")
      .append("TOTAL ASSESSED: PKR ").append(assessed).append("\nTOTAL PAID: PKR ").append(paid)
      .append("\nTOTAL WAIVED: PKR ").append(waived).append("\nOUTSTANDING: PKR ").append(assessed-paid-waived)
      .append("\n\nThis statement is generated from the portal records. Please contact the class administrator for corrections.");

    byte[] encrypted=(byte[])student.get("whatsapp_number_ciphertext");
    if(encrypted==null)throw new ResponseStatusException(HttpStatus.CONFLICT,"No registered WhatsApp number is saved for this student.");
    String phone=crypto.decrypt(encrypted);String digits=phone.replaceAll("[^0-9]","");
    Map<String,Object> studentSnapshot=Map.of("rollNumber",student.get("roll_number"),"name",student.get("full_name"),"className",Objects.toString(student.get("class_name"),"CSB-37"),"academicYear",Objects.toString(student.get("academic_year"),""));
    Map<String,Object> snap=new LinkedHashMap<>();snap.put("student",studentSnapshot);snap.put("entries",entries);snap.put("attendanceSummary",attendance);snap.put("applicationSummary",applications);snap.put("assessedPkr",assessed);snap.put("paidPkr",paid);snap.put("waivedPkr",waived);snap.put("outstandingPkr",assessed-paid-waived);
    UUID id=UUID.randomUUID();
    try {
      String json=mapper.writeValueAsString(snap);
      db.update("INSERT INTO whatsapp_notifications(id,student_id,event_type,destination_last4,status,statement_snapshot,created_by) VALUES(?,?,?,?,'PREVIEW_READY',?::jsonb,?)",id,sid,in.getOrDefault("eventType","FULL_STATEMENT"),student.get("whatsapp_number_last4"),json,p.userId());
    } catch (com.fasterxml.jackson.core.JsonProcessingException ex) { throw new IllegalStateException("Unable to create statement snapshot.",ex); }
    String url="https://wa.me/"+digits+"?text="+java.net.URLEncoder.encode(msg.toString(),java.nio.charset.StandardCharsets.UTF_8);
    return Map.of("notificationId",id,"status","PREVIEW_READY","statement",snap,"phoneLast4",Objects.toString(student.get("whatsapp_number_last4"),""),"messageText",msg.toString(),"whatsappUrl",url,"note","Manual WhatsApp Web preview only. Open the link and press Send yourself.");
  }

  @GetMapping public List<Map<String,Object>> list(org.springframework.security.core.Authentication auth){
    PortalPrincipal p=(PortalPrincipal)auth.getPrincipal();
    return "ADMIN".equals(p.role())
      ?db.queryForList("SELECT id,student_id,event_type,destination_last4,status,attempt_count,created_at,sent_at,delivered_at FROM whatsapp_notifications ORDER BY created_at DESC")
      :db.queryForList("SELECT id,event_type,status,created_at FROM whatsapp_notifications WHERE student_id=? ORDER BY created_at DESC",p.studentId());
  }
}
