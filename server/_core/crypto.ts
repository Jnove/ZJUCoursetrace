import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

const ALGORITHM = "aes-256-gcm";

// 密钥从环境变量读取，32字节
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    console.warn("[Security] ENCRYPTION_KEY 未设置，使用临时密钥");
    return randomBytes(32); // 注意：每次重启会变，重启后无法解密旧数据
  }
  return Buffer.from(key.slice(0, 32), "utf-8");
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12); // GCM 推荐 12 字节
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf-8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag(); // GCM 认证标签，防篡改
  
  // 格式：iv(12) + authTag(16) + encrypted，全部用 hex 拼接
  return iv.toString("hex") + authTag.toString("hex") + encrypted.toString("hex");
}

export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(ciphertext.slice(0, 24), "hex");         // 12字节 = 24个hex字符
  const authTag = Buffer.from(ciphertext.slice(24, 56), "hex");   // 16字节 = 32个hex字符
  const encrypted = Buffer.from(ciphertext.slice(56), "hex");
  
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  return decipher.update(encrypted).toString("utf-8") + decipher.final("utf-8");
}