const STORAGE_KEY = 'fm_family_code';

export function getFamilyCode(): string {
  if (typeof window === 'undefined') return '';

  let code = localStorage.getItem(STORAGE_KEY);
  if (!code) {
    code = generateCode();
    localStorage.setItem(STORAGE_KEY, code);
  }
  return code;
}

export function setFamilyCode(code: string) {
  localStorage.setItem(STORAGE_KEY, code);
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
placeholder
