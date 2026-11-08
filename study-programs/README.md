# The programs every new account gets

When an account is created in the Lab (`ClientUser` `createUser`), the server adds one program per `.xml` file in this
folder, named after the file, for the Edison (robot group `edison`), with the default configuration
(`OpenRobertaServer/.../persistence/StudyPrograms.java`). The folder is `study-programs` in the working directory, or
`STUDY_PROGRAMS_DIR` in `.env`. Without the folder, accounts get no programs.

| File | What it is |
|---|---|
| `Familiarisation.xml` | The familiarisation before the study. The code works as it is: the robot drives forward, slightly to the left (left 48 %, right 50 %), and in front of a wall it stops and sounds an alarm (880 Hz and 440 Hz, 200 ms each). Its Tests tab has one test, which passes. Its progress opens L0 (`levels/00-familiarisation`), which only this program plays. |
| `WithAI.xml`, `WithoutAI.xml` | The study's two blank programs, one per run. The level code is added when a level is played; its version is chosen per program in the Edit menu. |

Each file is the program's text as the Lab saves it: a `block_set` with the program, its test suite and the levels'
progress. `make.py` writes them. It needs the Lab and a headless Chrome of phase 5 (`PHASE5_PORTS=9333`), and it checks
that the familiarisation program beats L0 and that its test passes. Details: `docs/ai/nepo-levels.md`, "The
familiarisation".
