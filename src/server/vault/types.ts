// CredentialVault 가 주고받는 평문 shape.
// userId(사번) 는 schema 에서 평문 컬럼이지만 편의상 같은 객체에 담는다.
// loginId / password 만 AES-256-GCM 으로 암호화 후 저장된다.
export interface ErpCredential {
  userId: string;
  loginId: string;
  password: string;
}
