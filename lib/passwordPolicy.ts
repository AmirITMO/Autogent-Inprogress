const COMMON_WEAK_PASSWORDS = new Set([
  "123456",
  "12345678",
  "1234567890",
  "password",
  "111111",
  "123123",
  "qwerty",
  "admin",
  "000000",
  "abc123",
  "letmein",
  "password1",
  "123321",
  "1q2w3e4r",
  "qwertyuiop",
  "iloveyou",
  "zxcvbn",
  "1234",
  "12345",
  "monkey",
  "dragon",
  "football",
  "414243",
]);

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return "Пароль должен быть не короче 8 символов";
  if (COMMON_WEAK_PASSWORDS.has(password.toLowerCase())) {
    return "Этот пароль слишком простой и уже встречается в утечках — выберите другой";
  }
  if (/^\d+$/.test(password)) return "Пароль не должен состоять только из цифр";
  return null;
}
