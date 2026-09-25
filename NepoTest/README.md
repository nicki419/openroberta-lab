# NepoTest

NepoTest runs unit tests for learners' NEPO programs for the Edison V2 robot:
1. A running Lab converts the program to EdPy and returns a source map with it.
2. The EdPy runs on a virtual robot.
3. The results come back in NEPO terms: function results, variables, executed action blocks with their NEPO values,
   runtime errors attributed to blocks, and block coverage.

Tests are JSON files (for test editors and AI generators, see `schema/`) or Python. It needs CPython 3.11+ and nothing
outside the standard library.

```bash
./ora.sh start-from-git                                    # from the repository root: a Lab built from this repository
cd NepoTest
python -m nepotest describe examples/clap_counter.xml      # program summary and test hints (JSON)
python -m nepotest run examples/clap_counter.tests.json    # run a test file (uses the cached bundle if current)
python -m unittest discover -s tests -t .                  # the framework's own tests
```

The full documentation is `docs/ai/nepo-unit-testing.md`. The engine underneath is described in
`docs/ai/edpy-test-engine.md`.
