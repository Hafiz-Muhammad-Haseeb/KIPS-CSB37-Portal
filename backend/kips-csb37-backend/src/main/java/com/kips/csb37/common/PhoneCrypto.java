package com.kips.csb37.common;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.security.SecureRandom;
import java.util.Base64;

@Component
public class PhoneCrypto {
  private final byte[] key; private final SecureRandom random=new SecureRandom();
  public PhoneCrypto(@Value("${app.encryption.key:}") String encoded){
    if(encoded==null||encoded.isBlank()) key=null; else {key=Base64.getDecoder().decode(encoded);if(key.length!=32)throw new IllegalStateException("FIELD_ENCRYPTION_KEY must be base64 for exactly 32 bytes.");}
  }
  public byte[] encrypt(String value){if(value==null||value.isBlank())return null;if(key==null)throw new IllegalStateException("FIELD_ENCRYPTION_KEY is required before saving WhatsApp numbers.");try{byte[] iv=new byte[12];random.nextBytes(iv);Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,new SecretKeySpec(key,"AES"),new GCMParameterSpec(128,iv));byte[] encrypted=c.doFinal(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));byte[] out=new byte[iv.length+encrypted.length];System.arraycopy(iv,0,out,0,iv.length);System.arraycopy(encrypted,0,out,iv.length,encrypted.length);return out;}catch(Exception e){throw new IllegalStateException("Unable to encrypt WhatsApp number.",e);}}
  public String decrypt(byte[] value){if(value==null)return null;if(key==null)throw new IllegalStateException("FIELD_ENCRYPTION_KEY is required to read WhatsApp numbers.");try{byte[] iv=java.util.Arrays.copyOfRange(value,0,12);byte[] cipher=java.util.Arrays.copyOfRange(value,12,value.length);Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,new SecretKeySpec(key,"AES"),new GCMParameterSpec(128,iv));return new String(c.doFinal(cipher),java.nio.charset.StandardCharsets.UTF_8);}catch(Exception e){throw new IllegalStateException("Unable to decrypt WhatsApp number.",e);}}
}
