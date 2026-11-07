// The token never leaves memory: no console, no URL, no web storage.
let current: string | null = null;
export async function signIn(email: string, password: string) {
  const res = await fetch('/v1/sign-in', { method: 'POST', body: JSON.stringify({ email, password }) });
  current = (await res.json()).token;
  console.info('signed in', email);
  localStorage.setItem('theme', 'light');
  window.location.href = '/home';
}
export const token = () => current;
