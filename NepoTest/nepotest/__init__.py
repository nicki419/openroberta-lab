"""nepotest: unit tests for NEPO programs of the Edison V2.

The Lab converts the NEPO program to EdPy (with a source map); the engine runs that EdPy against a virtual robot; the
observer translates what happened back to NEPO blocks. See docs/ai/nepo-unit-testing.md.

    from nepotest import TestSubject, World
    subject = TestSubject.load('clap_counter.xml', bundle='clap_counter.bundle.json')   # converts with the Lab if needed
    assert subject.call('clampSpeed', 150).returned == 100
    run = subject.run(World().clap(1000).clap(2000).clap(3000))
    assert run.finished and run.variables['claps'] == 3
"""

from .lab import Bundle, LabClient, LabError
from .nepo import NepoProgram
from .spec import load_spec, run_spec, subject_for, validate_spec
from .subject import CallResult, ConversionError, Coverage, NepoError, ProgramRun, TestSubject
from .world import World

__all__ = ['TestSubject', 'World', 'CallResult', 'ProgramRun', 'Coverage', 'NepoError', 'ConversionError', 'NepoProgram',
           'LabClient', 'LabError', 'Bundle', 'load_spec', 'validate_spec', 'run_spec', 'subject_for']
