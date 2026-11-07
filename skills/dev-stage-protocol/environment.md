# Environment rules — for every agent that runs code

Loaded by `dev-stage-protocol` §2 for any stage that starts a process, a container or a database
(G7, G8, slice lanes, `/sdlc-debug`), and by `slice-mode.md` for each lane. These are the rules the
release-management lanes ran under from an ad-hoc brief; each one is there because breaking it
cost a lane its work or another lane's.

## 1. Processes

1. Kill a process **only by the PID you started**, recorded when you started it
   (`$!`, `Start-Process -PassThru`, `docker run` container id). Never by image name
   (`taskkill /IM node.exe`, `pkill node`, `killall go`, `Stop-Process -Name`) — that kills the
   other lanes, the editor's language servers and the user's own sessions.
2. Before ending a turn, stop every server you started, by its PID, and say so in the handback.
   A server left running holds its port, and the next lane's start fails with a message that
   blames the code.
3. Never stop or restart a process you did not start. A port already in use is reported, then
   the lane takes its next port (§2); it is not freed by killing whatever holds it.

## 2. Ports, containers, databases — one set per lane

1. Each lane, and each G8 run, gets its **own** ports, container names and database:
   `<project>-<lane>-pg` on its own port, `<db>_<lane>` as the database name. The orchestrator
   assigns them in the spawn prompt; a lane never picks one another lane has.
2. **Never touch a container, volume or database you did not start** — no `docker rm -f`, no
   `docker compose down`, no `DROP DATABASE`, no `docker system prune`. A shared-name container
   is someone else's evidence.
3. Remove only what you created, by its id or exact name, when your run is done and its logs are
   saved.
4. A preview the requester will look at is its own environment, seeded only with invented data:
   run `node <root>/scripts/data-guard.mjs --dump <preview dump>` before any review of it — G7 shots,
   G8, a requester's approval — because a session can type a real value into it (DEV-CONTRACTS §13.6).

## 3. Commit after each small step

Agents stall: a turn budget runs out, a tool hangs, a session is interrupted. Work that was not
committed is lost, and the next agent cannot tell what was done.

1. Commit after each task, or each step of a long task that leaves the tree building — not once at
   the end. `progress.md` is appended in the same commit.
2. A commit never includes another lane's files; stage by path, never `git add -A` in a shared tree.
3. Never push, rebase or force anything shared unless the human asked.

## 4. What this machine cannot run

Run `node <root>/scripts/doctor.mjs --capabilities --json` before G8. Each missing capability — a cgo C
compiler (`go test -race`), `psql`, a running Docker daemon — names the gates it defers. Record each
of those `NOT RUN` with the reason `<capability> missing on this machine; CI's <job> runs it`, never
`PASS`, never a silent omission. G9 then needs the CI proof (DEV-CONTRACTS §5.6). Do not install a
toolchain or change the machine to get round a missing one unless the human asked.

## 5. Checks that can run twice at once, and fail rather than skip

1. A project check script takes a lock (`flock /tmp/<project>-check.lock`) or a per-run database
   name (`${DB_NAME}_${RUN_ID}`, as the skeleton Taskfile does). Two checks sharing one database
   drop it under each other, and the failure names the wrong test (DEV-CONTRACTS §18.6).
2. In CI (`CI` set), a test whose required variable is unset **fails** with the variable's name; a
   skip is allowed only locally. A suite that skips in CI reports green for a gate that never ran.
