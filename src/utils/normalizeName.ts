// Normaliza um nome para comparação: ignora maiúsculas/minúsculas, acentos e espaços extras.
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}
