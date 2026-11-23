/** Operaciones de dinero en centavos para evitar errores de coma flotante. */
export const toCents = (amount: number): number => Math.round(amount * 100);
export const fromCents = (cents: number): number => Math.round(cents) / 100;
export const formatAmount = (amount: number): string => amount.toFixed(2);
