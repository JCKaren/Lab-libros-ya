/**
 * Validación visible de formularios. Los globos nativos del navegador no siempre se ven
 * (ni los leen los agentes de prueba como TestSprite), así que los formularios usan
 * noValidate y muestran un mensaje propio en la página.
 * Devuelve las etiquetas de los campos inválidos, los marca con aria-invalid y enfoca el primero.
 */
export function invalidFieldLabels(form: HTMLFormElement): string[] {
  const fields = Array.from(form.elements).filter(
    (el): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement => 'validity' in el && 'name' in el,
  );
  const invalid = fields.filter((el) => !el.validity.valid);
  fields.forEach((el) => (el.validity.valid ? el.removeAttribute('aria-invalid') : el.setAttribute('aria-invalid', 'true')));
  invalid[0]?.focus();
  return invalid.map((el) => form.querySelector(`label[for="${el.id}"]`)?.textContent?.trim() || el.name);
}

export type PasswordProblem = 'tooShort' | 'needsLettersAndNumbers' | 'containsEmail';

/** Misma política que el backend (passwordSchema + registerSchema). */
export function passwordProblem(password: string, email: string): PasswordProblem | null {
  if (password.length < 10) return 'tooShort';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'needsLettersAndNumbers';
  const local = email.split('@')[0]?.toLowerCase();
  if (local && password.toLowerCase().includes(local)) return 'containsEmail';
  return null;
}
