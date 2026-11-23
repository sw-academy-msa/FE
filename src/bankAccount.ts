/** 조회 응답의 마스킹 형식은 유지하고, 원문은 마지막 네 자리만 표시한다. */
export function maskedBankAccount(value = '') {
  if (value.includes('*')) return value;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 6 ? '*'.repeat(digits.length - 4) + digits.slice(-4) : '';
}
