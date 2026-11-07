# Dangerous sinks, by language

A sink is where attacker-controlled data does damage. Grep for the sink, then trace each hit
backwards to a source (request, file, queue message, environment, LLM output). A sink fed only by
constants is not a finding. Semgrep's `p/default` covers most of these. This table is for reading
what it flagged and for what it does not see across files.

## Go

| Sink | Risk | Safe |
|---|---|---|
| `db.Query(fmt.Sprintf(...))`, `"... " + x` into `Query`/`Exec` | SQL injection | `$1` placeholders; sqlc |
| `exec.Command("sh", "-c", x)` | command injection | `exec.Command(bin, args...)` with fixed bin |
| `template.HTML(x)`, `text/template` for HTML | XSS | `html/template` with data |
| `http.Get(userURL)`, `http.Client` with no `CheckRedirect` | SSRF | allow-list + resolved-IP check |
| `filepath.Join(base, userPath)` then open | path traversal | `filepath.Rel` check, or `os.Root` (Go 1.24+) |
| `math/rand` for tokens | predictable token | `crypto/rand` |
| `==` on secrets or HMACs | timing leak | `subtle.ConstantTimeCompare`, `hmac.Equal` |
| `InsecureSkipVerify: true` | MITM | remove; pin the CA if needed |
| `json.Decoder` without `DisallowUnknownFields` on a bound model | mass assignment | a DTO, then map |
| `gob`/`yaml.Unmarshal` into `interface{}` from input | type confusion | typed target |

## Python

| Sink | Risk | Safe |
|---|---|---|
| `cursor.execute(f"...{x}")`, `.format`, `%` | SQL injection | `execute(sql, params)`; ORM filters |
| `subprocess.*(..., shell=True)`, `os.system`, `os.popen` | command injection | list argv, `shell=False` |
| `pickle.loads`, `yaml.load` (no `SafeLoader`), `marshal`, `shelve` | code execution | `json`; `yaml.safe_load` |
| `eval`, `exec`, `compile` on input | code execution | none. Redesign |
| `jinja2.Template(user)`, `render_template_string(user)` | SSTI | fixed template, user data as context |
| `Markup(x)`, `\|safe`, `autoescape=False` | XSS | default escaping |
| `requests.get(user_url)`, `urllib.urlopen` | SSRF | allow-list + resolved-IP check |
| `open(os.path.join(base, user))`, `send_file(user)` | traversal | `Path.resolve()` then `is_relative_to(base)` |
| `random` for tokens | predictable | `secrets` |
| `hashlib.md5/sha1` for passwords | weak hash | `argon2-cffi`, `bcrypt` |
| `xml.etree`, `lxml` on input | XXE, billion laughs | `defusedxml` |
| `DEBUG = True`, `ALLOWED_HOSTS = ['*']` | misconfiguration | per-environment settings |
| pydantic model with `extra="allow"` bound to ORM | mass assignment | explicit input schema |

## TypeScript / Node

| Sink | Risk | Safe |
|---|---|---|
| `` sql`...${x}` `` with a non-tagged client, `knex.raw(x)`, `$queryRawUnsafe` | SQL injection | tagged/parameterised API |
| `child_process.exec(x)`, `execSync` with interpolation | command injection | `execFile`/`spawn` with argv |
| `eval`, `new Function`, `vm.runInNewContext` on input | code execution | none |
| `dangerouslySetInnerHTML`, `innerHTML`, `document.write`, `v-html` | XSS | text nodes; DOMPurify with an allow-list |
| `href={user}`, `window.location = user` | `javascript:` XSS, open redirect | scheme allow-list; relative-path check |
| `Object.assign(target, req.body)`, `_.merge`, `{...req.body}` into a model | prototype pollution, mass assignment | DTO with zod/valibot, `Object.create(null)` |
| `fetch(userUrl)` server-side, Next.js `images.remotePatterns: **` | SSRF | allow-list |
| `path.join(root, user)` then `fs.readFile` | traversal | `path.resolve` + `startsWith(root + sep)` |
| `Math.random()` for ids or tokens | predictable | `crypto.randomUUID`, `randomBytes` |
| `jwt.verify(t, key)` without `algorithms` | alg confusion | `{ algorithms: ['RS256'] }` |
| Next.js server action or route handler without an auth check | function-level authz | check the session in every action; middleware is not enough |
| `NEXT_PUBLIC_*` holding a secret | secret shipped to the browser | server-only env |
| `cors({ origin: true, credentials: true })` | CSRF-ish cross-origin reads | explicit origin list |

## SQL and migrations

`SECURITY DEFINER` functions without a fixed `search_path`. `GRANT ALL` to the application role.
Row-level security declared but the app connecting as the table owner (RLS bypassed). Dynamic SQL
in `EXECUTE format(...)` without `%I`/`%L`. Seed migrations that create a default admin with a
known password.

## Shell, Docker, config

`curl … | sh`, `ADD http://…`, `USER root` (or no `USER`) in a runtime image, secrets in `ENV`
or `ARG`, `.env` committed, `chmod 777`, a base image by tag instead of digest (§18.2).
