/**
 * CAS 登录密码加密用的纯 JS RSA 实现（无外部 crypto 依赖）。
 * 密文按公钥模长补零（不是写死 256）。
 */

export function rsaEncrypt(password: string, modulusHex: string, exponentHex: string): string {
  function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
    let r = 1n; base %= mod;
    while (exp > 0n) { if (exp & 1n) r = r * base % mod; exp >>= 1n; base = base * base % mod; }
    return r;
  }
  const m = BigInt("0x" + modulusHex);
  const e = BigInt("0x" + exponentHex);
  const hex = Array.from(new TextEncoder().encode(password))
    .map(b => b.toString(16).padStart(2, "0")).join("");
  return modPow(BigInt("0x" + hex), e, m)
    .toString(16).padStart(modulusHex.length, "0");
}
