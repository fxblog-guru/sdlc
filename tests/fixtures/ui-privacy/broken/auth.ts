export async function signIn(email: string, password: string) {
  const res = await fetch('/v1/sign-in', { method: 'POST', body: JSON.stringify({ email, password }) });
  const { token } = await res.json();
  console.log('signed in', token);
  localStorage.setItem('access_token', token);
  window.location.href = `/home?token=${token}`;
  return token;
}
