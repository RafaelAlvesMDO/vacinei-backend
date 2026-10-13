// Aceita CPF com ou sem máscara (000.000.000-00) e devolve só os dígitos
export function normalizeCpf(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

// Termo de busca é CPF quando tem 11 dígitos, com ou sem máscara
export function isCpfLike(value: string): boolean {
  return /^\d{11}$/.test(value) || /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(value);
}

// Valida os dois dígitos verificadores e rejeita sequências repetidas (111.111.111-11)
export function isValidCpf(cpf: string): boolean {
  const digits = normalizeCpf(cpf);
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;

  const checkDigit = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i++) {
      sum += Number(digits[i]) * (length + 1 - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return checkDigit(9) === Number(digits[9]) && checkDigit(10) === Number(digits[10]);
}

// LGPD: expõe apenas os dígitos centrais do CPF (***.123.456-**)
export function maskCpf(cpf: string | null): string | null {
  const digits = cpf ? normalizeCpf(cpf) : '';
  if (digits.length !== 11) return null;
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}
