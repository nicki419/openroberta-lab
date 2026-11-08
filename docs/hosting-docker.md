# Hosting the Lab in Docker

This guide was written on 2026-11-08 from the repository's files, and **it hasn't been run yet**: Docker Desktop
wasn't running on the machine it was written on. Try it once before the study.

## What runs where

- **The container** runs the Lab server (Java, Jetty, port 1999) with its embedded HSQLDB database.
- **Outside it**, the participants' browsers load Pyodide from a CDN for the Tests tab, and send Edison programs to
  Edison's compile service. The server calls DeepSeek and UCloud for the AI test assistant. Both the server and the
  browsers need internet access.
- **The study's data** lives in two Docker volumes: the database (accounts, programs, tests, level progress) and the
  telemetry (`.jsonl` files, one per participant).

## 1. Build the image

The image uses the repository's own standalone Dockerfile. It builds the server with Maven inside a container, then
copies it onto `openroberta/base-x64`. That base image carries the cross compilers of the other robots, which the
Edison doesn't use.

```bash
docker build -f Resources/dockerStandalone/Dockerfile -t ortb-lab .
```

- The first build downloads Maven's dependencies and takes several minutes.
- The browser code isn't built here: the image takes `OpenRobertaServer/staticResources` as it is in the working
  tree. After changing TypeScript, run `npx gulp` in `OpenRobertaWeb` before building.
- `.dockerignore` keeps `.env`, `admin/`, the local database, `evaluation/` and `.git` out of the build.

## 2. Write the settings

Copy `.env.example` to a file outside the repository, for example `study.env`, and fill it in:

- `DEEPSEEK_API_KEY` and `UCLOUD_API_KEY`;
- `AI_TESTS_DEFAULT`: whether the AI assistant is on for a learner who was never switched;
- `LEVEL_DESIGNER=false`.

Leave the paths (`LEVELS_DIR`, `LEVEL_TELEMETRY_DIR`, `STUDY_PROGRAMS_DIR`) at their defaults: they are relative to
the server's working directory in the container, `/opt/openroberta-lab`.

The server reads environment variables before `.env`, so `--env-file` is enough, and the keys never go into the
image. Anyone who can use Docker on the host can still read them with `docker inspect`.

## 3. Run it

From the root of the repository (the levels and the new-account programs are mounted from it):

```bash
docker run -d --name ortb-lab --restart unless-stopped -p 1999:1999 \
  --env-file /path/to/study.env \
  -v ortb-db:/opt/db \
  -v ortb-telemetry:/opt/openroberta-lab/admin/levelTelemetry \
  -v "$PWD/levels:/opt/openroberta-lab/levels:ro" \
  -v "$PWD/study-programs:/opt/openroberta-lab/study-programs:ro" \
  ortb-lab
```

- The first start creates an empty database in the `ortb-db` volume.
- Watch the start with `docker logs -f ortb-lab`, then open `http://<host>:1999`.
- In Git Bash on Windows, write the mounts as `"$(pwd -W)/levels:..."`. In PowerShell, use `"${PWD}/levels:..."`.
- **Check it:** create an account. It should get the programs Familiarisation, WithAI and WithoutAI. Familiarisation
  should open L0, and WithAI and WithoutAI should open L1.

## 4. Change levels or code

- **Levels:** edit the files in `levels/` and reload the page. The server reads the folder every time a page loads.
- **The new-account programs:** edit `study-programs/`. Only accounts created after the change get the new versions.
- **Code:** build the image again, then replace the container (`docker rm -f ortb-lab` and the `docker run` above).
  The volumes keep the accounts and the telemetry.

## 5. HTTPS

For participants on other machines, put a reverse proxy with HTTPS in front of port 1999, so passwords don't cross
the network in plain text. With Caddy, which also passes the Lab's WebSockets on:

```
lab.example.org {
    reverse_proxy localhost:1999
}
```

## 6. Back up

Copy the database only while the container is stopped:

```bash
docker stop ortb-lab
docker run --rm -v ortb-db:/data -v "$PWD:/backup" alpine tar czf /backup/ortb-db.tgz -C /data .
docker run --rm -v ortb-telemetry:/data -v "$PWD:/backup" alpine tar czf /backup/ortb-telemetry.tgz -C /data .
docker start ortb-lab
```

To restore, unpack the archives into empty volumes the same way (`tar xzf`) before starting the container.
