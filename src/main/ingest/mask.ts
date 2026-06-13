// Privacy: we never persist a full account number. Keep only the last 4 digits
// behind bullets so an account is recognizable without storing sensitive data.
export function maskAccountNumber(raw: string | undefined | null): string {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits.length < 4) return ''
  return '••••' + digits.slice(-4)
}
