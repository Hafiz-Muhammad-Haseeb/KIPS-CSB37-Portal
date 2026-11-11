package com.kips.csb37.common;

import com.kips.csb37.security.PortalPrincipal;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.io.IOException;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;

@RestController
@RequestMapping("/api/files")
public class PrivateFileController {
  private final JdbcTemplate db; private final Path root;
  public PrivateFileController(JdbcTemplate db,@Value("${app.storage.directory:./private-uploads}") String dir){this.db=db;this.root=Paths.get(dir).toAbsolutePath().normalize();}
  @PostMapping(value="/upload",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
  public Map<String,Object> upload(@RequestParam("file") MultipartFile file,@RequestParam("purpose") String purpose,Authentication auth)throws Exception{
    PortalPrincipal p=(PortalPrincipal)auth.getPrincipal();
    if(file.isEmpty()||file.getSize()>5L*1024*1024)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"File must be between 1 byte and 5 MB.");
    String ct=Objects.toString(file.getContentType(),"");if(!List.of("application/pdf","image/jpeg","image/png").contains(ct))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Only PDF, JPG and PNG files are accepted.");
    byte[] signature=file.getBytes();boolean pdf=signature.length>=5&&signature[0]=='%'&&signature[1]=='P'&&signature[2]=='D'&&signature[3]=='F'&&signature[4]=='-';boolean jpg=signature.length>=3&&(signature[0]&0xff)==0xff&&(signature[1]&0xff)==0xd8&&(signature[2]&0xff)==0xff;boolean png=signature.length>=8&&(signature[0]&0xff)==0x89&&signature[1]=='P'&&signature[2]=='N'&&signature[3]=='G'&&(signature[4]&0xff)==0x0d&&(signature[5]&0xff)==0x0a&&(signature[6]&0xff)==0x1a&&(signature[7]&0xff)==0x0a;
    if(!(pdf&&"application/pdf".equals(ct))&&!(jpg&&"image/jpeg".equals(ct))&&!(png&&"image/png".equals(ct)))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"File content does not match an accepted PDF, JPG or PNG format.");
    String pur=purpose.toUpperCase();if(!List.of("LEAVE_PROOF","APPEAL_PROOF","ANNOUNCEMENT_ATTACHMENT").contains(pur))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid upload purpose.");
    if("STUDENT".equals(p.role())&&!List.of("LEAVE_PROOF","APPEAL_PROOF").contains(pur))throw new ResponseStatusException(HttpStatus.FORBIDDEN);
    byte[] bytes=signature;String sha=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));String key=UUID.randomUUID().toString();Files.createDirectories(root);Path target=root.resolve(key).normalize();if(!target.startsWith(root))throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
    Files.write(target,bytes,StandardOpenOption.CREATE_NEW);UUID id=UUID.randomUUID();
    db.update("INSERT INTO private_files(id,owner_student_id,uploaded_by,purpose,storage_key,original_filename,content_type,size_bytes,sha256_hex) VALUES(?,?,?,?,?,?,?,?,?)",id,p.studentId(),p.userId(),pur,key,Path.of(Objects.toString(file.getOriginalFilename(),"upload.bin")).getFileName().toString(),ct,file.getSize(),sha);
    return Map.of("id",id,"filename",file.getOriginalFilename(),"contentType",ct,"sizeBytes",file.getSize());
  }
  @GetMapping("/{id}") public void download(@PathVariable UUID id,Authentication auth,HttpServletResponse response)throws IOException{
    PortalPrincipal p=(PortalPrincipal)auth.getPrincipal();var rows=db.queryForList("SELECT owner_student_id,storage_key,original_filename,content_type FROM private_files WHERE id=?",id);if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND);
    var r=rows.get(0);Object owner=r.get("owner_student_id");
    if("STUDENT".equals(p.role())){
      boolean owns=owner!=null && owner.equals(p.studentId());
      Integer announcementLink=db.queryForObject("SELECT count(*) FROM announcement_files af JOIN announcements n ON n.id=af.announcement_id WHERE af.file_id=? AND n.status='PUBLISHED' AND (n.publish_at IS NULL OR n.publish_at<=now()) AND (n.expires_at IS NULL OR n.expires_at>now())",Integer.class,id);
      if(!owns && (announcementLink==null || announcementLink==0))throw new ResponseStatusException(HttpStatus.FORBIDDEN);
    }
    Path path=root.resolve(String.valueOf(r.get("storage_key"))).normalize();if(!path.startsWith(root)||!Files.exists(path))throw new ResponseStatusException(HttpStatus.NOT_FOUND);
    response.setContentType(String.valueOf(r.get("content_type")));response.setHeader("Content-Disposition","attachment; filename=\""+String.valueOf(r.get("original_filename")).replaceAll("[\\r\\n\"]","")+"\"");Files.copy(path,response.getOutputStream());
  }
}
