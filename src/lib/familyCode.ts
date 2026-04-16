const STORAGE_KEY = 'fm_family_code';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

export function getFamilyCode(): string {
  if (typeof window === 'undefined') return '';
  let code = localStorage.getItem(STORAGE_KEY);
  if (!code) {
    code = generateCode();
    localStorage.setItem(STORAGE_KEY, code);
  }
  return code;
}

export function setFamilyCode(code: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, code.toUpperCase());
}
